// CLI wrapper: package.json's `migrate` script runs `tsx db/migrate.ts`.
// Canonical implementation lives in src/db/migrate.ts (kept here for the npm script).
import { main } from '../src/db/migrate';

main();
