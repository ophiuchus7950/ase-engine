# Rivela ASE — Autonomous Signal Engine

A competitor-intelligence pipeline that scrapes the web, normalizes and
deduplicates what it finds, classifies and scores signals with an LLM, routes
them (signal card / weekly digest / archive), and surfaces everything in a
dashboard with battlecard generation.

## Stack

- **Backend & workers** — Node 20 + TypeScript, Fastify, pg, zod
- **Database** — Postgres 16 (Docker)
- **Web UI** — React + Vite (`web/`)
- **Scraping sidecar** — Scrapling stealth browser (Docker, port 8410) for
  JS-rendered / anti-bot pages plain HTTP can't fetch
- **LLM** — any OpenAI-compatible chat-completions API (OpenRouter, OpenAI,
  Groq, local Ollama/LM Studio, ...) configured via env vars

No sign-up, no API keys for the app itself: ASE is a local, single-user tool.
All `/v1` routes resolve against one seeded local user.

## How it works

```
data sources (HTTP / RSS / Scrapling)
        │  collector worker
        ▼
raw_signals ──► classifier (LLM) ──► scorer (6-factor, 0–10)
                                           │
                                           ▼
                                    router (routing rules)
                                           │
                              signal_card / weekly_digest / archive
```

Each stage is an independent worker polling the API; one failed signal never
blocks the queue.

## Quickstart

Prerequisites: **Node.js 20+**, **Docker** with Compose.

```bash
# 1. Install dependencies (backend + web)
npm install
cd web && npm install && cd ..

# 2. Configure environment
cp .env.example .env        # defaults are fine for local dev

# 3. Start Postgres + the Scrapling sidecar
docker compose up -d postgres scraper

# 4. Migrate and seed the database
npm run migrate
npm run seed

# 5. Run the engine: API + collector/classifier/scorer/router/battlecard workers
npm run engine

# 6. Run the web UI (in another terminal)
cd web && npm run dev       # http://localhost:5173
```

No account creation — the UI opens straight into the dashboard.

Classification needs one env var: set `LLM_API_KEY` in `.env` (any
OpenAI-compatible provider — see the table below).

## LLM configuration

Stage 1 classification talks to any OpenAI-compatible `/chat/completions`
endpoint:

| Env var | Default | Notes |
| --- | --- | --- |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` | Point at OpenAI (`https://api.openai.com/v1`), Groq, a local Ollama (`http://localhost:11434/v1`), ... |
| `LLM_API_KEY` | — | The provider's API key |
| `LLM_MODEL` | `mistralai/mistral-7b-instruct:free` | Provider-specific model id |

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run engine` | API + all workers with auto-restart |
| `npm run dev` | API only, watch mode |
| `npm run worker:collect` / `worker:classify` / `worker:score` / `worker:route` / `worker:battlecard` | Individual workers |
| `npm run typecheck && npm run lint && npm test` | Validation gate |
| `npm run scraper:up` / `scraper:build` | Scrapling sidecar via Docker |

Integration tests run against a dedicated `ase_test` database (derived from
`DATABASE_URL`), so the dev database is never touched. Start `docker compose
up -d postgres` first.

## Ports

| Service | Port |
| --- | --- |
| API | 3000 (`curl localhost:3000/health`) |
| Web UI (Vite) | 5173 |
| Postgres | 5432 |
| Scrapling sidecar | 8410 (`curl localhost:8410/health`) |

## Project layout

```
src/
  api/          Fastify app: routes, auth, DTOs
  db/           Pool, repos, migrations runner, test helpers
  pipeline/     collection → classification (LLM) → scoring → routing
  workers/      One poll-loop worker per pipeline stage
  battlecard/   Battlecard generation + versioning
db/             SQL schema migrations + seed
web/            React/Vite dashboard
scraper/        Python Scrapling stealth-browser sidecar (Docker)
scripts/        Engine runner, packaging, smoke tests
```
