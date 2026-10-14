-- ON Mission 10.36.8 — Canonical Domain & Capability Universalization
-- Registries describe platform vocabulary and capability boundaries. They are not
-- alternate truth, authorization, lifecycle, or relationship-record stores.

CREATE TABLE IF NOT EXISTS canonical_domain_registry (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  layer TEXT NOT NULL CHECK(layer IN ('platform','domain_extension')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','planned','retired')),
  version TEXT NOT NULL DEFAULT '1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS canonical_capability_registry (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  domain_code TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','planned','retired')),
  version TEXT NOT NULL DEFAULT '1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(domain_code) REFERENCES canonical_domain_registry(code)
);

CREATE TABLE IF NOT EXISTS canonical_relationship_type_registry (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  relationship_scope TEXT NOT NULL CHECK(relationship_scope IN ('platform','capability')),
  capability_code TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','planned','retired')),
  version TEXT NOT NULL DEFAULT '1',
  FOREIGN KEY(capability_code) REFERENCES canonical_capability_registry(code)
);

CREATE TABLE IF NOT EXISTS canonical_vocabulary_registry (
  canonical_term TEXT NOT NULL,
  legacy_term TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('platform','logistics','storage','api','database')),
  replacement_rule TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'replace' CHECK(status IN ('replace','internal_only','retired')),
  version TEXT NOT NULL DEFAULT '1',
  PRIMARY KEY(canonical_term,legacy_term,scope)
);

CREATE TABLE IF NOT EXISTS canonical_object_type_registry (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  object_domain TEXT NOT NULL DEFAULT 'platform',
  capability_code TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','planned','retired')),
  version TEXT NOT NULL DEFAULT '1',
  FOREIGN KEY(capability_code) REFERENCES canonical_capability_registry(code)
);

CREATE INDEX IF NOT EXISTS idx_canonical_capability_domain ON canonical_capability_registry(domain_code,status);
CREATE INDEX IF NOT EXISTS idx_canonical_relationship_scope ON canonical_relationship_type_registry(relationship_scope,status);
CREATE INDEX IF NOT EXISTS idx_canonical_object_type_capability ON canonical_object_type_registry(capability_code,status);

INSERT OR IGNORE INTO canonical_domain_registry(code,label,layer,description)
VALUES
('platform','Platform','platform','Universal ON Mission mission-execution concepts and governance boundaries.'),
('logistics','Logistics','domain_extension','Logistics-specific capability extensions implemented on the universal mission platform.');

INSERT OR IGNORE INTO canonical_capability_registry(code,label,domain_code,description)
VALUES
('identity','Identity','platform','Authenticated identity, session and account context.'),
('organization','Organization','platform','Organization identity, membership and company context.'),
('mission','Mission','platform','Canonical mission truth, lifecycle and execution context.'),
('people','People','platform','People records and platform relationships; execution responsibility is contextual, not a nested domain.'),
('object','Object','platform','Universal objects participating in missions.'),
('resource','Resource','platform','Universal resources that support mission execution.'),
('relationship','Relationship','platform','Canonical relationship semantics across platform entities.'),
('communication','Communication','platform','Authorized communication associated with mission and platform context.'),
('evidence','Evidence','platform','Governed evidence and historical proof metadata.'),
('policy','Policy','platform','Policy, compliance and governance context.'),
('capability','Capability','platform','Capability discovery and domain-extension boundary.'),
('logistics','Logistics','logistics','Logistics execution extension over the universal mission platform.');

INSERT OR IGNORE INTO canonical_relationship_type_registry(code,label,source_type,target_type,relationship_scope,capability_code,description)
VALUES
('organization_mission_participation','Organization participates in Mission','organization','mission','platform','organization','An organization participates in a mission through an authorized relationship.'),
('person_mission_participation','Person participates in Mission','person','mission','platform','people','A person participates in a mission; responsibility is derived from authorization and mission truth.'),
('person_mission_execution_responsibility','Person has Mission execution responsibility','person','mission','platform','mission','Execution responsibility is a mission relationship, not a People subdomain.'),
('object_mission_participation','Object participates in Mission','object','mission','platform','object','An object is associated with a mission through canonical mission truth.'),
('resource_mission_support','Resource supports Mission','resource','mission','platform','resource','A resource supports mission execution without becoming mission truth.'),
('logistics_object_execution','Logistics Object execution context','object','mission','capability','logistics','Logistics-specific object execution context; canonical object remains the platform concept.');

INSERT OR IGNORE INTO canonical_vocabulary_registry(canonical_term,legacy_term,scope,replacement_rule,status)
VALUES
('Executor','Driver','platform','Use Executor in user-facing platform concepts; retain driver storage identifiers only where required by the current data plane.','replace'),
('Executor','driver','api','Canonical action and UI semantics use Executor; storage/provider adapters may retain legacy identifiers until data-plane migration.','internal_only'),
('Object','Cargo','platform','Cargo is a logistics object type and must appear under Objects with Logistics capability context.','replace'),
('Mission','Delivery','platform','Delivery is a logistics mission subtype/context, not the universal mission entity.','replace'),
('Organization','Customer','platform','Customer is a relationship/context label where required, not the universal organization entity.','replace'),
('Resource','Vehicle','logistics','Vehicle is a logistics resource type, not the universal resource entity.','replace');

INSERT OR IGNORE INTO canonical_object_type_registry(code,label,object_domain,capability_code,description)
VALUES
('generic_object','Object','platform','object','Universal mission object.'),
('cargo','Cargo','logistics','logistics','Logistics object type presented inside the universal Objects domain.');

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('canonical_domain_registry','description','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('canonical_capability_registry','description','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('canonical_relationship_type_registry','description','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('canonical_vocabulary_registry','legacy_term','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('canonical_object_type_registry','description','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
