-- ============================================================================
-- RIVELA ASE — DEV SEED DATA (idempotent)
-- 1 organization, the local no-auth user, 2 demo competitors with sources.
-- Starts clean: no signals. Add a competitor (or use the demo ones) and let
-- the collector run to populate the pipeline.
-- ============================================================================

INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Acme Corp')
ON CONFLICT DO NOTHING;

-- The no-auth local user the API attributes every request to (see
-- src/api/middleware/session.ts). password_hash is unused in local mode.
INSERT INTO users (id, organization_id, name, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'local', '-')
ON CONFLICT DO NOTHING;

INSERT INTO competitors (id, organization_id, name) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Globex'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Initech')
ON CONFLICT DO NOTHING;

INSERT INTO data_sources (id, organization_id, competitor_id, source_type, target_url, collection_method, refresh_interval_minutes, is_active) VALUES
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'competitor_website', 'https://globex.example.com/pricing', 'http_fetch', 240, true),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'g2', 'https://www.g2.com/products/globex/reviews', 'g2_api', 1440, true),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', NULL, 'news_rss', 'https://news.example.com/feed.xml', 'rss_fetch', 60, true)
ON CONFLICT DO NOTHING;
