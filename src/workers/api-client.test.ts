import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiClient, ApiClientError } from './api-client';

/** One captured inbound request for assertion. */
interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  body: string | null;
}

const RAW_SIGNAL_WIRE = {
  id: 'rs-1',
  organization_id: 'org-1',
  competitor_id: 'comp-1',
  data_source_id: 'ds-1',
  source_type: 'news_rss',
  raw_text: 'Acme raised $50M',
  source_url: 'https://acme.example/blog/series-b',
  collection_method: 'rss_fetch',
  collected_at: '2026-07-30T09:00:00.000Z',
  content_hash: 'abc123',
  ingested_at: '2026-07-30T09:01:00.000Z',
};

const SIGNAL_DETAIL_WIRE = {
  id: 'sig-1',
  raw_signal_id: 'rs-1',
  organization_id: 'org-1',
  competitor_id: 'comp-1',
  action_type: 'funding',
  confidence_level: 'high',
  key_facts: ['raised 50M'],
  llm_model_used: 'openrouter/mistralai/mistral-7b-instruct:free',
  classified_at: '2026-07-30T09:02:00.000Z',
  score_recency: 0,
  score_source_authority: 1,
  score_action_type: 0,
  score_icp_relevance: 0,
  score_deal_stage_context: 0,
  score_novelty: 1,
  significance_score: 2,
  scored_at: '2026-07-30T09:03:00.000Z',
  routing_decision: 'archive',
  battlecard_update_triggered: false,
  deal_alert_check_triggered: false,
  routed_at: '2026-07-30T09:04:00.000Z',
  created_at: '2026-07-30T09:02:00.000Z',
  raw_text: 'Acme raised $50M',
  source_type: 'news_rss',
  source_url: 'https://acme.example/blog/series-b',
  collected_at: '2026-07-30T09:00:00.000Z',
  competitor_name: 'Acme',
};

let server: Server;
let baseUrl: string;
const requests: CapturedRequest[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        body: body.length > 0 ? body : null,
      });

      const url = req.url ?? '';

      if (url.startsWith('/v1/raw-signals/unclassified')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [RAW_SIGNAL_WIRE], nextCursor: null, limit: 10 }));
      } else if (url.startsWith('/v1/raw-signals') && req.method === 'POST') {
        // Real wire contract (ase_api_spec.md §2): the record itself, with
        // HTTP status 201 (new) / 200 (dedup hit) as the created flag.
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(RAW_SIGNAL_WIRE));
      } else if (url.startsWith('/v1/raw-signals')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(RAW_SIGNAL_WIRE));
      } else if (url.startsWith('/v1/signals/sig-1')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(SIGNAL_DETAIL_WIRE));
      } else if (url.startsWith('/v1/signals/pending-scoring')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [SIGNAL_DETAIL_WIRE], nextCursor: null, limit: 10 }));
      } else if (url.startsWith('/v1/signals/pending-routing')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [SIGNAL_DETAIL_WIRE], nextCursor: null, limit: 10 }));
      } else if (url.startsWith('/v1/signals/routed')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [SIGNAL_DETAIL_WIRE], nextCursor: null, limit: 10 }));
      } else if (url.startsWith('/v1/data-sources/due')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [], nextCursor: null, limit: 10 }));
      } else if (url.startsWith('/v1/signals/err-422')) {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'validation_error', message: 'bad payload' }));
      } else if (req.method === 'POST') {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [], nextCursor: null, limit: 10 }));
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('test server did not bind to a TCP port');
  }
  baseUrl = `http://127.0.0.1:${(addr as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function makeClient(): ApiClient {
  requests.length = 0;
  return new ApiClient(baseUrl);
}

describe('ApiClient', () => {
  it('listUnclassified maps snake_case wire rows to camelCase RawSignal', async () => {
    const client = makeClient();
    const [signal] = await client.listUnclassified(10);
    expect(requests[0]?.url).toBe('/v1/raw-signals/unclassified?limit=10');
    expect(signal).toMatchObject({
      id: 'rs-1',
      organizationId: 'org-1',
      competitorId: 'comp-1',
      dataSourceId: 'ds-1',
      sourceType: 'news_rss',
      rawText: 'Acme raised $50M',
      sourceUrl: 'https://acme.example/blog/series-b',
      collectionMethod: 'rss_fetch',
      collectedAt: '2026-07-30T09:00:00.000Z',
      contentHash: 'abc123',
    });
  });

  it('ingestRawSignal posts a snake_case payload with a JSON content type', async () => {
    const client = makeClient();
    const { created, signal } = await client.ingestRawSignal({
      organization_id: 'org-1',
      competitor_id: 'comp-1',
      data_source_id: 'ds-1',
      source_type: 'news_rss',
      raw_text: 'Acme raised $50M',
      source_url: 'https://acme.example/blog/series-b',
      collection_method: 'rss_fetch',
      collected_at: '2026-07-30T09:00:00.000Z',
      content_hash: 'abc123',
    });

    expect(created).toBe(true);
    expect(signal.rawText).toBe('Acme raised $50M');

    const captured = requests[0];
    expect(captured?.method).toBe('POST');
    expect(captured?.url).toBe('/v1/raw-signals');
    const body = JSON.parse(captured?.body ?? '{}') as Record<string, unknown>;
    expect(body.organization_id).toBe('org-1');
    expect(body.competitor_id).toBe('comp-1');
    expect(body.data_source_id).toBe('ds-1');
    expect(body.source_type).toBe('news_rss');
    expect(body.raw_text).toBe('Acme raised $50M');
    expect(body.content_hash).toBe('abc123');
    expect(body).not.toHaveProperty('organizationId');
  });

  it('ingestRawSignal returns created=false on a 200 dedup hit (existing record)', async () => {
    // Point the mock at a second server that replies 200 for the same POST.
    const server2 = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(RAW_SIGNAL_WIRE));
      });
    });
    await new Promise<void>((resolve) => {
      server2.listen(0, resolve);
    });
    try {
      const address = server2.address();
      if (address === null || typeof address === 'string') throw new Error('no port');
      const client = new ApiClient(`http://127.0.0.1:${address.port}`);
      const { created, signal } = await client.ingestRawSignal({
        organization_id: 'org-1',
        competitor_id: 'comp-1',
        data_source_id: 'ds-1',
        source_type: 'news_rss',
        raw_text: 'Acme raised $50M',
        source_url: null,
        collection_method: 'rss_fetch',
        collected_at: '2026-07-30T09:00:00.000Z',
        content_hash: 'abc123',
      });
      expect(created).toBe(false);
      expect(signal.rawText).toBe('Acme raised $50M');
    } finally {
      await new Promise<void>((resolve) => {
        server2.close(() => resolve());
      });
    }
  });

  it('getSignal maps the joined detail view to SignalDetail', async () => {
    const client = makeClient();
    const detail = await client.getSignal('sig-1');
    expect(detail).toMatchObject({
      id: 'sig-1',
      rawSignalId: 'rs-1',
      actionType: 'funding',
      confidenceLevel: 'high',
      keyFacts: ['raised 50M'],
      significanceScore: 2,
      routingDecision: 'archive',
      rawText: 'Acme raised $50M',
      sourceType: 'news_rss',
      collectedAt: '2026-07-30T09:00:00.000Z',
      competitorName: 'Acme',
    });
  });

  it('listPendingScoring / listPendingRouting hit their queue endpoints', async () => {
    const client = makeClient();
    const scoring = await client.listPendingScoring(10);
    expect(requests[0]?.url).toBe('/v1/signals/pending-scoring?limit=10');
    expect(scoring).toHaveLength(1);

    const routing = await client.listPendingRouting(5);
    expect(requests[1]?.url).toBe('/v1/signals/pending-routing?limit=5');
    expect(routing).toHaveLength(1);
  });

  it('listRouted passes the routing_decision filter', async () => {
    const client = makeClient();
    await client.listRouted('signal_card', 20);
    expect(requests[0]?.url).toBe('/v1/signals/routed?routing_decision=signal_card&limit=20');
  });

  it('submitScore / submitRoute / submitClassification / markCollected POST the snake_case payloads', async () => {
    const client = makeClient();
    await client.submitScore('sig-1', {
      score_recency: 2,
      score_source_authority: 1,
      score_action_type: 0,
      score_icp_relevance: 0,
      score_deal_stage_context: 0,
      score_novelty: 1,
    });
    await client.submitRoute('sig-1', {
      routing_decision: 'signal_card',
      battlecard_update_triggered: true,
      deal_alert_check_triggered: false,
    });
    await client.submitClassification('rs-1', {
      action_type: 'funding',
      confidence_level: 'high',
      key_facts: ['raised 50M'],
      llm_model_used: 'openrouter/mistralai/mistral-7b-instruct:free',
    });
    await client.markCollected('ds-1');

    expect(requests[0]?.url).toBe('/v1/signals/sig-1/score');
    expect(JSON.parse(requests[0]?.body ?? '{}')).toMatchObject({
      score_recency: 2,
      score_novelty: 1,
    });

    expect(requests[1]?.url).toBe('/v1/signals/sig-1/route');
    expect(JSON.parse(requests[1]?.body ?? '{}')).toMatchObject({
      routing_decision: 'signal_card',
    });

    expect(requests[2]?.url).toBe('/v1/raw-signals/rs-1/classify');
    expect(JSON.parse(requests[2]?.body ?? '{}')).toMatchObject({
      action_type: 'funding',
      confidence_level: 'high',
      llm_model_used: 'openrouter/mistralai/mistral-7b-instruct:free',
    });

    expect(requests[3]?.url).toBe('/v1/data-sources/ds-1/mark-collected');
    expect(requests[3]?.method).toBe('POST');
  });

  it('rejects with ApiClientError carrying status + {error, message} on non-2xx', async () => {
    const client = new ApiClient(baseUrl);
    const promise = client.submitScore('err-422', {
      score_recency: 2,
      score_source_authority: 1,
      score_action_type: 0,
      score_icp_relevance: 0,
      score_deal_stage_context: 0,
      score_novelty: 1,
    });
    await expect(promise).rejects.toBeInstanceOf(ApiClientError);
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    if (err instanceof ApiClientError) {
      expect(err.status).toBe(422);
      expect(err.body).toEqual({ error: 'validation_error', message: 'bad payload' });
    }
  });

  it('rejects with ApiClientError on network failure', async () => {
    const client = new ApiClient('http://127.0.0.1:1');
    await expect(client.listUnclassified(10)).rejects.toBeInstanceOf(ApiClientError);
  });
});
