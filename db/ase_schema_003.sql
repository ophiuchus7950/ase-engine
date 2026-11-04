-- ============================================================================
-- Rivela ASE — schema 003: battlecard history + Slack delivery log + runtime
-- Slack settings (v2 features)
--
-- Adds battlecard_versions (append-only regeneration log), extends
-- notifications with the Slack delivery log, and adds slack_settings (a
-- per-org runtime config so the user can supply their own bot tokens from the
-- UI instead of only via .env). Tokens live in the local DB only; the API
-- masks them on read.
--
-- trigger: 'routing' | 'worker' | 'manual' | 'startup'
-- Idempotent: uses IF NOT EXISTS so re-runs are safe (matches 002 convention).
-- ============================================================================

CREATE TABLE IF NOT EXISTS battlecard_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id   UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    trigger         TEXT NOT NULL,             -- 'routing' | 'worker' | 'manual' | 'startup'
    content         JSONB NOT NULL,            -- BattlecardContent snapshot
    source_signal_count INTEGER NOT NULL DEFAULT 0,
    triggered_by_signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_battlecard_versions_competitor_generated
  ON battlecard_versions(competitor_id, generated_at DESC);

-- Slack delivery-log columns on notifications.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channel_target TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS slack_ts TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS permalink TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS error TEXT;

-- Per-org runtime Slack bot config (set from the Monitoring UI). Empty columns
-- mean "not configured" -> the engine falls back to .env / no-op.
CREATE TABLE IF NOT EXISTS slack_settings (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    bot_token       TEXT NOT NULL DEFAULT '',
    app_token       TEXT NOT NULL DEFAULT '',
    signing_secret  TEXT NOT NULL DEFAULT '',
    default_channel TEXT NOT NULL DEFAULT '#ase-alerts',
    web_app_url     TEXT NOT NULL DEFAULT 'http://localhost:5173',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
