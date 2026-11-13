-- 16.115: universal platform foundation and safe AF capability-binding reconciliation.
-- Forward repair for D1 databases where 0168 is already recorded as applied.
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','general',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches","reconciledBy":"0175"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='general');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','trade',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches","reconciledBy":"0175"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='trade');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','retail',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches","reconciledBy":"0175"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='retail');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','logistics',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches","reconciledBy":"0175"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='logistics');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','fx',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches","reconciledBy":"0175"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='fx');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','labor',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches","reconciledBy":"0175"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='labor');

CREATE TABLE IF NOT EXISTS platform_configuration_releases (
 release_id TEXT PRIMARY KEY,
 scope_type TEXT NOT NULL CHECK(scope_type IN ('global','country','sector','product','tenant')),
 scope_key TEXT NOT NULL,
 version TEXT NOT NULL,
 lifecycle_status TEXT NOT NULL CHECK(lifecycle_status IN ('draft','validated','certified','published','retired','suspended')),
 configuration_json TEXT NOT NULL CHECK(json_valid(configuration_json)),
 parent_release_id TEXT,
 evidence_json TEXT NOT NULL DEFAULT '{}',
 created_by_identity_id INTEGER,
 published_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(scope_type,scope_key,version),
 FOREIGN KEY(parent_release_id) REFERENCES platform_configuration_releases(release_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_configuration_one_published_scope ON platform_configuration_releases(scope_type,scope_key) WHERE lifecycle_status='published';
CREATE INDEX IF NOT EXISTS idx_platform_configuration_scope_status ON platform_configuration_releases(scope_type,scope_key,lifecycle_status,updated_at DESC);
CREATE TABLE IF NOT EXISTS platform_configuration_release_events (
 event_id TEXT PRIMARY KEY,
 release_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('created','validated','certified','published','suspended','retired','rollback')),
 actor_identity_id INTEGER,
 reason TEXT NOT NULL,
 evidence_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(release_id) REFERENCES platform_configuration_releases(release_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_configuration_events_release ON platform_configuration_release_events(release_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_platform_configuration_events_no_update BEFORE UPDATE ON platform_configuration_release_events BEGIN SELECT RAISE(ABORT,'PLATFORM_CONFIGURATION_EVENTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_platform_configuration_events_no_delete BEFORE DELETE ON platform_configuration_release_events BEGIN SELECT RAISE(ABORT,'PLATFORM_CONFIGURATION_EVENTS_IMMUTABLE'); END;
INSERT OR IGNORE INTO platform_configuration_releases(release_id,scope_type,scope_key,version,lifecycle_status,configuration_json,evidence_json,published_at)
VALUES('onmission:global-default:v1','global','default','1.0.0','published',
'{"schema":"onmission.platform-package.v1","name":"ON Mission Universal Default","principles":["one_platform","one_canonical_mission_runtime","country_sector_product_tenant_composition","security_invariants_are_non_overridable"],"configurationHierarchy":["global","country","sector","product","tenant","mission"],"defaultWorkspace":"mission-home","onboarding":{"mode":"universal","registration":"open_intake","activationRequires":["identity_verified","subscription_active","activation_code_valid","product_eligible"],"intents":["mission_execution","business_management","digital_daftar","logistics_operations","market_intelligence","explore_platform"],"accountTypes":["individual","business","organization","service_provider"],"unknownClassificationFallback":"general-workspace"},"capabilityCatalogue":["mission-execution","digital-daftar","daftar-inventory","daftar-credit","daftar-accounting-book","daftar-offline","public-market-data"],"countryAvailability":{"selection":"interest_allowed","execution":"certified_and_activated_only"},"security":{"tenantIsolation":"mandatory","serverSideAuthorization":"mandatory","failClosed":true,"audit":"append_only","configurationVersionPinnedToMission":true,"lowerScopesCannotRelaxHigherScopeRestrictions":true},"marketIntelligence":{"privateTransactionsRemainPrivate":true,"contributionRequiresExplicitConsent":true,"publishRequiresCohortAndQualityGates":true,"minimumCohortSize":5,"publicProjectionOnly":true},"missionJourney":["OBSERVE","UNDERSTAND","PLAN","EVALUATE","ACCEPT","AUTHORIZE","PREPARE","ASSIGN","EXECUTE","EFFECT","VERIFY","RECOVER","OUTCOME","LEARN","NEXT SITUATION"]}',
'{"seed":"0175","authority":"platform_configuration_releases"}',CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS platform_onboarding_intakes (
 intake_id TEXT PRIMARY KEY,
 idempotency_key TEXT NOT NULL UNIQUE,
 intent_code TEXT NOT NULL CHECK(intent_code IN ('mission_execution','business_management','digital_daftar','logistics_operations','market_intelligence','explore_platform')),
 account_type TEXT NOT NULL CHECK(account_type IN ('individual','business','organization','service_provider')),
 country_code TEXT,
 sector_code TEXT NOT NULL DEFAULT 'general',
 product_code TEXT,
 preferred_language TEXT NOT NULL DEFAULT 'en',
 consent_version TEXT NOT NULL,
 lifecycle_status TEXT NOT NULL DEFAULT 'received' CHECK(lifecycle_status IN ('received','reviewing','converted','closed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_onboarding_intakes_review ON platform_onboarding_intakes(lifecycle_status,created_at DESC);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_configuration_releases','configuration_json','CONFIDENTIAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_configuration_releases','evidence_json','CONFIDENTIAL','platform_infrastructure_governance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_configuration_release_events','reason','INTERNAL','platform_infrastructure_governance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_configuration_release_events','evidence_json','CONFIDENTIAL','platform_infrastructure_governance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_onboarding_intakes','intent_code','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_onboarding_intakes','country_code','PERSONAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
