import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CollectionError } from './http.collector';
import { extractFeedText, fetchFeed, parseRssItems } from './rss.collector';

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Acme News</title>
    <link>https://acme.example/blog</link>
    <description>Latest from Acme</description>
    <item>
      <title>Acme raises $50M Series B</title>
      <link>https://acme.example/blog/series-b</link>
      <description><![CDATA[<p>Acme announced a <b>$50M</b> round led by VC.</p>]]></description>
      <pubDate>Thu, 30 Jul 2026 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>New pricing page</title>
      <link>https://acme.example/pricing</link>
      <description>Updated pricing for the Enterprise plan.</description>
    </item>
  </channel>
</rss>`;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/feed') {
      res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
      res.end(RSS_FIXTURE);
    } else if (req.url === '/empty') {
      res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
      res.end(
        '<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>',
      );
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    }
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

describe('parseRssItems', () => {
  it('extracts title, link, and description per item', () => {
    const items = parseRssItems(RSS_FIXTURE);
    expect(items).toHaveLength(2);

    expect(items[0]?.title).toBe('Acme raises $50M Series B');
    expect(items[0]?.link).toBe('https://acme.example/blog/series-b');
    // CDATA wrapper + inner HTML are stripped.
    expect(items[0]?.description).toBe('Acme announced a $50M round led by VC.');

    expect(items[1]?.title).toBe('New pricing page');
    expect(items[1]?.description).toBe('Updated pricing for the Enterprise plan.');
  });

  it('returns an empty array for a feed with no items', () => {
    expect(parseRssItems('<rss><channel><title>Empty</title></channel></rss>')).toEqual([]);
  });
});

describe('extractFeedText', () => {
  it('joins items as "title — description — link", one per line', () => {
    const text = extractFeedText(RSS_FIXTURE);
    const lines = text.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'Acme raises $50M Series B — Acme announced a $50M round led by VC. — https://acme.example/blog/series-b',
    );
    expect(lines[1]).toBe(
      'New pricing page — Updated pricing for the Enterprise plan. — https://acme.example/pricing',
    );
  });

  it('returns an empty string when there are no items', () => {
    expect(extractFeedText('<rss><channel><title>Empty</title></channel></rss>')).toBe('');
  });
});

describe('fetchFeed', () => {
  it('fetches and flattens a live feed over HTTP', async () => {
    const page = await fetchFeed(`${baseUrl}/feed`);
    expect(page.sourceUrl).toBe(`${baseUrl}/feed`);
    expect(page.rawText).toContain('Acme raises $50M Series B');
    expect(page.rawText).toContain('Acme announced a $50M round led by VC.');
    expect(page.rawText).toContain('New pricing page');
  });

  it('returns empty rawText for a feed without items', async () => {
    const page = await fetchFeed(`${baseUrl}/empty`);
    expect(page.rawText).toBe('');
  });

  it('rejects with CollectionError on HTTP error status', async () => {
    await expect(fetchFeed(`${baseUrl}/missing`)).rejects.toBeInstanceOf(CollectionError);
  });

  it('rejects with CollectionError on connection failure', async () => {
    await expect(fetchFeed('http://127.0.0.1:1/nope')).rejects.toBeInstanceOf(CollectionError);
  });
});
