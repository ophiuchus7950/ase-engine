import 'dotenv/config';
import { z } from 'zod';

/**
 * Central env config (zod-validated at boot — fail fast on bad config).
 * All env vars are read here only; modules import `config`.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().default('postgres://ase:ase_dev_pw@localhost:5432/ase'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Stage 1 classification model, via any OpenAI-compatible API. */
  LLM_MODEL: z.string().default('mistralai/mistral-7b-instruct:free'),
  /** Base URL of the LLM provider's OpenAI-compatible API. */
  LLM_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  /** API key for the LLM provider. */
  LLM_API_KEY: z.string().default(''),
  /** Base URL workers use to reach the internal API. */
  API_BASE_URL: z.string().default('http://localhost:3000'),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  /** Base URL of the Scrapling stealth-browser sidecar (POST /scrape). */
  SCRAPLING_SERVICE_URL: z.string().default('http://localhost:8410'),
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
