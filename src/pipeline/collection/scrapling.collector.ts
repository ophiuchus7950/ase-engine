import { config } from '../../config';
import type { CollectedPage } from './http.collector';
import { CollectionError } from './http.collector';

/**
 * Scrapling collector for JS-rendered / anti-bot-protected source types
 * (g2, capterra, trustradius, job_board). Instead of a plain HTTP fetch it
 * delegates to the Scrapling stealth-browser sidecar (POST /scrape), which
 * renders JavaScript and bypasses common anti-bot checks.
 *
 * Contract mirrors http.collector.ts: throws `CollectionError`, returns the
 * same `CollectedPage` ({ rawText, sourceUrl }).
 */

interface ScrapeResponse {
  ok: boolean;
  raw_text?: string;
  source_url?: string;
  error?: string;
}

const FETCH_TIMEOUT_MS = 90_000;

export async function fetchScraplingPage(
  url: string,
  selector?: string,
  serviceUrl: string = config.SCRAPLING_SERVICE_URL,
): Promise<CollectedPage> {
  let response: Response;
  try {
    response = await fetch(`${serviceUrl}/scrape`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, selector: selector ?? null }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new CollectionError(`Scrapling service unreachable at ${serviceUrl}`, url, err);
  }

  let data: ScrapeResponse;
  try {
    data = (await response.json()) as ScrapeResponse;
  } catch (err) {
    throw new CollectionError(`Scrapling returned non-JSON (HTTP ${response.status})`, url, err);
  }

  if (!response.ok || !data.ok) {
    throw new CollectionError(
      `Scrapling fetch failed (HTTP ${response.status}): ${data.error ?? 'unknown error'}`,
      url,
    );
  }

  return { rawText: data.raw_text ?? '', sourceUrl: data.source_url ?? url };
}
