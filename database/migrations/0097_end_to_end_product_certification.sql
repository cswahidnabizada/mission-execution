-- ON Mission 10.40.0 — End-to-End Product Certification
-- Certification is an observation/governance layer. It does not replace canonical authorities.
CREATE TABLE IF NOT EXISTS platform_data_entry_certifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 resource_type TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 classification TEXT NOT NULL CHECK(classification IN ('GOVERNED','LEGACY_TEST','LEGACY_REVIEW')),
 confidence TEXT NOT NULL CHECK(confidence IN ('high','medium','review')),
 reason TEXT NOT NULL DEFAULT '',
 entry_id TEXT,
 actor_type TEXT NOT NULL,
 actor_id TEXT,
 certified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(resource_type,resource_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_entry_cert_classification ON platform_data_entry_certifications(classification,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_entry_cert_resource ON platform_data_entry_certifications(resource_type,resource_id);
INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('platform_product_certification','Platform product certification','Certify lifecycle convergence, governed data entry coverage and legacy platform-data disposition without replacing canonical authorities.','legitimate_interests','Store only certification state, reason, provenance and linkage required for platform governance.');
INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES('DE_PLATFORM_PRODUCT_CERTIFICATION','platform_product_certification','DE-GDPR-1','general',365,'review',1,'1');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_data_entry_certifications','reason','INTERNAL','platform_product_certification','DE_PLATFORM_PRODUCT_CERTIFICATION',0,1,'DE-GDPR-1'),
('platform_data_entry_certifications','entry_id','INTERNAL','platform_product_certification','DE_PLATFORM_PRODUCT_CERTIFICATION',0,1,'DE-GDPR-1');
