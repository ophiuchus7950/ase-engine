import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CollectionError, extractPageText, fetchPage } from './http.collector';

const HTML_FIXTURE = `<!DOCTYPE html>
<html>
  <head>
    <title>Acme Corp</title>
    <script>window.track = true;</script>
    <style>.hidden { display: none; }</style>
  </head>
  <body>
    <nav><a href="/">Home</a> <a href="/pricing">Pricing</a></nav>
    <main>
      <h1>Acme launches new AI product</h1>
      <p>Acme announced <b>Acme AI</b> today, a new <i>platform</i> for teams.</p>
      <p>Pricing starts at $49 &amp; includes support.</p>
    </main>
    <footer>© 2026 Acme Corp</footer>
  </body>
</html>`;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/page') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(HTML_FIXTURE);
    } else if (req.url === '/error') {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('boom');
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

describe('fetchPage', () => {
  it('fetches a page and returns stripped, whitespace-collapsed text', async () => {
    const page = await fetchPage(`${baseUrl}/page`);
    expect(page.sourceUrl).toBe(`${baseUrl}/page`);
    expect(page.rawText).toContain('Acme launches new AI product');
    expect(page.rawText).toContain('Acme announced Acme AI today, a new platform for teams.');
    expect(page.rawText).toContain('Pricing starts at $49 & includes support.');
  });

  it('strips scripts, styles, nav, and footer boilerplate', async () => {
    const { rawText } = await fetchPage(`${baseUrl}/page`);
    expect(rawText).not.toContain('window.track');
    expect(rawText).not.toContain('.hidden');
    expect(rawText).not.toContain('Home'); // nav link text (only appears in <nav>)
    expect(rawText).not.toContain('© 2026 Acme Corp');
  });

  it('leaves no HTML tags or newlines behind', async () => {
    const { rawText } = await fetchPage(`${baseUrl}/page`);
    expect(rawText).not.toMatch(/<[^>]+>/);
    expect(rawText).not.toContain('\n');
    expect(rawText).not.toMatch(/ {2,}/);
  });

  it('rejects with CollectionError on HTTP error status', async () => {
    await expect(fetchPage(`${baseUrl}/error`)).rejects.toBeInstanceOf(CollectionError);
  });

  it('rejects with CollectionError on connection failure', async () => {
    await expect(fetchPage('http://127.0.0.1:1/nope')).rejects.toBeInstanceOf(CollectionError);
  });
});

describe('extractPageText', () => {
  it('decodes common HTML entities', () => {
    const text = extractPageText('<p>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &nbsp;f</p>');
    expect(text).toBe('a & b <c> "d" \'e\' f');
  });

  it('handles empty input', () => {
    expect(extractPageText('')).toBe('');
    expect(extractPageText('<div></div>')).toBe('');
  });
});
