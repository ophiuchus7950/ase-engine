import 'dotenv/config';
import { z } from 'zod';

/**
 * Central env config (zod-validated at boot — fail fast on bad config).
 * All env vars are read here only; modules import `config`.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().default('postgres://ase:ase_dev_pw@localhost:5432/ase'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Shared internal service auth — workers send `X-API-Key: <this>`. */
  ASE_API_KEY: z.string().min(1).default('dev-internal-key'),
  /** Stage 1 classification model, served via the opencode CLI (OpenCode Zen). */
  LLM_MODEL: z.string().default('opencode/deepseek-v4-flash-free'),
  OPENCODE_BIN: z.string().default('opencode'),
  /** Base URL workers use to reach the internal API. */
  API_BASE_URL: z.string().default('http://localhost:3000'),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  /** Base URL of the Scrapling stealth-browser sidecar (POST /scrape). */
  SCRAPLING_SERVICE_URL: z.string().default('http://localhost:8410'),
  /** Slack integration (Workstream B). Optional — when unset, Slack is a no-op. */
  SLACK_BOT_TOKEN: z.string().default(''),
  SLACK_APP_TOKEN: z.string().default(''),
  SLACK_SIGNING_SECRET: z.string().default(''),
  SLACK_DEFAULT_CHANNEL: z.string().default('#ase-alerts'),
  /** Base URL of the web app, for interactive-button deep links. */
  ASE_WEB_APP_URL: z.string().default('http://localhost:5173'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    'Invalid environment:',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
