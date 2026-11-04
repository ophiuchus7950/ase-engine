/**
 * Rivela ASE — pure Block Kit builders (Workstream B).
 *
 * These functions build Slack Block Kit payloads with NO network I/O, so they
 * are unit-testable without a live workspace. They are the only place that
 * shapes the JSON `blocks` array for Slack alerts, help/status cards and
 * signal summaries.
 *
 * Blocks are typed loosely (`Record<string, unknown>[]`) so this module does
 * not couple to a specific @slack/types block-kit revision; the payloads are
 * valid Slack JSON either way.
 *
 * Action IDs are compound strings (`open_signal:<id>`) parsed back by
 * `parseActionId` — unknown ids are ignored (never throw).
 */
import type { SignalDetail } from '../types/domain';

export type Block = Record<string, unknown>;
export type Blocks = Block[];

export type SignalCardAction = { kind: 'open_signal'; signalId: string };
export type SlotlessAction =
  { kind: 'view_battlecard'; competitorId: string } | { kind: 'mute_rule'; ruleId: string };

export type ParsedAction = SignalCardAction | SlotlessAction | { kind: 'unknown' };

export const ACTION_OPEN_SIGNAL = 'open_signal';
export const ACTION_VIEW_BATTLECARD = 'view_battlecard';
export const ACTION_MUTE_RULE = 'mute_rule';

function linkButton(text: string, url: string): Block {
  return {
    type: 'button',
    text: { type: 'plain_text', text },
    url,
  };
}

function actionButton(actionId: string, text: string, style?: 'primary' | 'danger'): Block {
  return {
    type: 'button',
    text: { type: 'plain_text', text },
    action_id: actionId,
    ...(style !== undefined ? { style } : {}),
  };
}

/**
 * Rich Signal Card shown for a routed `signal_card` alert. Includes the
 * competitor, action type, significance score, key facts and the source link,
 * plus interactive buttons that resolve to the web app. When `ruleId` is given
 * a "Mute rule" button is added that disables that alert rule.
 */
export function buildSignalCardBlocks(
  signalDetail: SignalDetail,
  webAppUrl: string,
  ruleId?: string | null,
): Blocks {
  const openUrl = `${webAppUrl.replace(/\/+$/, '')}/signals/${signalDetail.id}`;
  const battlecardUrl = `${webAppUrl.replace(/\/+$/, '')}/competitors/${signalDetail.competitorId}`;

  const blocks: Blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🚨 Signal: ${signalDetail.competitorName}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Action type:*\n${signalDetail.actionType.replace(/_/g, ' ')}` },
        { type: 'mrkdwn', text: `*Significance:*\n${signalDetail.significanceScore}/10` },
        { type: 'mrkdwn', text: `*Confidence:*\n${signalDetail.confidenceLevel}` },
        { type: 'mrkdwn', text: `*Routing:*\n${signalDetail.routingDecision.replace(/_/g, ' ')}` },
      ],
    },
  ];

  if (signalDetail.keyFacts.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Key facts*\n${signalDetail.keyFacts.map((fact) => `• ${fact}`).join('\n')}`,
      },
    });
  }

  if (signalDetail.sourceUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${signalDetail.sourceUrl}|Source link>`,
      },
    });
  }

  const elements: Block[] = [
    linkButton('Open signal', openUrl),
    linkButton('View battlecard', battlecardUrl),
  ];
  if (ruleId !== undefined && ruleId !== null && ruleId.length > 0) {
    elements.push(actionButton(`${ACTION_MUTE_RULE}:${ruleId}`, 'Mute rule', 'danger'));
  }
  blocks.push({ type: 'actions', elements });

  return blocks;
}

/** Help card shown for `/ase help`, unknown commands and direct messages. */
export function buildHelpBlocks(): Blocks {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*Rivela ASE — Slack intelligence bot*\n' +
          'Here is what I can do. Use `/ase <command>` or message me directly.',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '• `/ase status` — pipeline health + recent counts\n' +
          '• `/ase signals [competitor] [filter]` — recent / high-signal summary\n' +
          '• `/ase help` — this card',
      },
    },
  ];
}

/**
 * Pipeline status card. `result` is an opaque record of name -> value shown as
 * key/value fields so it stays shape-free and unit-testable.
 */
export function buildStatusBlocks(result: Record<string, string | number>): Blocks {
  const fields = Object.entries(result).map(([label, value]): Block => ({
    type: 'mrkdwn',
    text: `*${label}:* ${String(value)}`,
  }));

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊 ASE pipeline status' },
    },
    {
      type: 'section',
      fields,
    },
  ];
}

/** Signal summary card. Each item is a title + score + link. */
export function buildSignalsSummaryBlocks(
  items: { id: string; title: string; score: number; competitor: string }[],
  webAppUrl: string,
): Blocks {
  if (items.length === 0) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'No signals found for that query.' },
      },
    ];
  }

  const base = webAppUrl.replace(/\/+$/, '');
  const text = items
    .map(
      (item) =>
        `• <${base}/signals/${item.id}|${item.title}> — *${item.score}/10* (${item.competitor})`,
    )
    .join('\n');

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Recent signals*\n${text}`,
      },
    },
  ];
}

/**
 * Parse an incoming Slack `action_id` into a typed action. Unknown ids
 * return `{ kind: 'unknown' }` (never throws).
 */
export function parseActionId(actionId: string): ParsedAction {
  const [kind, rawId] = actionId.split(':');
  if (rawId === undefined || rawId.length === 0) return { kind: 'unknown' };
  switch (kind) {
    case ACTION_OPEN_SIGNAL:
      return { kind: 'open_signal', signalId: rawId };
    case ACTION_VIEW_BATTLECARD:
      return { kind: 'view_battlecard', competitorId: rawId };
    case ACTION_MUTE_RULE:
      return { kind: 'mute_rule', ruleId: rawId };
    default:
      return { kind: 'unknown' };
  }
}
