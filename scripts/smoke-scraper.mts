/* Integration check: Node collector -> containerized Scrapling service. */
import { fetchScraplingPage } from '../src/pipeline/collection/scrapling.collector';

const service = process.env.TARGET ?? 'http://127.0.0.1:8411';
try {
  const page = await fetchScraplingPage(
    'https://quotes.toscrape.com/',
    undefined,
    service,
  );
  console.log('INTEGRATION OK');
  console.log('source_url:', page.sourceUrl);
  console.log('raw_text len:', page.rawText.length);
  console.log('sample:', page.rawText.slice(0, 120));
  process.exit(0);
} catch (err) {
  console.error('INTEGRATION FAILED:', (err as Error).message);
  process.exit(1);
}
