import type { CollectedPage } from './http.collector';
import { CollectionError } from './http.collector';

/**
 * RSS collector for 'news_rss' sources: fetches a feed and joins its <item>
 * blocks (title, description, link) into plain text. Regex-based, CDATA-aware.
 */

export interface RssItem {
  title: string;
  link: string;
  description: string;
}

const FETCH_TIMEOUT_MS = 30_000;

/** Fetch an RSS feed and return the joined item text. Rejects with CollectionError. */
export async function fetchFeed(url: string): Promise<CollectedPage> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new CollectionError(`Network error fetching feed ${url}`, url, err);
  }

  if (!response.ok) {
    throw new CollectionError(`HTTP ${response.status} fetching feed ${url}`, url);
  }

  const xml = await response.text();
  return { rawText: extractFeedText(xml), sourceUrl: url };
}

/** Extract all <item> blocks from an RSS 2.0 feed. */
export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;

  let match: RegExpExecArray | null = itemRegex.exec(xml);
  while (match !== null) {
    const block = match[0];
    if (block !== undefined) {
      items.push({
        title: extractTag(block, 'title'),
        link: extractTag(block, 'link'),
        description: extractTag(block, 'description'),
      });
    }
    match = itemRegex.exec(xml);
  }

  return items;
}

/** Join items into one text blob: "title — description — link" per item, newline-separated. */
export function extractFeedText(xml: string): string {
  return parseRssItems(xml)
    .map((item) =>
      [item.title, item.description, item.link].filter((part) => part.length > 0).join(' — '),
    )
    .join('\n');
}

/** Pull one tag's inner content from an <item> block; unwraps CDATA and inner HTML. */
function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = re.exec(block);
  const inner = match?.[1];
  if (inner === undefined) return '';

  return inner
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
