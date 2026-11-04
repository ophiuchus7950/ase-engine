/**
 * HTTP collector for 'competitor_website' sources: fetches a page and reduces
 * it to plain text (scripts/styles/nav boilerplate stripped, whitespace
 * collapsed). Typed CollectionError on any network/HTTP failure.
 */

export interface CollectedPage {
  rawText: string;
  sourceUrl: string;
}

export class CollectionError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CollectionError';
  }
}

const FETCH_TIMEOUT_MS = 30_000;

/** Fetch a URL and return its stripped text. Rejects with CollectionError. */
export async function fetchPage(url: string): Promise<CollectedPage> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new CollectionError(`Network error fetching ${url}`, url, err);
  }

  if (!response.ok) {
    throw new CollectionError(`HTTP ${response.status} fetching ${url}`, url);
  }

  const html = await response.text();
  return { rawText: extractPageText(html), sourceUrl: url };
}

/** Strip script/style/noscript/comments/nav/footer/header blocks and tags, then collapse whitespace. */
export function extractPageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
