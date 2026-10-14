-- ON Mission 10.36.8 — production migration/data dependency verification
-- Read-only. Expected result: zero rows.
SELECT 'DE_PRIVACY_REQUESTS' AS dependency WHERE NOT EXISTS (SELECT 1 FROM retention_policies WHERE code='DE_PRIVACY_REQUESTS')
UNION ALL SELECT 'DE_COMPLIANCE_REVIEW' WHERE NOT EXISTS (SELECT 1 FROM retention_policies WHERE code='DE_COMPLIANCE_REVIEW')
UNION ALL SELECT 'DE-GDPR-1' WHERE NOT EXISTS (SELECT 1 FROM jurisdiction_policies WHERE code='DE-GDPR-1')
UNION ALL SELECT 'security_audit' WHERE NOT EXISTS (SELECT 1 FROM processing_purposes WHERE code='security_audit')
UNION ALL SELECT 'DE_BACKUP_DEFAULT' WHERE NOT EXISTS (SELECT 1 FROM retention_policies WHERE code='DE_BACKUP_DEFAULT')
UNION ALL SELECT 'compliance_evidence_registry' WHERE NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='compliance_evidence_registry')
UNION ALL SELECT 'canonical_domain_registry' WHERE NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='canonical_domain_registry')
UNION ALL SELECT 'canonical_capability_registry' WHERE NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='canonical_capability_registry');
