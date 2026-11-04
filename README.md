# Rivela ASE — Autonomous Signal Engine

A competitor-intelligence pipeline that turns raw web activity into routed, scored signals,
a **live battlecard** per competitor, and an **everything feed** — with an optional **Slack bot**
for delivery.

```
Collect → Classify (LLM) → Score → Route ─┬→ Signal Cards / Weekly Digest / Archive
                                          └→ Battlecard reconciliation
```

## How it works

| Stage | What it does |
|---|---|
| **Collect** | Fetches due data sources: plain HTTP, RSS, or the Scrapling stealth-browser sidecar for JS/anti-bot pages |
| **Classify** | LLM classification of raw signals into categories (needs an OpenCode Zen credential) |
| **Score** | Six-factor significance scoring |
| **Route** | Routing decision per signal: `signal_card` / `weekly_digest` / `archive` |
| **Battlecard** | Regenerates a competitor's battlecard when a signal routes to `signal_card` (versioned history) |

Signals that route as `signal_card` are pushed as rich Slack alerts (rate-capped at 3/day/org)
and logged in the in-app notification feed.

## Stack

- **Backend** — Node ≥ 20, TypeScript, Fastify, PostgreSQL, Zod, Slack Bolt (Socket Mode)
- **Frontend** — React + Vite (`web/`), proxies `/v1` to the API
- **Scraper sidecar** — Python + Scrapling in Docker (optional, for hard-to-scrape sites)
- **Tests** — Vitest

## Quick start

```bash
cp .env.example .env             # defaults are fine for local dev
docker compose up -d postgres    # Postgres on :5432
npm install                      # backend deps
cd web && npm install && cd ..   # frontend deps
npm run migrate                  # applies ase_schema.sql + 002 + 003
npm run seed                     # first org, competitor(s), sources, signals
```

Run the engine (API + all 7 units, crash-restarted):

```bash
npm run engine
```

Run the web UI in a second terminal and open http://localhost:5173:

```bash
cd web && npm run dev
```

First run: register an account from the login screen ("No account yet? Create one"),
or use the seeded login **Alex / hunter2**.

## Services & ports

| Service | Port | Notes |
|---|---|---|
| API | 3000 | `curl localhost:3000/health` |
| Web UI | 5173 | Vite dev server |
| Postgres | 5432 | Docker (`ase-postgres`) |
| Scraper | 8410 | Docker (`ase-scraper`), optional |

## Slack bot (optional)

Configure it from the **Monitoring → Slack Bot** card in the web UI — paste your `xoxb-`
bot token and `xapp-` app-level token, save, and the bot connects within ~15 s (no `.env`
edit or restart needed). Tokens are stored in your local DB and masked on read.

To create the Slack app, use the ready-made `SLACK_MANIFEST.yaml` ("From a manifest"),
add the listed bot scopes, install to workspace, and enable Socket Mode. Full walkthrough
and gotchas: [HOW_TO_RUN.md](./HOW_TO_RUN.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run engine` | API + all workers in one crash-restarting process |
| `npm run worker:collect` / `classify` / `score` / `route` / `battlecard` / `slack` | Run a single worker |
| `npm run migrate` / `seed` | Apply schema / load demo data |
| `npm run typecheck && npm run lint && npm test` | Backend gate check |
| `cd web && npm run typecheck && npm run build` | Web gate check |

## Gotchas

- **No signals appearing** — the API alone doesn't scrape; use `npm run engine` (or the `worker:*` scripts).
- **HTTP 444 / empty competitor page** — the site blocks plain HTTP; start the sidecar (`docker compose up -d scraper`).
- **Classifier errors** — expired/missing OpenCode Zen credential: `opencode auth login`.
- **npm 11 blocks install scripts** — approve native deps with `npm install-scripts approve`.

More detail, including Slack troubleshooting and the daily-cap behavior: [HOW_TO_RUN.md](./HOW_TO_RUN.md).
