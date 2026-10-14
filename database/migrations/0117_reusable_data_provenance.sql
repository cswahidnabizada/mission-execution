-- ON Mission 10.63.0 — Reusable Data Provenance & Idempotency Fence
-- Extend canonical reusable authorities with the governed Data Entry provenance key.
-- NULL remains valid for records created by other canonical workflows.
ALTER TABLE platform_product_country_catalog ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_sectors ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_languages ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_currencies ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_regions ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_classifications ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_policies ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_responsibilities ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_storage_registry ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_pages ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_features ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_guidance ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_eligibility ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_reusable_pricing ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_product_definition_components ADD COLUMN data_entry_id TEXT;
ALTER TABLE organization_role_catalog ADD COLUMN data_entry_id TEXT;
ALTER TABLE canonical_capability_registry ADD COLUMN data_entry_id TEXT;
ALTER TABLE external_provider_registry ADD COLUMN data_entry_id TEXT;
ALTER TABLE plans ADD COLUMN data_entry_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_country_data_entry ON platform_product_country_catalog(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_sector_data_entry ON platform_reusable_sectors(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_language_data_entry ON platform_reusable_languages(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_currency_data_entry ON platform_reusable_currencies(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_region_data_entry ON platform_reusable_regions(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_classification_data_entry ON platform_reusable_classifications(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_policy_data_entry ON platform_reusable_policies(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_responsibility_data_entry ON platform_reusable_responsibilities(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_data_entry ON platform_storage_registry(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_page_data_entry ON platform_reusable_pages(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_feature_data_entry ON platform_reusable_features(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_guidance_data_entry ON platform_reusable_guidance(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_eligibility_data_entry ON platform_reusable_eligibility(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reusable_pricing_data_entry ON platform_reusable_pricing(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_component_data_entry ON platform_product_definition_components(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_data_entry ON organization_role_catalog(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_capability_data_entry ON canonical_capability_registry(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_data_entry ON external_provider_registry(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_data_entry ON plans(data_entry_id) WHERE data_entry_id IS NOT NULL;
