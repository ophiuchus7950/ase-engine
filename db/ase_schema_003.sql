-- ============================================================================
-- Rivela ASE — schema 003: battlecard history (v2 feature)
--
-- Adds battlecard_versions, an append-only regeneration log per competitor.
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
