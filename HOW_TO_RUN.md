# Rivela ASE — Run Guide (v2)

Autonomous Signal Engine: a competitor-intelligence pipeline (Collect → Classify → Score →
Route) with a **live battlecard**, an optional **Slack bot**, and an **Activity/everything feed**.

Docs: `/home/zephy/Documents/ase-engine-docs/` (PRD/Arch/API/DB/UI/coding-standards v2).

---

## 0. One-time setup on a fresh machine

```bash
cp .env.example .env            # defaults are fine for local dev
docker compose up -d postgres   # Postgres on :5432
npm install                     # backend deps (npm 11: `npm install-scripts approve` if native build fails)
cd web && npm install && cd ..  # frontend deps
npm run migrate                 # applies ase_schema.sql + 002 + 003
npm run seed                    # first org, competitor(s), sources, signals
```

## 1. Run the engine (API + all workers)

From the project root, one command:

```bash
npm run engine
```

This starts (and crash-restarts) 7 units:
- **api** — Fastify HTTP API on :3000
- **collector** — fetches due data sources (HTTP / RSS / Scrapling browser)
- **classifier** — LLM classification (needs OpenCode Zen credential)
- **scorer** — six-factor significance scoring
- **router** — routing decision (signal_card / weekly_digest / archive)
- **battlecard** — reconciliation worker (regenerates stale battlecards)
- **slack** — Socket-Mode bot daemon; **idles and auto-connects** when tokens are set (no crash restart-loop)

> Individual workers can be run separately: `npm run worker:collect` / `worker:classify` /
> `worker:score` / `worker:route` / `worker:battlecard`.

## 2. Run the web UI

From another terminal:

```bash
cd web && npm run dev
```

Open **http://localhost:5173** (Vite proxies `/v1` to :3000).
First run (or before an account exists): click **"No account yet? Create one"** to register
(name + password). Seeded login (if present): **Alex / hunter2**.

## 3. What you can do now (v2)

- **Dashboard / Competitors** — competitor profiles + battlecards. A battlecard auto-regenerates
  the moment a signal routes to `signal_card`; the card shows "regenerated Xm ago via routing"
  and links to its version history.
- **Activity** (sidebar) — the everything-feed:
  - *Signals*: every generated signal, real **load-more pagination** (no 100-cap) + filters
    (competitor, category, confidence, min score, routing, bookmarked, search).
  - *Notifications*: the delivery log — in-app + Slack rows with channel, status (delivered /
    failed / pending), target, timestamp, Slack permalink, and error.
  - *Battlecards*: per-competitor version history (trigger: routing/worker/manual/startup) with
    drill-down into each snapshot; **Update now** records a manual version.
- **Alert Rules** — create rules with a `slack` channel; matching signals get pushed to Slack and
  logged. `#channel` or channel-id targets.

## 4. Slack bot (optional — configurable from the UI)

Set it from the **Monitoring → Slack Bot** card in the web UI — paste your own
`xoxb-` bot token, `xapp-` app token, optional signing secret, channel + web URL,
then **Save**. The engine stores them in your local DB and the bot connects within
~15s — **no `.env` edit and no restart needed**. Tokens are masked on read and never
shown back to you in full.

### Creating the Slack app (once)
1. On **api.slack.com/apps → sign in → Create an App → "From a manifest"**.
   A ready-to-paste manifest is provided in this package: see `SLACK_MANIFEST.yaml`
   at the repo root. Choose your workspace, paste, **Create**.
2. Under **OAuth & Permissions**, add bot scopes: `chat:write`, `chat:write.public`,
   `channels:read`, `groups:read`, `im:write`, `app_mentions:read`.
3. **Install to Workspace → Allow**, then copy the **Bot User OAuth Token** (`xoxb-…`).
4. (Full interactivity only) Enable **Socket Mode** and generate an **App-Level Token**
   (`xapp-…`) under **Basic Information → App-Level Tokens**, with `connections:write`.

**Important gotcha:** if the app was already installed *before* you added the scopes,
you must **Reinstall to Workspace** afterward — otherwise the token still reports
`missing_scope` and won't post into channels even though the bot connects. Also invite
the bot into the target channel (channel → name → **Integrations → Add apps**).

### .env fallback
Alternatively (or as a fallback), set in `.env` and restart the engine:

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
SLACK_DEFAULT_CHANNEL=#ase-alerts
ASE_WEB_APP_URL=http://localhost:5173
```

When enabled: pushes rich Signal Cards; `/ase status`, `/ase signals [competitor] [filter]`,
`/ase help`; DM/mention replies; buttons (Open signal / View battlecard / Mute rule) resolving to
the web app. Without tokens, delivery degrades gracefully (bell-only, no crash); the standalone
daemon idles and connects automatically the moment you add tokens from the UI.

> PMM daily cap: at most **3 Slack Signal Cards / day** per org; extras are suppressed and logged
> (`daily_cap_reached`) without demoting the signal's `signal_card` status.

## 5. Verify it works

1. After registering, the dashboard loads competitors + signals.
2. Add a competitor (name + website URL) in **Competitors** → the collector picks it up on the
   refresh interval and runs it through classify → score → route.
3. Route a `signal_card` (score ≥ 7) → the battlecard regenerates automatically, Activity →
   Battlecards shows a `routing` version, and (with Slack configured) a rich alert is pushed.
4. Gate check: `npm run typecheck && npm run lint && npm test` (backend) and
   `cd web && npm run typecheck && npm run build` (web).

## Ports
| Service | Port | Notes |
|---|---|---|
| API | 3000 | `curl localhost:3000/health` |
| Web UI | 5173 | Vite dev server |
| Postgres | 5432 | Docker (`ase-postgres`) |
| Scraper | 8410 | Docker (`ase-scraper`), optional for JS/anti-bot pages |

## Gotchas
- **No signals appearing** — the API alone doesn't scrape. Use `npm run engine` (or run each
  `worker:*`).
- **HTTP 444 / empty competitor page** — site blocks plain HTTP; it must go through the Scrapling
  sidecar (`docker compose up -d scraper`).
- **Classifier errors** — OpenCode Zen credential missing/expired: `opencode auth login`.
- **`EADDRINUSE :3000`** — a previous engine/API is running; stop it first.
- npm 11 blocks install scripts by default — native deps need `npm install-scripts approve`.
