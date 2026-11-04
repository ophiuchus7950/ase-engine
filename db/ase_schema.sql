-- ============================================================================
-- RIVELA — AUTONOMOUS SIGNAL ENGINE (ASE) — CORE SCHEMA
-- PostgreSQL | Multi-tenant | Scope: F1.1 pipeline only
--   (Collection → Normalization/Dedup → Classification → Scoring → Routing)
--
-- NOTE ON SCOPE: ASE signals inherently belong to an organization (tenant)
-- and a competitor (see PDF Section 6.2: raw data includes competitor_id).
-- Since full org/competitor management was explicitly marked out of scope,
-- the two tables below (organizations, competitors) are included as MINIMAL
-- STUB ANCHORS ONLY — just enough columns for the FKs to resolve. If you
-- already have these tables elsewhere, drop these two and point the FKs at
-- your existing tables instead.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STUB ANCHOR TABLES (replace with your real tables if they already exist)
-- ----------------------------------------------------------------------------

CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE competitors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------

-- Section 6.1 — data collection sources
CREATE TYPE source_type AS ENUM (
    'competitor_website',
    'g2',
    'capterra',
    'trustradius',
    'job_board',
    'news_rss',
    'social_twitter',
    'social_linkedin',
    'social_reddit',
    'gong_chorus',
    'salesforce',
    'hubspot',
    'slack',
    'sec_edgar',
    'patents'
);

-- Section 6.2, Stage 1 classification — action type
CREATE TYPE action_type AS ENUM (
    'pricing',
    'product',
    'personnel',
    'messaging',
    'partnership',
    'funding',
    'customer_win',
    'regulatory',
    'other'
);

-- Section 6.2, Stage 1 classification — confidence level
CREATE TYPE confidence_level AS ENUM ('high', 'medium', 'low');

-- Section 6.2, routing engine — where a signal ends up
CREATE TYPE routing_decision AS ENUM ('signal_card', 'weekly_digest', 'archive');

-- ----------------------------------------------------------------------------
-- DATA SOURCES — configured monitoring targets (Section 6.1 table)
-- ----------------------------------------------------------------------------

CREATE TABLE data_sources (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- Nullable: some sources are org-wide (Slack, CRM), others are per-competitor (website, G2)
    competitor_id       UUID REFERENCES competitors(id) ON DELETE CASCADE,
    source_type         source_type NOT NULL,
    target_url          TEXT,                       -- e.g. competitor pricing page URL
    collection_method   TEXT NOT NULL,               -- e.g. "Playwright headless diff", "Apify LinkedIn Jobs Actor"
    refresh_interval_minutes INTEGER NOT NULL,        -- e.g. 240 for every 4 hrs, 1440 for every 24 hrs
    is_active           BOOLEAN NOT NULL DEFAULT true,
    last_collected_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_sources_org ON data_sources(organization_id);
CREATE INDEX idx_data_sources_competitor ON data_sources(competitor_id);
CREATE INDEX idx_data_sources_active_due ON data_sources(is_active, last_collected_at);

-- ----------------------------------------------------------------------------
-- RAW SIGNALS — append-only ingestion layer (post-normalization, pre-LLM)
-- Section 6.2: {source_type, competitor_id, raw_text, timestamp, url, collection_method}
-- ----------------------------------------------------------------------------

CREATE TABLE raw_signals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    competitor_id       UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    data_source_id      UUID REFERENCES data_sources(id) ON DELETE SET NULL,
    source_type         source_type NOT NULL,
    raw_text            TEXT NOT NULL,
    source_url          TEXT,
    collection_method   TEXT NOT NULL,
    collected_at        TIMESTAMPTZ NOT NULL,        -- when the source event/page was captured
    content_hash        TEXT NOT NULL,                -- hash(raw_text + competitor_id) for dedup
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (competitor_id, content_hash)              -- dedup enforcement per Section 6.2
);

CREATE INDEX idx_raw_signals_org ON raw_signals(organization_id);
CREATE INDEX idx_raw_signals_competitor ON raw_signals(competitor_id);
CREATE INDEX idx_raw_signals_collected_at ON raw_signals(collected_at);

-- ----------------------------------------------------------------------------
-- SIGNALS — processed/classified layer, 1:1 with raw_signals
-- Combines Stage 1 (classification) + Stage 2 (significance scoring) +
-- routing outcome, per Section 6.2 pipeline diagram.
-- ----------------------------------------------------------------------------

CREATE TABLE signals (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_signal_id           UUID NOT NULL UNIQUE REFERENCES raw_signals(id) ON DELETE CASCADE,
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    competitor_id           UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,

    -- Stage 1: LLM Classification
    action_type             action_type NOT NULL,
    confidence_level        confidence_level NOT NULL,
    key_facts               JSONB NOT NULL DEFAULT '[]',   -- 2-3 extracted bullet facts
    llm_model_used          TEXT,
    classified_at           TIMESTAMPTZ,

    -- Stage 2: Significance Scoring (weighted factors, Section 6.2)
    score_recency            SMALLINT NOT NULL DEFAULT 0,   -- +2 if signal <48hrs old
    score_source_authority   SMALLINT NOT NULL DEFAULT 0,   -- +2 primary / +1 secondary / 0 social
    score_action_type        SMALLINT NOT NULL DEFAULT 0,   -- +3 pricing / +2 product launch / +1 personnel
    score_icp_relevance      SMALLINT NOT NULL DEFAULT 0,   -- +2 if matches tracked ICP
    score_deal_stage_context SMALLINT NOT NULL DEFAULT 0,   -- +2 if matches active deal competitor
    score_novelty             SMALLINT NOT NULL DEFAULT 0,   -- +1 first detection / -1 repeated
    significance_score       SMALLINT NOT NULL,              -- sum of factors above, 1-10
    scored_at                TIMESTAMPTZ,

    -- Routing Engine outcome
    routing_decision         routing_decision NOT NULL,
    battlecard_update_triggered BOOLEAN NOT NULL DEFAULT false,
    deal_alert_check_triggered  BOOLEAN NOT NULL DEFAULT false,
    routed_at                TIMESTAMPTZ,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_significance_range CHECK (significance_score BETWEEN 1 AND 10)
);

CREATE INDEX idx_signals_org ON signals(organization_id);
CREATE INDEX idx_signals_competitor ON signals(competitor_id);
CREATE INDEX idx_signals_routing ON signals(routing_decision);
CREATE INDEX idx_signals_significance ON signals(significance_score DESC);
CREATE INDEX idx_signals_action_type ON signals(action_type);

-- ----------------------------------------------------------------------------
-- updated_at trigger for data_sources
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_data_sources_updated_at
BEFORE UPDATE ON data_sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
