-- ============================================================================
-- Rivela ASE — schema 002: product-facing features (single-user MVP)
--
-- Adds the tables/columns needed for the web frontend's product controls:
--   users        — name + password login (single user, MVP)
--   alert_rules  — user-configurable notification rules (affect routing +
--                  fire real notifications when a signal matches)
--   notifications— delivered alert records shown in the bell panel
--   battlecards  — regenerable per-competitor battlecard documents
--   signals.bookmarked — user bookmark toggle on the feed
--
-- Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so re-runs are
-- safe (matches migrate.ts's tolerate-re-runs contract).
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User-configurable alert rules. `triggers` holds the match criteria
-- (min_score, categories, competitor_ids, keywords); `channels` holds
-- delivery targets ({type: email|webhook, target}); `routing_override`
-- lets a matching rule escalate routing (e.g. force signal_card).
CREATE TABLE IF NOT EXISTS alert_rules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    enabled           BOOLEAN NOT NULL DEFAULT true,
    triggers          JSONB NOT NULL DEFAULT '{}'::jsonb,
    channels          JSONB NOT NULL DEFAULT '[]'::jsonb,
    routing_override  TEXT,  -- 'signal_card' | 'weekly_digest' | 'archive' | NULL
    fired_count       INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    signal_id       UUID REFERENCES signals(id) ON DELETE CASCADE,
    rule_id         UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    channel         TEXT NOT NULL DEFAULT 'in_app',  -- in_app | email | webhook
    status          TEXT NOT NULL DEFAULT 'delivered',  -- delivered | failed | pending
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_org_created ON notifications(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(organization_id, read_at);

-- Per-competitor battlecard document (content JSONB, regenerated on demand).
CREATE TABLE IF NOT EXISTS battlecards (
    competitor_id   UUID PRIMARY KEY REFERENCES competitors(id) ON DELETE CASCADE,
    content         JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bookmarks: user marks signals they care about; feed filter ?bookmarked=true.
ALTER TABLE signals ADD COLUMN IF NOT EXISTS bookmarked BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_signals_bookmarked ON signals(bookmarked);
