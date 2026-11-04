import { createHash } from 'node:crypto';

import { config } from '../config';
import { getCollector, UnsupportedSourceError } from '../pipeline/collection';
import type { DataSource } from '../types/domain';
import { ApiClient, type IngestRawSignalPayload } from './api-client';
import { runWorkerLoop } from './worker-utils';

/**
 * Collector worker: pulls due data sources, fetches via the matching
 * collector, computes the dedup content hash, ingests the raw signal, then
 * marks the source collected (ase_api_spec.md §1/§2).
 */

const api = new ApiClient(config.API_BASE_URL);

/** content_hash = sha256(raw_text + ':' + competitor_id), hex (schema comment). */
export function contentHash(rawText: string, competitorId: string): string {
  return createHash('sha256').update(`${rawText}:${competitorId}`).digest('hex');
}

/** 'http_fetch' for static pages, 'rss_fetch' for feeds, 'browser_fetch' for Scrapling. */
function collectionMethodFor(source: DataSource): string {
  switch (source.sourceType) {
    case 'news_rss':
      return 'rss_fetch';
    case 'competitor_website':
    case 'g2':
    case 'capterra':
    case 'trustradius':
    case 'job_board':
      return 'browser_fetch';
    default:
      return 'http_fetch';
  }
}

async function collectOne(source: DataSource): Promise<void> {
  const collector = getCollector(source.sourceType); // throws UnsupportedSourceError

  const url = source.targetUrl;
  if (url === null) {
    console.warn(`[collector] data source ${source.id} has no target_url; skipping`);
    return;
  }

  const { rawText, sourceUrl } = await collector(url);

  // Org-wide sources (competitor_id null) cannot be ingested as competitor
  // signals; raw_signals.competitor_id is NOT NULL. Skip with a warning.
  if (source.competitorId === null) {
    console.warn(
      `[collector] data source ${source.id} is org-wide (no competitor_id); skipping ingestion`,
    );
    return;
  }

  const payload: IngestRawSignalPayload = {
    organization_id: source.organizationId,
    competitor_id: source.competitorId,
    data_source_id: source.id,
    source_type: source.sourceType,
    raw_text: rawText,
    source_url: sourceUrl,
    collection_method: collectionMethodFor(source),
    collected_at: new Date().toISOString(),
    content_hash: contentHash(rawText, source.competitorId),
  };

  const { created } = await api.ingestRawSignal(payload);
  await api.markCollected(source.id);
  console.log(
    `[collector] ${created ? 'ingested' : 'deduped (already seen)'} source ${source.id} ` +
      `(${source.sourceType}) -> ${payload.content_hash.slice(0, 12)}`,
  );
}

async function runOnce(): Promise<void> {
  const sources = await api.listDueSources(config.WORKER_BATCH_SIZE);
  for (const source of sources) {
    try {
      await collectOne(source);
    } catch (err) {
      if (err instanceof UnsupportedSourceError) {
        console.warn(
          `[collector] unsupported source_type '${err.sourceType}' (source ${source.id}); skipping`,
        );
      } else {
        console.error(`[collector] failed for data source ${source.id}:`, err);
      }
    }
  }
}

runWorkerLoop({ name: 'collector', pollIntervalMs: config.WORKER_POLL_INTERVAL_MS, runOnce });
