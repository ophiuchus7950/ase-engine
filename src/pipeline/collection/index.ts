import type { SourceType } from '../../types/domain';
import { type CollectedPage } from './http.collector';
import { fetchFeed } from './rss.collector';
import { fetchScraplingPage } from './scrapling.collector';

/**
 * Collector registry (standards §4 — one file per source_type collector).
 *
 * - competitor_website -> plain HTTP fetch (fast, static HTML)
 * - news_rss          -> RSS feed parse
 * - g2/capterra/trustradius/job_board -> Scrapling stealth browser (renders
 *   JS, bypasses anti-bot) because these pages are client-side rendered and
 *   review/board sites sit behind bot protection.
 *
 * Anything else throws UnsupportedSourceError and the collector worker logs
 * + skips that source.
 */

export type Collector = (url: string) => Promise<CollectedPage>;

export class UnsupportedSourceError extends Error {
  constructor(public readonly sourceType: SourceType) {
    super(`No collector registered for source type '${sourceType}'`);
    this.name = 'UnsupportedSourceError';
  }
}

export function getCollector(sourceType: SourceType): Collector {
  switch (sourceType) {
    case 'competitor_website':
      return fetchScraplingPage;
    case 'news_rss':
      return fetchFeed;
    case 'g2':
    case 'capterra':
    case 'trustradius':
    case 'job_board':
      return fetchScraplingPage;
    default:
      throw new UnsupportedSourceError(sourceType);
  }
}
