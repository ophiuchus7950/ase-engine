-- ============================================================================
-- RIVELA ASE — DEV SEED DATA (idempotent)
-- 1 organization, 2 competitors, 3 data sources, 3 unclassified raw signals.
-- Raw signals are intentionally left WITHOUT signals rows so the classification
-- worker queue (/raw-signals/unclassified) has work on first boot.
-- content_hash values are deterministic per competitor (dedup key).
-- ============================================================================

INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Acme Corp')
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

INSERT INTO raw_signals (id, organization_id, competitor_id, data_source_id, source_type, raw_text, source_url, collection_method, collected_at, content_hash) VALUES
  (
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000020',
    'competitor_website',
    'Globex has updated its pricing page: the Enterprise plan is now $99 per user per month, up from $79. Annual billing discount removed.',
    'https://globex.example.com/pricing',
    'http_fetch',
    now() - interval '6 hours',
    'seed-hash-globex-pricing-v2'
  ),
  (
    '00000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000021',
    'g2',
    'A new G2 review on Globex: "Support team is great but the onboarding took us 6 weeks. Custom reporting is behind a paywall."',
    'https://www.g2.com/products/globex/reviews/12345',
    'g2_api',
    now() - interval '2 days',
    'seed-hash-globex-g2-onboarding'
  ),
  (
    '00000000-0000-0000-0000-000000000032',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    NULL,
    'news_rss',
    'Initech announced a partnership with BigCloud to bundle their analytics suite with BigCloud''s enterprise cloud credits.',
    'https://news.example.com/initech-partnership',
    'rss_fetch',
    now() - interval '30 hours',
    'seed-hash-initech-partnership'
  )
ON CONFLICT DO NOTHING;
