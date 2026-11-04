/**
 * Rivela ASE — Slack Socket Mode daemon entrypoint (Workstream B).
 *
 * Owns the socket that *receives* `/ase` slash commands, DMs/@mentions and
 * interactive-button events. Delivery (Signal Card pushes) uses the Slack Web
 * API and does not need this daemon.
 *
 * Slack credentials resolve from the per-org `slack_settings` DB row (set in
 * the Monitoring UI), falling back to .env. The daemon polls for config changes
 * and connects/reconnects LIVE when the user saves new tokens — no manual
 * restart needed. When unconfigured it idles on an interval (does not exit), so
 * it self-connects the moment the user adds tokens from the UI — and because it
 * never exits, it never triggers the supervisor's crash-restart loop.
 */
import { closePool, pool } from '../db/pool';
import { createRepos } from '../db/repos';
import type { Repos } from '../db/repo-types';
import { configKey, createSlackClient, resolveSlackConfig, type SlackClient } from './slack';

/** How often to re-read the DB for Slack config changes (ms). */
const POLL_INTERVAL_MS = 15_000;

/** Resolve the effective Slack config for the default (seeded) org. */
async function loadEffectiveConfig(repos: Repos) {
  const orgId = await repos.users.getDefaultOrganizationId();
  return resolveSlackConfig(repos, orgId ?? undefined);
}

/**
 * Safety nets: a stray async rejection from the Bolt / @slack/socket-mode
 * internals (e.g. `apps.connections.open` -> `invalid_auth`) fires AFTER
 * `await client.start()` has already settled and would otherwise surface as an
 * UNHANDLED PROMISE REJECTION, terminating the daemon with code 1 and tripping
 * the supervisor's crash-restart loop. These handlers keep the process alive so
 * the poll below can retry on a bad token.
 */
process.on('unhandledRejection', (reason) =>
  console.error('[slack] unhandledRejection (ignored, daemon stays alive):', reason),
);
process.on('uncaughtException', (err) =>
  console.error('[slack] uncaughtException (ignored, daemon stays alive):', err),
);

/** Build + start a Socket Mode daemon for the given config; returns the client. */
async function startDaemon(repos: Repos, cfg: Awaited<ReturnType<typeof resolveSlackConfig>>) {
  const client = createSlackClient({
    token: cfg.botToken,
    appToken: cfg.appToken,
    signingSecret: cfg.signingSecret,
    webAppUrl: cfg.webAppUrl,
    repos,
  });
  try {
    await client.start();
  } catch (err) {
    console.error('[slack] start failed (will retry):', err);
    return null;
  }
  return client;
}

/** Stop a running daemon (no-op when there is none). */
async function stopDaemon(current: SlackClient | null): Promise<void> {
  if (current !== null) {
    await current.stop();
  }
}

async function main(): Promise<void> {
  const repos = createRepos(pool);

  let current: SlackClient | null = null;
  let lastKey = '';

  const shutdown = (signal: string) => {
    console.log(`[slack] ${signal} — shutting down`);
    stopDaemon(current)
      .catch((err: unknown) => console.error('[slack] stop error', err))
      .finally(() => {
        closePool().finally(() => process.exit(0));
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Initial state: log whether we start connected or idle. When unconfigured we
  // idle (no socket) so the poll below can connect once the user adds tokens.
  const initial = await loadEffectiveConfig(repos);
  if (initial.botToken && initial.appToken) {
    try {
      current = await startDaemon(repos, initial);
      if (current) {
        lastKey = configKey(initial);
        console.log('[slack] Socket Mode daemon started');
      }
    } catch (err) {
      console.error('[slack] failed to start Socket Mode daemon:', err);
      // Keep polling so a fix (or corrected tokens) can reconnect.
    }
  } else {
    console.log('[slack] Slack not configured — idling (will connect when tokens are added)');
  }

  // Poll for config changes; connect / reconnect / tear down live.
  const poll = async () => {
    try {
      const cfg = await loadEffectiveConfig(repos);
      const key = configKey(cfg);
      const nowConfigured = Boolean(cfg.botToken && cfg.appToken);

      if (nowConfigured && (!current || key !== lastKey)) {
        // (Re)connect when tokens appear or change.
        console.log('[slack] config changed; (re)connecting');
        try {
          await stopDaemon(current);
          current = await startDaemon(repos, cfg);
          if (current) {
            lastKey = key;
            console.log('[slack] Socket Mode daemon connected');
          }
        } catch (err) {
          console.error('[slack] connect failed (will retry):', err);
          // lastKey intentionally NOT updated -> retry on next tick.
        }
      } else if (!nowConfigured && current) {
        // Tokens were cleared — tear down and idle.
        console.log('[slack] Slack tokens cleared — daemon idle');
        await stopDaemon(current);
        current = null;
        lastKey = '';
      }
    } catch (err) {
      console.error('[slack] config poll failed:', err);
    }
  };
  setInterval(poll, POLL_INTERVAL_MS);
}

main();
