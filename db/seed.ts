// CLI wrapper: package.json's `seed` script runs `tsx db/seed.ts`.
// Canonical implementation lives in src/db/seed.ts (kept here for the npm script).
import { main } from '../src/db/seed';

main();
