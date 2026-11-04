/**
 * Rivela ASE — Slack integration (Workstream B).
 *
 * A real Slack app via @slack/bolt in Socket Mode that:
 *   (1) pushes rich Block Kit Signal Cards when a slack-channel alert rule matches,
 *   (2) responds to `/ase` slash commands and direct mentions/messages, and
 *   (3) handles interactive buttons (Mute rule) that resolve into the web app.
 *
 * It degrades to a safe NO-OP whenever `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`
 * are not both set — no network at import time, no crash — so the pipeline and
 * the test suite never depend on Slack. Delivery uses the Slack Web API (no
 * Socket Mode socket required to *post*); the Socket Mode daemon is only
 * started by the standalone entrypoint (`slack-standalone.ts`) to *receive*
 * slash commands / interactivity. Everything is mock-testable via an injectable
 * transport and an explicit `repos` argument to `postSlackAlert`.
 */
import { App, type SayFn } from '@slack/bolt';
import type { KnownBlock } from '@slack/types';
import { config } from '../config';
import type { Repos } from '../db/repo-types';
import type { AlertRule, SignalDetail, SlackRuntimeConfig } from '../types/domain';
import {
  buildHelpBlocks,
  buildSignalCardBlocks,
  buildSignalsSummaryBlocks,
  buildStatusBlocks,
  parseActionId,
  type Blocks,
} from './slack-blocks';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SlackPostResult {
  status: 'delivered' | 'failed';
  ts?: string;
  permalink?: string;
  error?: string;
}

interface SlackMessageOutcome {
  ok: boolean;
  ts?: string;
  permalink?: string;
  error?: string;
}

interface SlackChannel {
  id: string;
  name?: string;
}

/** Injectable transport so Slack can be unit-tested without a live workspace. */
export interface PostTransport {
  postMessage(
    channel: string,
    payload: { text?: string; blocks?: Blocks },
  ): Promise<SlackMessageOutcome>;
  conversationsList?(): Promise<SlackChannel[]>;
}

export interface SlackClientOptions {
  token?: string;
  appToken?: string;
  signingSecret?: string;
  webAppUrl?: string;
  transport?: PostTransport;
  /** Needed by the `/ase` command + interactive handlers. */
  repos?: Repos;
}

export interface SlackClient {
  readonly isConfigured: boolean;
  isNoop(): boolean;
  postMessage(
    channel: string,
    payload: { text?: string; blocks?: Blocks },
  ): Promise<SlackPostResult>;
  resolveChannel(target: string): Promise<string | null>;
  /** Start the Socket Mode daemon (receives commands/interactivity). No-op is safe. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// No-op transport + client (unconfigured)
// ---------------------------------------------------------------------------

const NOOP_OUTCOME: SlackMessageOutcome = { ok: false, error: 'slack_not_configured' };

const noopTransport: PostTransport = {
  async postMessage() {
    return NOOP_OUTCOME;
  },
  async conversationsList() {
    return [];
  },
};

// ---------------------------------------------------------------------------
// Bolt transport (real Slack Web API behind the injectable transport shape)
// ---------------------------------------------------------------------------

function createBoltTransport(app: App): PostTransport {
  return {
    async postMessage(channel, payload) {
      try {
        const blocks =
          payload.blocks !== undefined ? (payload.blocks as unknown as KnownBlock[]) : undefined;
        const message: Record<string, unknown> = { channel };
        if (payload.text !== undefined) message.text = payload.text;
        if (blocks !== undefined) message.blocks = blocks;
        const res = await app.client.chat.postMessage(
          message as unknown as Parameters<typeof app.client.chat.postMessage>[0],
        );
        if (!res.ok) return { ok: false, error: res.error ?? 'slack_post_failed' };
        let permalink = '';
        try {
          const p = await app.client.chat.getPermalink({
            channel,
            message_ts: res.ts as string,
          });
          permalink = p?.permalink ?? '';
        } catch {
          // Permalink lookup is best-effort; the ts is authoritative.
        }
        return { ok: true, ts: res.ts as string | undefined, permalink };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'slack_post_failed' };
      }
    },
    async conversationsList() {
      try {
        const res = await app.client.conversations.list({ types: 'public_channel' });
        return (res.channels ?? []).map((c) => ({ id: c.id ?? '', name: c.name }));
      } catch {
        return [];
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Client (composed from a transport + optional start/stop lifecycle)
// ---------------------------------------------------------------------------

interface ClientLifecycle {
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
}

function composeClient(
  transport: PostTransport,
  configured: boolean,
  lifecycle: ClientLifecycle = {},
): SlackClient {
  return {
    isConfigured: configured,
    isNoop: () => !configured,
    async postMessage(channel, payload) {
      const out = await transport.postMessage(channel, payload);
      if (!out.ok) return { status: 'failed', error: out.error ?? 'slack_post_failed' };
      return { status: 'delivered', ts: out.ts, permalink: out.permalink };
    },
    async resolveChannel(target) {
      const trimmed = target.trim().replace(/^#/, '');
      if (/^[A-Z0-9]{6,}$/.test(trimmed)) return trimmed; // already a channel id
      try {
        const channels = (await transport.conversationsList?.()) ?? [];
        return channels.find((c) => c.name === trimmed)?.id ?? null;
      } catch {
        return null;
      }
    },
    async start() {
      await lifecycle.start?.();
    },
    async stop() {
      await lifecycle.stop?.();
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a Slack client. When both tokens are absent, returns a typed no-op
 * whose methods resolve failed without touching the network. When `transport`
 * is injected (tests), it is used instead of a live Bolt app. Otherwise a Bolt
 * app is constructed and wired (Socket Mode daemon started only via start()).
 */
export function createSlackClient(deps: SlackClientOptions = {}): SlackClient {
  const configured = Boolean(deps.token && deps.appToken);
  if (!configured) {
    return composeClient(noopTransport, false);
  }

  if (deps.transport !== undefined) {
    return composeClient(deps.transport, true);
  }

  const app = new App({
    token: deps.token,
    appToken: deps.appToken,
    socketMode: true,
    signingSecret: deps.signingSecret,
  });
  const transport = createBoltTransport(app);
  registerSlackHandlers(app, { ...deps, webAppUrl: deps.webAppUrl ?? config.ASE_WEB_APP_URL });
  return composeClient(transport, true, {
    start: async () => {
      await app.start();
    },
    stop: async () => {
      await app.stop();
    },
  });
}

let slackSingleton: SlackClient | undefined;

/** Lazy singleton for the engine/pipeline. Degrades to a no-op when unconfigured. */
export function getSlack(): SlackClient {
  if (slackSingleton === undefined) {
    slackSingleton = createSlackClient({
      token: config.SLACK_BOT_TOKEN,
      appToken: config.SLACK_APP_TOKEN,
      signingSecret: config.SLACK_SIGNING_SECRET,
      webAppUrl: config.ASE_WEB_APP_URL,
    });
  }
  return slackSingleton;
}

// ---------------------------------------------------------------------------
// Runtime (per-org, DB-backed) Slack config — so tokens set in the UI take
// effect immediately without an engine restart. Resolves DB slack_settings
// (falling back to .env), and caches clients by a hash of the effective config.
// ---------------------------------------------------------------------------

/** Resolve the effective runtime config: DB (per-org) wins, else .env defaults. */
export async function resolveSlackConfig(
  repos: Repos | undefined,
  orgId: string | undefined,
): Promise<SlackRuntimeConfig> {
  const fallback: SlackRuntimeConfig = {
    botToken: config.SLACK_BOT_TOKEN,
    appToken: config.SLACK_APP_TOKEN,
    signingSecret: config.SLACK_SIGNING_SECRET,
    defaultChannel: config.SLACK_DEFAULT_CHANNEL,
    webAppUrl: config.ASE_WEB_APP_URL,
  };
  if (repos !== undefined && orgId !== undefined) {
    try {
      const s = await repos.slackSettings.get(orgId);
      if (s !== null) {
        return {
          botToken: s.botToken,
          appToken: s.appToken,
          signingSecret: s.signingSecret,
          defaultChannel: s.defaultChannel || fallback.defaultChannel,
          webAppUrl: s.webAppUrl || fallback.webAppUrl,
        };
      }
    } catch (err) {
      // DB read failed — fall through to env config; delivery is best-effort.
      console.error('[slack] resolveSlackConfig DB read failed; using .env fallback', err);
    }
  }
  return fallback;
}

function configKey(cfg: SlackRuntimeConfig): string {
  return [cfg.botToken, cfg.appToken, cfg.signingSecret, cfg.defaultChannel, cfg.webAppUrl].join(
    '|',
  );
}
export { configKey };

const clientCache = new Map<string, SlackClient>();

/** Get (or lazily build) a Slack client for the effective config for an org. */
export async function getSlackForRepos(repos: Repos, orgId: string): Promise<SlackClient> {
  const cfg = await resolveSlackConfig(repos, orgId);
  const key = configKey(cfg);
  const existing = clientCache.get(key);
  if (existing !== undefined) return existing;
  const client = createSlackClient({
    token: cfg.botToken,
    appToken: cfg.appToken,
    signingSecret: cfg.signingSecret,
    webAppUrl: cfg.webAppUrl,
  });
  clientCache.set(key, client);
  return client;
}

/** Rebuild the cached clients after a config change (used by the standalone poll). */
export function clearSlackClientCache(): void {
  clientCache.clear();
}

// ---------------------------------------------------------------------------
// Alert wrapper — post a Signal Card + record the delivery log. Never throws.
// ---------------------------------------------------------------------------

export interface PostSlackAlertDeps {
  client?: SlackClient;
  repos?: Repos;
  webAppUrl?: string;
}

/**
 * Post a Block Kit Signal Card for a slack-channel rule and record the delivery
 * log on the notification (schema 003). Best-effort: never throws out of the
 * caller; failures are recorded via `repos.notifications.markDelivered`.
 */
export async function postSlackAlert(
  notificationId: string,
  rule: AlertRule,
  signalDetail: SignalDetail,
  channelTarget: string,
  deps: PostSlackAlertDeps = {},
): Promise<SlackPostResult> {
  const { repos } = deps;
  // Resolve the effective config (DB per-org wins over .env) so tokens saved in
  // the UI take effect for delivery immediately, without an engine restart.
  const cfg = await resolveSlackConfig(repos, signalDetail.organizationId);
  const webAppUrl = deps.webAppUrl ?? cfg.webAppUrl;
  const client =
    deps.client ??
    (repos !== undefined ? await getSlackForRepos(repos, signalDetail.organizationId) : getSlack());

  const fail = async (error: string): Promise<SlackPostResult> => {
    if (repos !== undefined) {
      await repos.notifications.markDelivered(notificationId, {
        slackTs: '',
        permalink: '',
        deliveredAt: new Date().toISOString(),
        status: 'failed',
        error,
      });
    }
    return { status: 'failed', error };
  };

  if (!client.isConfigured) return fail('slack_not_configured');

  const channel = await client.resolveChannel(channelTarget);
  if (channel === null) return fail('channel_resolution_failed');

  const blocks = buildSignalCardBlocks(signalDetail, webAppUrl, rule.id);
  const text = `[${rule.name}] ${signalDetail.competitorName}: ${
    signalDetail.keyFacts[0] ?? signalDetail.rawText.slice(0, 140)
  }`;

  let posted: SlackPostResult;
  try {
    posted = await client.postMessage(channel, { text, blocks });
  } catch {
    return fail('slack_post_failed');
  }

  if (posted.status === 'delivered') {
    if (repos !== undefined) {
      await repos.notifications.markDelivered(notificationId, {
        slackTs: posted.ts ?? '',
        permalink: posted.permalink ?? '',
        deliveredAt: new Date().toISOString(),
        status: 'delivered',
        error: null,
      });
    }
    return posted;
  }
  return fail(posted.error ?? 'slack_post_failed');
}

// ---------------------------------------------------------------------------
// Command / message / action handlers (only wired on a live Bolt app)
// ---------------------------------------------------------------------------

async function gatherStatus(repos: Repos): Promise<Record<string, string | number>> {
  const orgId = await repos.users.getDefaultOrganizationId();
  if (orgId === null) return { status: 'no_org_configured' };
  const competitors = await repos.competitors.list(orgId);
  const rules = await repos.alertRules.list(orgId);
  const signalCards = await repos.signals.listRouted('signal_card', 5);
  const notifications = await repos.notifications.list(orgId, 25);
  return {
    status: 'ok',
    competitors: competitors.length,
    rules: rules.length,
    signal_cards: signalCards.length,
    unread: notifications.filter((n) => n.readAt === null).length,
  };
}

async function gatherSignals(
  repos: Repos,
  competitor?: string,
  filter?: string,
): Promise<{ id: string; title: string; score: number; competitor: string }[]> {
  const orgId = await repos.users.getDefaultOrganizationId();
  if (orgId === null) return [];

  let competitorId: string | undefined;
  if (competitor !== undefined && competitor.length > 0) {
    const found = (await repos.competitors.list(orgId)).find(
      (c) => c.name.toLowerCase() === competitor.toLowerCase(),
    );
    competitorId = found?.id;
  }

  const page = await repos.signals.list(
    {
      organizationId: orgId,
      competitorId,
      minSignificance: filter === 'high' ? 7 : undefined,
    },
    { limit: 10, cursor: null },
  );
  return page.items.map((s) => ({
    id: s.id,
    title: s.keyFacts[0] ?? s.rawText.slice(0, 120),
    score: s.significanceScore,
    competitor: s.competitorName,
  }));
}

async function handleCommandText(
  text: string,
  say: SayFn,
  deps: { repos: Repos; webAppUrl: string },
): Promise<void> {
  const sayBlocks = (blocks: Blocks): Promise<unknown> =>
    say({ blocks: blocks as unknown as KnownBlock[] });

  const [sub = '', ...rest] = text.trim().split(/\s+/);
  switch (sub.toLowerCase()) {
    case 'status': {
      const result = await gatherStatus(deps.repos);
      await sayBlocks(buildStatusBlocks(result));
      break;
    }
    case 'signals': {
      const [competitor, filter] = rest;
      const items = await gatherSignals(deps.repos, competitor, filter);
      await sayBlocks(buildSignalsSummaryBlocks(items, deps.webAppUrl));
      break;
    }
    case 'help':
    default:
      await sayBlocks(buildHelpBlocks());
      break;
  }
}

/** Wire Bolt handlers: /ase command, DMs + @mention, and the Mute rule button. */
function registerSlackHandlers(app: App, deps: SlackClientOptions & { webAppUrl: string }): void {
  const { repos } = deps;
  const { webAppUrl } = deps;

  app.command('/ase', async ({ command, ack, say }) => {
    await ack();
    if (repos !== undefined) {
      await handleCommandText(command.text ?? '', say, { repos, webAppUrl });
    } else {
      await say({ blocks: buildHelpBlocks() as unknown as KnownBlock[] });
    }
  });

  // DM + command-prefixed replies. Direct messages only — a generic message in a
  // shared channel that merely STARTS with "status"/"help"/"signals" must not
  // trigger the bot (mentions are handled separately by app_mention). The
  // message payload carries `channel_type === 'im'` for direct messages.
  app.message(/^(ase|help|status|signals)\b/i, async ({ message, say }) => {
    if (repos === undefined) return;
    const payload = message as { channel_type?: string; text?: string };
    if (payload.channel_type !== 'im') return;
    const text = payload.text ?? '';
    await handleCommandText(text, say, { repos, webAppUrl });
  });

  app.event('app_mention', async ({ event, say }) => {
    if (repos === undefined) return;
    // Strip the <@U123> mention prefix from the message text.
    const text = (event.text ?? '').replace(/<@[A-Z0-9]+>/g, '').trim();
    await handleCommandText(text, say, { repos, webAppUrl });
  });

  app.action(/^mute_rule:/, async ({ action, ack, respond }) => {
    await ack();
    const parsed = parseActionId((action as { action_id?: string }).action_id ?? '');
    if (parsed.kind !== 'mute_rule') return;
    if (repos === undefined) {
      await respond({ text: 'Mute rule requires the ASE engine to be connected.' });
      return;
    }
    await repos.alertRules.update(parsed.ruleId, { enabled: false });
    await respond({
      text: `Alert rule disabled (${parsed.ruleId}). You can re-enable it in the web app.`,
    });
  });

  // Open signal / View battlecard are link buttons (url) — Slack opens them
  // directly, so no interactive handler is required. They resolve in the web app.
}
