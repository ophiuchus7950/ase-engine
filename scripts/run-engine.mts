/**
 * Rivela ASE — engine supervisor.
 *
 * Runs the HTTP API plus all four pipeline workers (collect / classify /
 * score / route) as child processes, restarting each on crash. This gives a
 * single entrypoint (`npm run dev:engine` / `npm run start:engine`) so a
 * fresh machine gets the full working product without juggling five
 * terminals — the "standalone, download and it works" story.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';

const { NODE = process.execPath } = process.env;
const root = decodeURIComponent(new URL('..', import.meta.url).pathname);

interface Unit {
  name: string;
  script: string;
}

const UNITS: Unit[] = [
  { name: 'api', script: 'src/api/server.ts' },
  { name: 'collector', script: 'src/workers/collector.worker.ts' },
  { name: 'classifier', script: 'src/workers/classifier.worker.ts' },
  { name: 'scorer', script: 'src/workers/scorer.worker.ts' },
  { name: 'router', script: 'src/workers/router.worker.ts' },
  { name: 'battlecard', script: 'src/workers/battlecard.worker.ts' },
];

const children = new Map<string, ChildProcess>();

function startUnit(unit: Unit): void {
  const child = spawn(NODE, ['--import', 'tsx', unit.script], {
    cwd: root,
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env },
  });
  children.set(unit.name, child);
  child.on('exit', (code, signal) => {
    // Restart only on a crash (non-zero exit), not on a clean exit. Some units
    // legitimately exit 0 — e.g. any worker asked to drain and stop. Hot-
    // restarting a code-0 unit would cause an infinite tight restart loop.
    if (!shuttingDown && code !== 0) {
      console.log(`[engine] ${unit.name} crashed (code=${code} signal=${signal}); restarting`);
      startUnit(unit);
    } else if (!shuttingDown) {
      console.log(`[engine] ${unit.name} exited cleanly (code=${code}); not restarting`);
    }
  });
  child.on('error', (err) => {
    console.error(`[engine] ${unit.name} failed to start: ${err.message}`);
  });
  console.log(`[engine] started ${unit.name}`);
}

let shuttingDown = false;
function shutdown(signal: string): void {
  shuttingDown = true;
  console.log(`[engine] ${signal} — shutting down`);
  for (const child of children.values()) child.kill(signal);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

for (const unit of UNITS) startUnit(unit);
