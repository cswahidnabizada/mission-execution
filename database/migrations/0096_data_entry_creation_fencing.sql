-- ON Mission 10.39.0 — Data Entry creation fencing
-- Every canonical top-level resource created through the Data Entry Gate carries
-- the originating entry_id. This closes the crash/retry gap between canonical
-- creation and the Data Entry ledger commit.
ALTER TABLE platform_product_definitions ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_country_product_blueprints ADD COLUMN data_entry_id TEXT;
ALTER TABLE country_product_launches ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_product_expansion_cases ADD COLUMN data_entry_id TEXT;
ALTER TABLE platform_configuration_versions ADD COLUMN data_entry_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_definition_data_entry ON platform_product_definitions(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_country_blueprint_data_entry ON platform_country_product_blueprints(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_country_launch_data_entry ON country_product_launches(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_expansion_case_data_entry ON platform_product_expansion_cases(data_entry_id) WHERE data_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_configuration_version_data_entry ON platform_configuration_versions(data_entry_id) WHERE data_entry_id IS NOT NULL;
