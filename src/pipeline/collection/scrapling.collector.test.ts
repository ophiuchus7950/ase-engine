import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CollectionError } from './http.collector';
import { fetchScraplingPage } from './scrapling.collector';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/scrape') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const payload = JSON.parse(body || '{}') as { url?: unknown };
      const url = Array.isArray(payload.url) ? '' : String(payload.url ?? '');
      if (!url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: "missing 'url'" }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          raw_text: `Rendered content for ${url} · <b>JS loaded</b>`,
          source_url: url,
          title: 'Rendered Page',
        }),
      );
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

describe('fetchScraplingPage', () => {
  it('POSTs to the sidecar and returns rawText + sourceUrl', async () => {
    const page = await fetchScraplingPage(`${baseUrl}/some/js/page`, undefined, baseUrl);
    expect(page.sourceUrl).toBe(`${baseUrl}/some/js/page`);
    expect(page.rawText).toContain('Rendered content');
    expect(page.rawText).toContain('JS loaded');
  });

  it('rejects with CollectionError when the sidecar is unreachable', async () => {
    await expect(
      fetchScraplingPage('https://example.com/x', undefined, 'http://127.0.0.1:1'),
    ).rejects.toBeInstanceOf(CollectionError);
  });
});
