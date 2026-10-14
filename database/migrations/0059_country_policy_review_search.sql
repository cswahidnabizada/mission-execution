-- ON Mission 10.31.90 — reviewer country search/recent ordering index.
-- No country data is removed or rewritten.
CREATE INDEX IF NOT EXISTS idx_country_catalog_active_updated ON country_catalog(active, updated_at DESC, created_at DESC);
