/**
 * Rivela ASE — Slack module tests (Workstream B).
 *
 * Uses an injected fake transport + a mock repo so nothing touches a live Slack
 * workspace or network. Verifies: no-op when unconfigured; successful posts call
 * markDelivered with ts/permalink; failures record the error.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Repos } from '../db/repo-types';
import type { AlertRule, SignalDetail } from '../types/domain';
import { createSlackClient, postSlackAlert, type PostTransport, type SlackClient } from './slack';

function makeSignal(): SignalDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    rawSignalId: '22222222-2222-4222-8222-222222222222',
    organizationId: '33333333-3333-4333-8333-333333333333',
    competitorId: '44444444-4444-4444-8444-444444444444',
    actionType: 'pricing',
    confidenceLevel: 'high',
    keyFacts: ['Enterprise plan now $99 per user'],
    llmModelUsed: 'test-model',
    classifiedAt: null,
    scoreRecency: 5,
    scoreSourceAuthority: 5,
    scoreActionType: 5,
    scoreIcpRelevance: 5,
    scoreDealStageContext: 5,
    scoreNovelty: 5,
    significanceScore: 9,
    scoredAt: null,
    routingDecision: 'signal_card',
    battlecardUpdateTriggered: true,
    dealAlertCheckTriggered: true,
    routedAt: null,
    bookmarked: false,
    createdAt: '2026-07-30T10:00:00.000Z',
    rawText: 'Globex raised prices on the Enterprise plan.',
    sourceType: 'competitor_website',
    sourceUrl: 'https://globex.example.com/pricing',
    collectedAt: '2026-07-30T09:00:00.000Z',
    competitorName: 'Globex',
  };
}

function makeRule(): AlertRule {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    organizationId: '33333333-3333-4333-8333-333333333333',
    name: 'Pricing watch',
    description: '',
    enabled: true,
    triggers: {},
    channels: [{ type: 'slack', target: '#ase-alerts' }],
    routingOverride: null,
    firedCount: 0,
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
  };
}

function makeMockRepos(): { repos: Repos; markDelivered: ReturnType<typeof vi.fn> } {
  const markDelivered = vi.fn().mockResolvedValue(null);
  const notifications = {
    create: vi.fn(),
    list: vi.fn(),
    countUnread: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    markDelivered,
    countDeliveredForOrgToday: vi.fn().mockResolvedValue(0),
  };
  return {
    repos: { notifications } as unknown as Repos,
    markDelivered,
  };
}

function fakeOkTransport(): PostTransport {
  return {
    async postMessage() {
      return {
        ok: true,
        ts: '1700000000.000100',
        permalink: 'https://fake.slack.com/archives/C123/p1700000000000100',
      };
    },
    async conversationsList() {
      return [{ id: 'C123', name: 'ase-alerts' }];
    },
  };
}

describe('createSlackClient — no-op when unconfigured', () => {
  it('returns a no-op client that never throws', () => {
    const client = createSlackClient({});
    expect(client.isConfigured).toBe(false);
    expect(client.isNoop()).toBe(true);
  });

  it('postMessage resolves failed with slack_not_configured', async () => {
    const client = createSlackClient({});
    const result = await client.postMessage('#ase-alerts', { text: 'hi' });
    expect(result.status).toBe('failed');
    expect(result.error).toBe('slack_not_configured');
  });
});

describe('postSlackAlert', () => {
  it('records an error and does not send when Slack is not configured', async () => {
    const client = createSlackClient({});
    const { repos, markDelivered } = makeMockRepos();
    const result = await postSlackAlert('n1', makeRule(), makeSignal(), '#ase-alerts', {
      client,
      repos,
    });
    expect(result).toEqual({ status: 'failed', error: 'slack_not_configured' });
    expect(markDelivered).toHaveBeenCalledTimes(1);
    expect(markDelivered.mock.calls[0]![1].error).toBe('slack_not_configured');
  });

  it('on success posts the blocks and calls markDelivered with ts/permalink', async () => {
    const client = createSlackClient({
      token: 'xoxb-token',
      appToken: 'xapp-token',
      transport: fakeOkTransport(),
    });
    const { repos, markDelivered } = makeMockRepos();
    const result = await postSlackAlert('n1', makeRule(), makeSignal(), '#ase-alerts', {
      client,
      repos,
    });

    expect(result.status).toBe('delivered');
    expect(result.ts).toBe('1700000000.000100');
    expect(markDelivered).toHaveBeenCalledTimes(1);
    const [id, outcome] = markDelivered.mock.calls[0]!;
    expect(id).toBe('n1');
    expect(outcome.slackTs).toBe('1700000000.000100');
    expect(outcome.permalink).toContain('https://fake.slack.com');
    expect(outcome.error).toBeNull();
  });

  it('on post failure calls markDelivered with the error', async () => {
    const failingTransport: PostTransport = {
      async postMessage() {
        return { ok: false, error: 'channel_is_archived' };
      },
      async conversationsList() {
        return [{ id: 'C123', name: 'ase-alerts' }];
      },
    };
    const client = createSlackClient({
      token: 'xoxb-token',
      appToken: 'xapp-token',
      transport: failingTransport,
    });
    const { repos, markDelivered } = makeMockRepos();
    const result = await postSlackAlert('n1', makeRule(), makeSignal(), '#ase-alerts', {
      client,
      repos,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBe('channel_is_archived');
    expect(markDelivered).toHaveBeenCalledTimes(1);
    expect(markDelivered.mock.calls[0]![1].error).toBe('channel_is_archived');
  });

  it('records an error when the channel cannot be resolved', async () => {
    const transport: PostTransport = {
      async postMessage() {
        return { ok: false, error: 'unreachable' };
      },
      async conversationsList() {
        return [{ id: 'C123', name: 'other-channel' }]; // no match for #ase-alerts
      },
    };
    const client = createSlackClient({
      token: 'xoxb-token',
      appToken: 'xapp-token',
      transport,
    });
    const { repos, markDelivered } = makeMockRepos();
    const result = await postSlackAlert('n1', makeRule(), makeSignal(), '#ase-alerts', {
      client,
      repos,
    });
    expect(result).toEqual({ status: 'failed', error: 'channel_resolution_failed' });
    expect(markDelivered.mock.calls[0]![1].error).toBe('channel_resolution_failed');
  });

  it('treats a channel id target as already resolved', async () => {
    const client: SlackClient = createSlackClient({
      token: 'xoxb-token',
      appToken: 'xapp-token',
      transport: fakeOkTransport(),
    });
    expect(await client.resolveChannel('C1234567890')).toBe('C1234567890');
  });
});
