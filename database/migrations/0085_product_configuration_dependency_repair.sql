-- ON Mission 10.37.12 — Product configuration dependency repair
-- Repairs the governance dependency used by migrations 0083/0084.
-- Idempotent and safe for databases where the prerequisite rows already exist.

INSERT OR IGNORE INTO processing_purposes
(code,label,description,default_legal_basis,data_minimization_rule)
VALUES
('product_configuration',
 'Product configuration',
 'Govern and operate platform product configuration, country launch configuration, eligibility rules and controlled product activation.',
 'legitimate_interests',
 'Store only configuration data necessary to govern and operate the configured product.');

-- DE_COMPLIANCE_REVIEW is created by the earlier canonical compliance migration.
-- Do not redefine it here; this repair only guarantees the product configuration
-- purpose exists before data_classification_registry references it.
