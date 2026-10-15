-- ON Mission current database schema snapshot
-- Generated from the complete ordered migration chain through 0157.
-- This is the canonical schema snapshot for fresh/recovery environments.
-- Production evolution remains migration-first: apply database/migrations/*.sql in order.
-- Do not edit manually; regenerate with scripts/generate-schema-current.mjs.

PRAGMA foreign_keys=ON;

-- table: action_execution_telemetry
CREATE TABLE action_execution_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  mission_id INTEGER,
  actor_role TEXT NOT NULL,
  action_code TEXT NOT NULL,
  phase TEXT NOT NULL,
  outcome TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  request_id TEXT,
  client_timestamp TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
, trace_id TEXT, event_sequence INTEGER);

-- table: activation_review_requests
CREATE TABLE activation_review_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_type TEXT NOT NULL CHECK (identity_type IN ('tenant','driver','executor')),
  identity_id INTEGER NOT NULL,
  tenant_id INTEGER,
  requested_fields TEXT NOT NULL,
  reviewer_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, user_completed_at TEXT);

-- table: admin_control_audit_events
CREATE TABLE admin_control_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  target_company_id INTEGER,
  request_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: agent_action_autonomy_policies
CREATE TABLE agent_action_autonomy_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_code TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('GLOBAL','COUNTRY','SECTOR','COUNTRY_SECTOR','COMPANY')),
  scope_key TEXT NOT NULL,
  max_autonomy_level INTEGER NOT NULL CHECK(max_autonomy_level BETWEEN 0 AND 5),
  execution_enabled INTEGER NOT NULL DEFAULT 0 CHECK(execution_enabled IN (0,1)),
  human_approval_required INTEGER NOT NULL DEFAULT 1 CHECK(human_approval_required IN (0,1)),
  verification_required INTEGER NOT NULL DEFAULT 1 CHECK(verification_required IN (0,1)),
  provider_required INTEGER NOT NULL DEFAULT 0 CHECK(provider_required IN (0,1)),
  recovery_policy TEXT NOT NULL CHECK(recovery_policy IN ('REASSESS','RETRY_CANDIDATE','ESCALATE_HUMAN')),
  jurisdiction_mode TEXT NOT NULL DEFAULT 'POLICY_REQUIRED' CHECK(jurisdiction_mode IN ('POLICY_REQUIRED','RESTRICTED','DISABLED')),
  policy_version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  updated_by_role TEXT,
  updated_by_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(action_code,scope_type,scope_key)
);

-- table: agent_action_outcome_profiles
CREATE TABLE agent_action_outcome_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  action_code TEXT NOT NULL,
  profile_version INTEGER NOT NULL DEFAULT 1,
  observed_outcomes INTEGER NOT NULL DEFAULT 0,
  known_outcomes INTEGER NOT NULL DEFAULT 0,
  favorable_outcomes INTEGER NOT NULL DEFAULT 0,
  adverse_outcomes INTEGER NOT NULL DEFAULT 0,
  blocked_outcomes INTEGER NOT NULL DEFAULT 0,
  waiting_outcomes INTEGER NOT NULL DEFAULT 0,
  unknown_outcomes INTEGER NOT NULL DEFAULT 0,
  executed_events INTEGER NOT NULL DEFAULT 0,
  failed_events INTEGER NOT NULL DEFAULT 0,
  last_outcome_at TEXT,
  last_event_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id,action_code)
);

-- table: agent_calibration_observations
CREATE TABLE agent_calibration_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  decision_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  executor_id INTEGER,
  action_code TEXT NOT NULL,
  signal_code TEXT NOT NULL DEFAULT 'DECISION_OUTCOME',
  prediction_confidence TEXT NOT NULL CHECK(prediction_confidence IN ('LOW','MEDIUM','HIGH')),
  observed_outcome TEXT NOT NULL CHECK(observed_outcome IN ('RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN')),
  evaluation_class TEXT NOT NULL CHECK(evaluation_class IN ('CORRECT','INCORRECT','UNKNOWN','INCONCLUSIVE')),
  evidence_basis TEXT NOT NULL CHECK(evidence_basis IN ('RECORDED_AGENT_OUTCOME','UNKNOWN')),
  observation_version TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previous_observation_hash TEXT,
  observation_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: agent_calibration_profiles
CREATE TABLE agent_calibration_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('ORGANIZATION','ACTION','EXECUTOR')),
  scope_key TEXT NOT NULL,
  signal_code TEXT NOT NULL DEFAULT 'DECISION_OUTCOME',
  action_code TEXT,
  profile_version INTEGER NOT NULL DEFAULT 1,
  sample_count INTEGER NOT NULL DEFAULT 0,
  known_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  inconclusive_count INTEGER NOT NULL DEFAULT 0,
  confidence_sum REAL NOT NULL DEFAULT 0,
  confidence_error_sum REAL NOT NULL DEFAULT 0,
  accuracy REAL,
  mean_confidence REAL,
  calibration_error REAL,
  deference_state TEXT NOT NULL CHECK(deference_state IN ('INSUFFICIENT_DATA','DEFER','CAUTION','TRUSTED')) DEFAULT 'INSUFFICIENT_DATA',
  minimum_sample_size INTEGER NOT NULL DEFAULT 5,
  last_observation_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id,scope_type,scope_key,signal_code)
);

-- table: agent_calibration_runs
CREATE TABLE agent_calibration_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  company_id INTEGER,
  processed_events INTEGER NOT NULL DEFAULT 0,
  new_observations INTEGER NOT NULL DEFAULT 0,
  profiles_updated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('COMPLETED','DEGRADED','FAILED')),
  calibration_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  error_code TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

-- table: agent_company_autonomy_config
CREATE TABLE agent_company_autonomy_config (
  company_id INTEGER PRIMARY KEY,
  mode TEXT NOT NULL CHECK(mode IN ('DISABLED','RECOMMEND_ONLY','CONTROLLED_EXECUTION')) DEFAULT 'DISABLED',
  autonomy_level INTEGER NOT NULL CHECK(autonomy_level BETWEEN 0 AND 5) DEFAULT 0,
  execution_enabled INTEGER NOT NULL DEFAULT 0 CHECK(execution_enabled IN (0,1)),
  kill_switch_reason TEXT,
  policy_version TEXT NOT NULL,
  updated_by_role TEXT,
  updated_by_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: agent_customer_pilot_profiles
CREATE TABLE agent_customer_pilot_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','READY','ACTIVE','PAUSED','CLOSED')),
  operating_mode TEXT NOT NULL DEFAULT 'RECOMMEND_ONLY' CHECK(operating_mode IN ('OBSERVE','RECOMMEND_ONLY','PREPARE_ONLY','CONTROLLED_EXECUTION')),
  approved_action_codes_json TEXT NOT NULL DEFAULT '[]',
  required_provider_codes_json TEXT NOT NULL DEFAULT '[]',
  operator_roles_json TEXT NOT NULL DEFAULT '["admin"]',
  readiness_version TEXT NOT NULL DEFAULT '11.17.0',
  start_at TEXT,
  end_at TEXT,
  kill_switch_reason TEXT,
  created_by_role TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: agent_decision_events
CREATE TABLE agent_decision_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  decision_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  executor_id INTEGER,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('agent','human','system')),
  agent_id TEXT NOT NULL,
  action_code TEXT NOT NULL,
  intent_json TEXT NOT NULL DEFAULT '{}',
  context_version TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  plan_json TEXT NOT NULL DEFAULT '{}',
  candidates_json TEXT NOT NULL DEFAULT '[]',
  alignment_json TEXT NOT NULL DEFAULT '{}',
  risk_class TEXT NOT NULL CHECK(risk_class IN ('READ','ADVISORY','LOW_RISK','OPERATIONAL','HIGH_IMPACT','IRREVERSIBLE')),
  confidence TEXT NOT NULL CHECK(confidence IN ('LOW','MEDIUM','HIGH')),
  policy_version TEXT NOT NULL,
  autonomy_level INTEGER NOT NULL CHECK(autonomy_level BETWEEN 0 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}'
, policy_hash TEXT, policy_scope TEXT, policy_snapshot_json TEXT NOT NULL DEFAULT '{}');

-- table: agent_execution_attempts
CREATE TABLE agent_execution_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  decision_id TEXT NOT NULL,
  event_id TEXT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  executor_id INTEGER,
  action_code TEXT NOT NULL,
  action_version TEXT,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('agent','human','system')),
  actor_id TEXT,
  authorization_json TEXT NOT NULL DEFAULT '{}',
  request_hash TEXT NOT NULL,
  requested_effect_json TEXT NOT NULL DEFAULT '{}',
  observed_effect_json TEXT NOT NULL DEFAULT '{}',
  provider_code TEXT,
  provider_operation_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('PREPARED','AUTHORIZED','DISPATCHED','EXECUTING','SUCCEEDED','FAILED','UNKNOWN','VERIFYING','VERIFIED','RECOVERY_REQUIRED','RECOVERED')),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('NOT_REQUIRED','PENDING','VERIFIED','FAILED','UNKNOWN')),
  failure_code TEXT,
  recovery_state TEXT,
  context_hash TEXT NOT NULL,
  state_token_before TEXT,
  state_token_after TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
, policy_version TEXT, policy_hash TEXT, policy_scope TEXT, policy_snapshot_json TEXT NOT NULL DEFAULT '{}', execution_intent_id TEXT, assignment_id INTEGER, assignment_version INTEGER, runtime_lease_id TEXT, runtime_lease_expires_at TEXT, last_heartbeat_at TEXT, effect_hash TEXT, retry_count INTEGER NOT NULL DEFAULT 0);

-- table: agent_execution_recovery_events
CREATE TABLE agent_execution_recovery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recovery_event_id TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('VERIFICATION_CONFIRMED','VERIFICATION_UNKNOWN','VERIFICATION_FAILED','RECOVERY_REQUIRED','RECOVERY_PLANNED','ESCALATED','RECOVERED')),
  recovery_state TEXT NOT NULL CHECK(recovery_state IN ('NONE','VERIFY_CANONICAL_STATE','REASSESS','RETRY_CANDIDATE','ESCALATE_HUMAN','RECOVERED')),
  strategy TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: agent_executor_outcome_profiles
CREATE TABLE agent_executor_outcome_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  executor_id INTEGER NOT NULL,
  profile_version INTEGER NOT NULL DEFAULT 1,
  observed_outcomes INTEGER NOT NULL DEFAULT 0,
  known_outcomes INTEGER NOT NULL DEFAULT 0,
  favorable_outcomes INTEGER NOT NULL DEFAULT 0,
  adverse_outcomes INTEGER NOT NULL DEFAULT 0,
  blocked_outcomes INTEGER NOT NULL DEFAULT 0,
  waiting_outcomes INTEGER NOT NULL DEFAULT 0,
  unknown_outcomes INTEGER NOT NULL DEFAULT 0,
  executed_events INTEGER NOT NULL DEFAULT 0,
  failed_events INTEGER NOT NULL DEFAULT 0,
  last_outcome_at TEXT,
  last_event_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id) ON DELETE CASCADE,
  UNIQUE(company_id,executor_id)
);

-- table: agent_learning_observations
CREATE TABLE agent_learning_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learning_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  action_code TEXT NOT NULL,
  outcome_code TEXT NOT NULL CHECK(outcome_code IN ('RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN')),
  signal_code TEXT NOT NULL DEFAULT 'OUTCOME_PERFORMANCE',
  reward_score REAL NOT NULL,
  evidence_quality TEXT NOT NULL CHECK(evidence_quality IN ('LOW','MEDIUM','HIGH')),
  prediction_confidence TEXT NOT NULL CHECK(prediction_confidence IN ('LOW','MEDIUM','HIGH')),
  learning_weight REAL NOT NULL,
  observation_version TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  previous_learning_hash TEXT,
  learning_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(event_id)
);

-- table: agent_learning_profiles
CREATE TABLE agent_learning_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  action_code TEXT NOT NULL,
  profile_version INTEGER NOT NULL DEFAULT 1,
  sample_count INTEGER NOT NULL DEFAULT 0,
  known_count INTEGER NOT NULL DEFAULT 0,
  resolved_count INTEGER NOT NULL DEFAULT 0,
  progressed_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  worsened_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  waiting_count INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  mean_reward REAL,
  adverse_rate REAL,
  learned_weight REAL NOT NULL DEFAULT 0.75,
  learning_state TEXT NOT NULL CHECK(learning_state IN ('INSUFFICIENT_DATA','DEFER','STABLE','IMPROVING','DEGRADING')) DEFAULT 'INSUFFICIENT_DATA',
  minimum_sample_size INTEGER NOT NULL DEFAULT 5,
  last_learning_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id,action_code)
);

-- table: agent_learning_runs
CREATE TABLE agent_learning_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  company_id INTEGER,
  processed_events INTEGER NOT NULL DEFAULT 0,
  new_observations INTEGER NOT NULL DEFAULT 0,
  profiles_updated INTEGER NOT NULL DEFAULT 0,
  resolved_unknowns INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('COMPLETED','DEGRADED','FAILED')),
  learning_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  error_code TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

-- table: agent_organization_outcome_profiles
CREATE TABLE agent_organization_outcome_profiles (
  company_id INTEGER PRIMARY KEY,
  profile_version INTEGER NOT NULL DEFAULT 1,
  observed_outcomes INTEGER NOT NULL DEFAULT 0,
  known_outcomes INTEGER NOT NULL DEFAULT 0,
  favorable_outcomes INTEGER NOT NULL DEFAULT 0,
  adverse_outcomes INTEGER NOT NULL DEFAULT 0,
  blocked_outcomes INTEGER NOT NULL DEFAULT 0,
  waiting_outcomes INTEGER NOT NULL DEFAULT 0,
  unknown_outcomes INTEGER NOT NULL DEFAULT 0,
  executed_events INTEGER NOT NULL DEFAULT 0,
  failed_events INTEGER NOT NULL DEFAULT 0,
  last_outcome_at TEXT,
  last_event_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: agent_outcome_events
CREATE TABLE agent_outcome_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  decision_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  executor_id INTEGER,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('agent','human','system')),
  agent_id TEXT,
  action_code TEXT NOT NULL,
  intent_json TEXT NOT NULL DEFAULT '{}',
  context_version TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  plan_json TEXT NOT NULL DEFAULT '{}',
  authorization_json TEXT NOT NULL DEFAULT '{}',
  execution_status TEXT NOT NULL CHECK(execution_status IN ('NOT_EXECUTED','EXECUTED','FAILED','BLOCKED','UNKNOWN')),
  outcome_code TEXT NOT NULL CHECK(outcome_code IN ('RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN')),
  outcome_confidence TEXT NOT NULL CHECK(outcome_confidence IN ('LOW','MEDIUM','HIGH')),
  evidence_json TEXT NOT NULL DEFAULT '[]',
  state_version_before INTEGER,
  state_version_after INTEGER,
  model_provider TEXT,
  model_id TEXT,
  model_version TEXT,
  policy_version TEXT,
  recalibration_version TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

-- table: agent_outcome_resolution_events
CREATE TABLE agent_outcome_resolution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resolution_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  action_code TEXT NOT NULL,
  previous_outcome_code TEXT NOT NULL CHECK(previous_outcome_code IN ('RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN')),
  resolved_outcome_code TEXT NOT NULL CHECK(resolved_outcome_code IN ('RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN')),
  resolution_reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  resolver_type TEXT NOT NULL CHECK(resolver_type IN ('canonical','provider','human','system')),
  resolver_id TEXT,
  resolved_at TEXT NOT NULL,
  previous_resolution_hash TEXT,
  resolution_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: agent_pilot_events
CREATE TABLE agent_pilot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  pilot_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  action_code TEXT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pilot_id) REFERENCES agent_customer_pilot_profiles(pilot_id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: agent_pilot_mission_enrollments
CREATE TABLE agent_pilot_mission_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ENROLLED' CHECK(status IN ('ENROLLED','ACTIVE','PAUSED','COMPLETED','REMOVED')),
  action_allowlist_json TEXT NOT NULL DEFAULT '[]',
  operator_required INTEGER NOT NULL DEFAULT 1 CHECK(operator_required IN (0,1)),
  enrolled_by_role TEXT,
  enrolled_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pilot_id) REFERENCES agent_customer_pilot_profiles(pilot_id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(pilot_id,mission_id)
);

-- table: agent_pilot_readiness_checks
CREATE TABLE agent_pilot_readiness_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id TEXT NOT NULL,
  check_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PASS','WARN','BLOCKED')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pilot_id) REFERENCES agent_customer_pilot_profiles(pilot_id) ON DELETE CASCADE,
  UNIQUE(pilot_id,check_code)
);

-- table: agent_production_execution_events
CREATE TABLE agent_production_execution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  attempt_id TEXT,
  decision_id TEXT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  action_code TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('BOUNDARY_ACCEPTED','STARTED','SUCCEEDED','FAILED','UNKNOWN','RECOVERY_REQUIRED','OUTCOME_RECORDED')),
  production_mode TEXT NOT NULL CHECK(production_mode IN ('PILOT_SUPERVISED','PILOT_CONTROLLED')),
  pilot_id TEXT,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  policy_version TEXT,
  policy_hash TEXT,
  context_hash TEXT,
  request_hash TEXT,
  outcome_event_id TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: agent_semantic_memory_documents
CREATE TABLE agent_semantic_memory_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  content_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  vector_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','INDEXED','RETRY','DISABLED')),
  embedding_model TEXT NOT NULL,
  embedding_version TEXT NOT NULL,
  last_indexed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  UNIQUE(company_id,source_type,source_id),
  UNIQUE(vector_id)
);

-- table: agentic_control_config
CREATE TABLE agentic_control_config (
  id INTEGER PRIMARY KEY CHECK(id=1),
  version INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL CHECK(mode IN ('DISABLED','RECOMMEND_ONLY','PREPARE_ONLY','CONTROLLED_EXECUTION')),
  autonomy_level INTEGER NOT NULL CHECK(autonomy_level BETWEEN 0 AND 5),
  execution_enabled INTEGER NOT NULL DEFAULT 0 CHECK(execution_enabled IN (0,1)),
  policy_version TEXT NOT NULL,
  kill_switch_reason TEXT,
  updated_by_role TEXT,
  updated_by_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: analytics_policy_registry
CREATE TABLE analytics_policy_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  country_code TEXT NOT NULL DEFAULT 'ZZ',
  purpose_code TEXT NOT NULL DEFAULT 'operational_communications',
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  retention_policy_code TEXT,
  allowed_metric_codes TEXT NOT NULL DEFAULT '[]',
  aggregation_required INTEGER NOT NULL DEFAULT 1 CHECK(aggregation_required IN (0,1)),
  minimize INTEGER NOT NULL DEFAULT 1 CHECK(minimize IN (0,1)),
  pseudonymize INTEGER NOT NULL DEFAULT 1 CHECK(pseudonymize IN (0,1)),
  export_allowed INTEGER NOT NULL DEFAULT 0 CHECK(export_allowed IN (0,1)),
  audit_required INTEGER NOT NULL DEFAULT 1 CHECK(audit_required IN (0,1)),
  version TEXT NOT NULL DEFAULT '1',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code)
);

-- table: audit_logs
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  actor_role TEXT NOT NULL,
  actor_driver_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: auth_identities
CREATE TABLE auth_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
  driver_id INTEGER,
  login TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 600000,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, session_version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(driver_id) REFERENCES drivers(id),
  UNIQUE(company_id, driver_id)
);

-- table: backup_reconciliation_events
CREATE TABLE backup_reconciliation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  recovery_point_id INTEGER NOT NULL,
  company_id INTEGER,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_state TEXT NOT NULL,
  backup_state TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('aligned','pending','blocked','reconciled')),
  legal_hold_active INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold_active IN (0,1)),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(recovery_point_id) REFERENCES backup_recovery_points(id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- table: backup_recovery_points
CREATE TABLE backup_recovery_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recovery_point_id TEXT NOT NULL UNIQUE,
  backup_code TEXT NOT NULL,
  company_id INTEGER,
  source_scope TEXT NOT NULL CHECK(source_scope IN ('platform','company')),
  source_data_version TEXT,
  provider_object_ref TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  expires_at TEXT,
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  integrity_hash TEXT NOT NULL,
  integrity_status TEXT NOT NULL DEFAULT 'pending' CHECK(integrity_status IN ('pending','verified','failed')),
  encryption_status TEXT NOT NULL DEFAULT 'verified' CHECK(encryption_status IN ('required','configured','verified','failed')),
  residency_region TEXT NOT NULL,
  legal_hold_active INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold_active IN (0,1)),
  deletion_status TEXT NOT NULL DEFAULT 'retained' CHECK(deletion_status IN ('retained','expired','delete_pending','deleted','blocked_legal_hold')),
  size_bytes INTEGER,
  recovery_tested_at TEXT,
  recovery_test_status TEXT CHECK(recovery_test_status IN ('passed','failed','not_tested')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(backup_code) REFERENCES backup_registry(code),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- table: backup_registry
CREATE TABLE backup_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  purpose_code TEXT NOT NULL DEFAULT 'backup_recovery',
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  country_code TEXT NOT NULL DEFAULT 'DE',
  jurisdiction_code TEXT NOT NULL DEFAULT 'DE-GDPR-1',
  region_code TEXT NOT NULL DEFAULT 'DE',
  residency_mode TEXT NOT NULL DEFAULT 'required' CHECK(residency_mode IN ('required','preferred','policy')),
  retention_policy_code TEXT NOT NULL,
  encryption_mode TEXT NOT NULL CHECK(encryption_mode IN ('provider_managed','customer_managed','platform_managed')),
  encryption_status TEXT NOT NULL CHECK(encryption_status IN ('required','configured','verified','failed')),
  legal_hold_propagation TEXT NOT NULL DEFAULT 'required' CHECK(legal_hold_propagation IN ('required','supported','unsupported')),
  restore_authorization_scope TEXT NOT NULL DEFAULT 'backup_restore',
  integrity_verification_required INTEGER NOT NULL DEFAULT 1 CHECK(integrity_verification_required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','blocked','retired')),
  version TEXT NOT NULL DEFAULT '1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code)
);

-- table: backup_restore_requests
CREATE TABLE backup_restore_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  recovery_point_id TEXT NOT NULL,
  backup_code TEXT NOT NULL,
  company_id INTEGER,
  requested_by_role TEXT NOT NULL,
  requested_by_id INTEGER,
  target_scope TEXT NOT NULL CHECK(target_scope IN ('platform','company')),
  reason TEXT NOT NULL,
  authorization_status TEXT NOT NULL DEFAULT 'pending' CHECK(authorization_status IN ('pending','authorized','blocked','expired')),
  authorization_scope TEXT NOT NULL,
  legal_hold_check TEXT NOT NULL DEFAULT 'pending' CHECK(legal_hold_check IN ('pending','clear','required','blocked')),
  execution_status TEXT NOT NULL DEFAULT 'not_started' CHECK(execution_status IN ('not_started','ready','executing','succeeded','failed','cancelled')),
  provider_execution_ref TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  authorized_at TEXT,
  executed_at TEXT,
  completed_at TEXT,
  error_code TEXT,
  FOREIGN KEY(recovery_point_id) REFERENCES backup_recovery_points(id),
  FOREIGN KEY(backup_code) REFERENCES backup_registry(code),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- table: billing_identities
CREATE TABLE billing_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE,
  country_code TEXT NOT NULL DEFAULT 'DE',
  jurisdiction_code TEXT,
  legal_name TEXT,
  billing_email TEXT,
  address_json TEXT NOT NULL DEFAULT '{}',
  currency TEXT NOT NULL DEFAULT 'EUR',
  tax_configuration_code TEXT,
  tax_registration_status TEXT NOT NULL DEFAULT 'unknown',
  provider_code TEXT,
  provider_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: billing_invoices
CREATE TABLE billing_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  subscription_id INTEGER,
  provider_code TEXT NOT NULL,
  provider_invoice_id TEXT NOT NULL,
  invoice_number TEXT,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  subtotal_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0,
  amount_due_minor INTEGER NOT NULL DEFAULT 0,
  amount_paid_minor INTEGER NOT NULL DEFAULT 0,
  hosted_invoice_url TEXT,
  issued_at TEXT,
  due_at TEXT,
  paid_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  UNIQUE(provider_code,provider_invoice_id)
);

-- table: billing_jurisdiction_policies
CREATE TABLE billing_jurisdiction_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  tax_configuration_code TEXT NOT NULL,
  invoice_requirements_json TEXT NOT NULL DEFAULT '{}',
  provider_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  version TEXT NOT NULL DEFAULT '1',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code,jurisdiction_code,version)
);

-- table: billing_payments
CREATE TABLE billing_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  invoice_id INTEGER,
  subscription_id INTEGER,
  provider_code TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  payment_method_type TEXT,
  payment_method_brand TEXT,
  payment_method_last4 TEXT,
  failure_code TEXT,
  failure_message TEXT,
  processed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(invoice_id) REFERENCES billing_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  UNIQUE(provider_code,provider_payment_id)
);

-- table: billing_provider_events
CREATE TABLE billing_provider_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_code TEXT NOT NULL,
  provider_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  company_id INTEGER,
  processing_status TEXT NOT NULL DEFAULT 'received',
  attempt_count INTEGER NOT NULL DEFAULT 1,
  processed_at TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- table: billing_reconciliation_events
CREATE TABLE billing_reconciliation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  provider_code TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_reference TEXT,
  decision TEXT NOT NULL,
  local_state_json TEXT,
  provider_state_json TEXT,
  discrepancy_code TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- table: billing_state_transitions
CREATE TABLE billing_state_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  predecessor_state TEXT,
  successor_state TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  provider_event_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: canonical_capability_contracts
CREATE TABLE canonical_capability_contracts (
  capability_code TEXT PRIMARY KEY,
  version TEXT NOT NULL DEFAULT '1',
  purpose TEXT NOT NULL,
  inputs_json TEXT NOT NULL DEFAULT '[]',
  outputs_json TEXT NOT NULL DEFAULT '[]',
  commands_json TEXT NOT NULL DEFAULT '[]',
  queries_json TEXT NOT NULL DEFAULT '[]',
  resource_types_json TEXT NOT NULL DEFAULT '[]',
  risk_class TEXT NOT NULL DEFAULT 'medium' CHECK(risk_class IN ('low','medium','high','critical')),
  tenant_scope TEXT NOT NULL DEFAULT 'tenant',
  side_effects_json TEXT NOT NULL DEFAULT '[]',
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  preconditions_json TEXT NOT NULL DEFAULT '[]',
  postconditions_json TEXT NOT NULL DEFAULT '[]',
  failure_contract_json TEXT NOT NULL DEFAULT '{}',
  verification_contract_json TEXT NOT NULL DEFAULT '{}',
  recovery_contract_json TEXT NOT NULL DEFAULT '{}',
  health_contract_json TEXT NOT NULL DEFAULT '{}',
  observability_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','planned','retired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(capability_code) REFERENCES canonical_capability_registry(code)
);

-- table: canonical_capability_registry
CREATE TABLE canonical_capability_registry (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  domain_code TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','planned','retired')),
  version TEXT NOT NULL DEFAULT '1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT,
  FOREIGN KEY(domain_code) REFERENCES canonical_domain_registry(code)
);

-- table: canonical_domain_registry
CREATE TABLE canonical_domain_registry (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  layer TEXT NOT NULL CHECK(layer IN ('platform','domain_extension')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','planned','retired')),
  version TEXT NOT NULL DEFAULT '1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: canonical_object_type_registry
CREATE TABLE canonical_object_type_registry (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  object_domain TEXT NOT NULL DEFAULT 'platform',
  capability_code TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','planned','retired')),
  version TEXT NOT NULL DEFAULT '1',
  FOREIGN KEY(capability_code) REFERENCES canonical_capability_registry(code)
);

-- table: canonical_relationship_type_registry
CREATE TABLE canonical_relationship_type_registry (
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

-- table: canonical_vocabulary_registry
CREATE TABLE canonical_vocabulary_registry (
  canonical_term TEXT NOT NULL,
  legacy_term TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('platform','logistics','storage','api','database')),
  replacement_rule TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'replace' CHECK(status IN ('replace','internal_only','retired')),
  version TEXT NOT NULL DEFAULT '1',
  PRIMARY KEY(canonical_term,legacy_term,scope)
);

-- table: companies
CREATE TABLE companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deletion_status TEXT NOT NULL DEFAULT 'active', deleted_at TEXT, deletion_request_id INTEGER);

-- table: company_management_profiles
CREATE TABLE "company_management_profiles" (
  company_id INTEGER PRIMARY KEY,
  legal_name TEXT NOT NULL,
  trading_name TEXT,
  registration_number TEXT,
  registration_authority TEXT,
  registration_date TEXT,
  country_code TEXT NOT NULL,
  region_code TEXT,
  registered_address_line1 TEXT,
  registered_address_line2 TEXT,
  registered_postal_code TEXT,
  registered_city TEXT,
  organization_type TEXT NOT NULL DEFAULT 'company',
  sector_code TEXT NOT NULL DEFAULT 'general',
  organization_size TEXT,
  compliance_status TEXT NOT NULL DEFAULT 'configured' CHECK(compliance_status IN ('configured','pending','compliant','restricted','suspended')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ONBOARDING','PENDING_VERIFICATION','VERIFIED','ACTIVE','RESTRICTED','SUSPENDED','ARCHIVED')),
  status_reason TEXT,
  status_version INTEGER NOT NULL DEFAULT 1,
  status_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_changed_by_type TEXT,
  status_changed_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);

-- table: company_verification_status
CREATE TABLE "company_verification_status" (
  company_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'verified',
  country_code TEXT NOT NULL DEFAULT 'DE',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id)
);

-- table: compliance_action_policies
CREATE TABLE compliance_action_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jurisdiction_code TEXT NOT NULL,
  sector_policy_code TEXT NOT NULL,
  action_code TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1,
  reason_code TEXT NOT NULL DEFAULT 'policy_allows',
  version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(jurisdiction_code,sector_policy_code,action_code,version),
  FOREIGN KEY(jurisdiction_code) REFERENCES jurisdiction_policies(code),
  FOREIGN KEY(sector_policy_code) REFERENCES sector_policies(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code)
);

-- table: compliance_evidence_registry
CREATE TABLE compliance_evidence_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id TEXT NOT NULL UNIQUE,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('policy','consent','privacy_request','retention','legal_hold','file_governance','provider_governance','residency','backup_recovery','critical_audit','administrative_history','company_compliance')),
  control_code TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  company_id INTEGER,
  country_code TEXT,
  jurisdiction_code TEXT,
  source_table TEXT NOT NULL,
  source_record_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('observed','satisfied','attention','blocked','expired')),
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(control_code,subject_type,subject_id,source_table,source_record_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- table: consent_policy_audit_events
CREATE TABLE consent_policy_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  policy_id INTEGER,
  company_id INTEGER,
  purpose_code TEXT,
  request_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: consent_policy_versions
CREATE TABLE consent_policy_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  country_code TEXT NOT NULL DEFAULT 'ZZ',
  purpose_code TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  title TEXT NOT NULL,
  policy_text TEXT NOT NULL,
  require_consent INTEGER NOT NULL DEFAULT 0 CHECK(require_consent IN (0,1)),
  withdrawal_effect TEXT NOT NULL DEFAULT 'restrict_future_processing' CHECK(withdrawal_effect IN ('restrict_future_processing','review','none')),
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by_role TEXT NOT NULL DEFAULT 'platform_administrator',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code)
);

-- table: consent_records
CREATE TABLE consent_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  identity_type TEXT NOT NULL,
  identity_id INTEGER NOT NULL,
  purpose_code TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  granted INTEGER NOT NULL DEFAULT 1,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_at TEXT,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code)
);

-- table: country_catalog
CREATE TABLE country_catalog (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, requires_review INTEGER NOT NULL DEFAULT 1,
  default_subscription_class TEXT NOT NULL DEFAULT 'eligible', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: country_product_launch_change_requests
CREATE TABLE country_product_launch_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  launch_id INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','validated','activated','retired','rejected')),
  requested_by_type TEXT NOT NULL,
  requested_by_id TEXT,
  impact_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE
);

-- table: country_product_launches
CREATE TABLE "country_product_launches" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  manifest_json TEXT NOT NULL DEFAULT '{}',
  eligibility_json TEXT NOT NULL DEFAULT '{}',
  readiness_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  effective_at TEXT,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, country_blueprint_id INTEGER REFERENCES platform_country_product_blueprints(id), data_entry_id TEXT,
  UNIQUE(country_code,version),
  FOREIGN KEY(country_code) REFERENCES platform_product_country_catalog(code)
);

-- table: critical_audit_events
CREATE TABLE critical_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  actor_role TEXT NOT NULL,
  actor_identity_id INTEGER,
  actor_driver_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  request_id TEXT,
  phase TEXT NOT NULL CHECK(phase IN ('prepared','succeeded','failed','reconciled')),
  metadata TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

-- table: data_classification_registry
CREATE TABLE data_classification_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','PERSONAL','CONFIDENTIAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  purpose_code TEXT NOT NULL,
  retention_policy_code TEXT NOT NULL,
  export_allowed INTEGER NOT NULL DEFAULT 0,
  audit_required INTEGER NOT NULL DEFAULT 0,
  jurisdiction_policy_code TEXT NOT NULL DEFAULT 'DE-GDPR-1',
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(table_name,column_name),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code),
  FOREIGN KEY(jurisdiction_policy_code) REFERENCES jurisdiction_policies(code)
);

-- table: demo_execution_events
CREATE TABLE demo_execution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_instance_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  sequence INTEGER NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('READY','RUNNING','SIMULATED','VERIFIED','BLOCKED')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scenario_instance_id,sequence),
  FOREIGN KEY(scenario_instance_id) REFERENCES demo_scenario_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE SET NULL
);

-- table: demo_scenario_instances
CREATE TABLE demo_scenario_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  scenario_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','RUNNING','COMPLETED','RESET','FAILED')),
  blueprint_version TEXT NOT NULL DEFAULT '1',
  mission_id INTEGER,
  seed_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT,
  reset_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, current_sequence INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE SET NULL
);

-- table: driver_content_preferences
CREATE TABLE "driver_content_preferences" (
  company_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  direct_messages_cleared_through_id INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(company_id,driver_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

-- table: driver_daily_notes
CREATE TABLE driver_daily_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

-- table: driver_direct_messages
CREATE TABLE driver_direct_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('admin','driver')),
  sender_identity_id INTEGER,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

-- table: driver_operational_profiles
CREATE TABLE driver_operational_profiles (
  driver_id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL,
  vehicle_type TEXT,
  current_location TEXT,
  situation TEXT NOT NULL DEFAULT 'Available',
  situation_note TEXT,
  location_updated_at TEXT,
  situation_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id, driver_id)
);

-- table: drivers
CREATE TABLE drivers (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, removed_at TEXT, removed_by_identity_id INTEGER, removal_reason TEXT, deleted_at TEXT, FOREIGN KEY(company_id) REFERENCES companies(id));

-- table: executor_operational_profiles
CREATE TABLE executor_operational_profiles (
  executor_id INTEGER PRIMARY KEY,
  situation TEXT NOT NULL DEFAULT 'Available' CHECK(situation IN ('Available','Driving','Traffic','Break','Unavailable')),
  situation_note TEXT,
  current_location TEXT,
  location_updated_at TEXT,
  situation_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id) ON DELETE CASCADE
);

-- table: external_provider_audit_events
CREATE TABLE external_provider_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, provider_code TEXT NOT NULL, company_id INTEGER, country_code TEXT NOT NULL,
  purpose_code TEXT NOT NULL, classification TEXT NOT NULL, authorization_scope TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('allowed','blocked')), operation TEXT NOT NULL, data_fields TEXT NOT NULL DEFAULT '[]',
  transfer_policy TEXT, policy_version TEXT, request_id TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code), FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- table: external_provider_capabilities
CREATE TABLE external_provider_capabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_code TEXT NOT NULL,
  capability_code TEXT NOT NULL,
  action_code TEXT NOT NULL,
  adapter_type TEXT NOT NULL CHECK(adapter_type IN ('http_json','in_app')),
  execute_path TEXT,
  execute_method TEXT NOT NULL DEFAULT 'POST' CHECK(execute_method IN ('POST','PUT','PATCH','DELETE')),
  verify_path TEXT,
  verify_method TEXT NOT NULL DEFAULT 'GET' CHECK(verify_method IN ('GET','POST')),
  credential_binding TEXT,
  authorization_header TEXT NOT NULL DEFAULT 'Authorization',
  authorization_prefix TEXT NOT NULL DEFAULT 'Bearer',
  request_fields_json TEXT NOT NULL DEFAULT '[]',
  verification_required INTEGER NOT NULL DEFAULT 1 CHECK(verification_required IN (0,1)),
  verification_success_values_json TEXT NOT NULL DEFAULT '[true,"VERIFIED","SUCCEEDED","SUCCESS"]',
  timeout_ms INTEGER NOT NULL DEFAULT 10000 CHECK(timeout_ms BETWEEN 1000 AND 30000),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version TEXT NOT NULL DEFAULT '1',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_code,capability_code,version),
  UNIQUE(provider_code,action_code,version),
  FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code)
);

-- table: external_provider_execution_events
CREATE TABLE external_provider_execution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  provider_code TEXT NOT NULL,
  capability_code TEXT NOT NULL,
  company_id INTEGER,
  mission_id INTEGER,
  attempt_id TEXT,
  action_code TEXT NOT NULL,
  operation_id TEXT,
  phase TEXT NOT NULL CHECK(phase IN ('DISPATCH','VERIFY')),
  status TEXT NOT NULL CHECK(status IN ('STARTED','SUCCEEDED','FAILED','UNKNOWN','VERIFIED','UNVERIFIED')),
  http_status INTEGER,
  request_hash TEXT,
  response_summary_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- table: external_provider_policies
CREATE TABLE external_provider_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, provider_code TEXT NOT NULL, company_id INTEGER, country_code TEXT NOT NULL DEFAULT 'ZZ',
  purpose_code TEXT NOT NULL, classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  allowed_data_fields TEXT NOT NULL DEFAULT '[]', retention_policy_code TEXT,
  transfer_policy TEXT NOT NULL DEFAULT 'same_jurisdiction' CHECK(transfer_policy IN ('same_jurisdiction','adequacy','safeguards','approved_transfer','none')),
  authorization_scope TEXT NOT NULL, audit_required INTEGER NOT NULL DEFAULT 1 CHECK(audit_required IN (0,1)),
  minimize INTEGER NOT NULL DEFAULT 1 CHECK(minimize IN (0,1)), version TEXT NOT NULL DEFAULT '1', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code), FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code), FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code)
);

-- table: external_provider_registry
CREATE TABLE external_provider_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK(provider_type IN ('internal','storage','email','payment','identity','analytics','other')),
  endpoint TEXT, country_code TEXT NOT NULL DEFAULT 'ZZ', jurisdiction_code TEXT NOT NULL DEFAULT 'GLOBAL-POLICY-1',
  region_code TEXT, residency_mode TEXT NOT NULL DEFAULT 'policy' CHECK(residency_mode IN ('required','preferred','policy')),
  transfer_mechanism TEXT NOT NULL DEFAULT 'none', contract_status TEXT NOT NULL DEFAULT 'configured' CHECK(contract_status IN ('configured','approved','expired','blocked','pending_review')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), version TEXT NOT NULL DEFAULT '1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, data_entry_id TEXT);

-- table: file_access_policies
CREATE TABLE file_access_policies (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  minimum_relationship TEXT NOT NULL CHECK(minimum_relationship IN ('mission_participant','mission_owner','compliance_admin')),
  allow_owner INTEGER NOT NULL DEFAULT 1,
  allow_shared_participant INTEGER NOT NULL DEFAULT 1,
  allow_assigned_executor INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: file_classification_catalog
CREATE TABLE file_classification_catalog (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: file_purpose_catalog
CREATE TABLE file_purpose_catalog (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  processing_purpose_code TEXT NOT NULL,
  default_classification TEXT NOT NULL,
  default_retention_policy_code TEXT NOT NULL,
  access_policy_code TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(processing_purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(default_retention_policy_code) REFERENCES retention_policies(code)
);

-- table: jurisdiction_policies
CREATE TABLE jurisdiction_policies (
  code TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  region_code TEXT,
  framework_code TEXT NOT NULL,
  data_residency_mode TEXT NOT NULL DEFAULT 'policy',
  retention_profile TEXT NOT NULL DEFAULT 'default',
  deletion_profile TEXT NOT NULL DEFAULT 'default',
  identity_profile TEXT NOT NULL DEFAULT 'default',
  audit_profile TEXT NOT NULL DEFAULT 'default',
  effective_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code,effective_version)
);

-- table: legal_basis_catalog
CREATE TABLE legal_basis_catalog (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- table: location_policies
CREATE TABLE location_policies (
  code TEXT PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK(resolution IN ('exact','approximate','operational','historical','none')),
  purpose_code TEXT NOT NULL,
  retention_policy_code TEXT NOT NULL,
  continuous_tracking_allowed INTEGER NOT NULL DEFAULT 0,
  sharing_allowed INTEGER NOT NULL DEFAULT 0,
  version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(jurisdiction_code) REFERENCES jurisdiction_policies(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code)
);

-- table: mission_access_codes
CREATE TABLE mission_access_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  owner_company_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  code_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
  expires_at TEXT,
  created_by_identity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: mission_assignment_decisions
CREATE TABLE mission_assignment_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  decision_type TEXT NOT NULL CHECK(decision_type IN ('ASSIGN','REASSIGN','SHARE','WAIT','ESCALATE')),
  target_type TEXT,
  target_id INTEGER,
  score REAL,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'RECOMMENDED' CHECK(status IN ('RECOMMENDED','ACCEPTED','REJECTED','EXPIRED','SUPERSEDED')),
  reason_json TEXT NOT NULL DEFAULT '{}',
  context_json TEXT NOT NULL DEFAULT '{}',
  created_by_type TEXT NOT NULL DEFAULT 'mission_assignment_capability',
  created_by_id TEXT,
  accepted_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: mission_assignment_events
CREATE TABLE mission_assignment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id INTEGER NOT NULL, company_id INTEGER NOT NULL, assignment_type TEXT NOT NULL,
  actor_type TEXT, actor_id INTEGER, driver_id INTEGER, executor_id INTEGER, event_code TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(mission_id) REFERENCES missions(id), FOREIGN KEY(company_id) REFERENCES companies(id)
);

-- table: mission_assignment_reconciliation
CREATE TABLE mission_assignment_reconciliation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reconciled','conflict','unassigned')),
  selected_source TEXT,
  selected_assignment_id INTEGER,
  legacy_driver_id INTEGER,
  legacy_executor_id INTEGER,
  legacy_tenant_driver_id INTEGER,
  conflict_json TEXT NOT NULL DEFAULT '{}',
  resolved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: mission_assignment_subjects
CREATE TABLE mission_assignment_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('human','device','robot')),
  subject_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source_authority TEXT NOT NULL,
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','blocked','retired')),
  capability_codes_json TEXT NOT NULL DEFAULT '[]',
  constraints_json TEXT NOT NULL DEFAULT '{}',
  location_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  last_observed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id,subject_type,subject_key)
);

-- table: mission_assignments
CREATE TABLE mission_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  assignment_type TEXT NOT NULL CHECK(assignment_type IN ('owner_driver','executor','tenant_driver')),
  assignee_type TEXT NOT NULL CHECK(assignee_type IN ('driver','executor','device','robot')),
  assignee_id INTEGER NOT NULL,
  assignee_company_id INTEGER,
  request_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unassigned_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  source_type TEXT NOT NULL DEFAULT 'canonical',
  source_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: mission_cancellations
CREATE TABLE mission_cancellations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL UNIQUE,
  reason_code TEXT NOT NULL,
  note TEXT,
  cancelled_by_role TEXT NOT NULL,
  cancelled_by_identity_id INTEGER,
  cancelled_by_name TEXT,
  mission_status_before TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: mission_custody_cases
CREATE TABLE mission_custody_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance','resolved','cancelled')),
  current_holder_type TEXT NOT NULL CHECK(current_holder_type IN ('driver','executor','tenant')),
  current_holder_id INTEGER,
  target_type TEXT CHECK(target_type IN ('driver','executor','tenant')),
  target_id INTEGER,
  resolution_type TEXT NOT NULL CHECK(resolution_type IN ('transfer','return','continue','cancel_after_resolution')),
  note TEXT,
  opened_by_identity_id INTEGER,
  released_at TEXT,
  transferred_at TEXT,
  accepted_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, transfer_channel TEXT NOT NULL DEFAULT 'driver', recipient_type TEXT, recipient_id INTEGER, distribution_status TEXT,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: mission_custody_events
CREATE TABLE mission_custody_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id INTEGER NOT NULL, company_id INTEGER NOT NULL, event_code TEXT NOT NULL,
  holder_type TEXT, holder_id INTEGER, target_type TEXT, target_id INTEGER, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(mission_id) REFERENCES missions(id), FOREIGN KEY(company_id) REFERENCES companies(id)
);

-- table: mission_delivery_proofs
CREATE TABLE mission_delivery_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  submitted_by_role TEXT NOT NULL CHECK(submitted_by_role IN ('driver','executor')),
  driver_id INTEGER,
  executor_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, mission_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id) REFERENCES mission_files(id) ON DELETE CASCADE
);

-- table: mission_event_ledger
CREATE TABLE mission_event_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  transition_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  action_code TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'processing'
    CHECK(outcome IN ('processing','committed','failed')),
  actor_role TEXT NOT NULL,
  actor_identity_id INTEGER,
  actor_name TEXT,
  from_status TEXT,
  to_status TEXT,
  state_token_before TEXT,
  state_token_after TEXT,
  result_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: mission_evidence_events
CREATE TABLE mission_evidence_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id INTEGER NOT NULL, company_id INTEGER NOT NULL, file_id INTEGER,
  evidence_type TEXT NOT NULL, event_code TEXT NOT NULL, actor_type TEXT, actor_id INTEGER, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(mission_id) REFERENCES missions(id), FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(file_id) REFERENCES mission_files(id) ON DELETE SET NULL
);

-- table: mission_exceptions
CREATE TABLE mission_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  driver_id INTEGER,
  executor_id INTEGER,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_by_role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by_role TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id)
);

-- table: mission_execution_intents
CREATE TABLE mission_execution_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  action_code TEXT NOT NULL,
  action_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  state_token_before TEXT,
  requested_effect_json TEXT NOT NULL DEFAULT '{}',
  execution_mode TEXT NOT NULL CHECK(execution_mode IN ('INTERNAL','EXTERNAL','HYBRID')),
  status TEXT NOT NULL CHECK(status IN ('INTENT_RECORDED','READY_FOR_PROVIDER','PROVIDER_DISPATCHED','PROVIDER_VERIFIED','READY_FOR_CANONICAL_COMMIT','CANONICAL_EFFECT_COMMITTED','EXTERNAL_UNKNOWN','RECOVERY_REQUIRED','RECOVERED','FAILED')),
  provider_code TEXT,
  provider_operation_id TEXT,
  canonical_result_json TEXT NOT NULL DEFAULT '{}',
  verification_json TEXT NOT NULL DEFAULT '{}',
  recovery_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

-- table: mission_executor_assignments
CREATE TABLE mission_executor_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL UNIQUE,
  executor_id INTEGER NOT NULL,
  request_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id),
  FOREIGN KEY(request_id) REFERENCES public_mission_requests(id),
  UNIQUE(company_id, mission_id, executor_id)
);

-- table: mission_files
CREATE TABLE mission_files (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, mission_id INTEGER NOT NULL, uploaded_by_role TEXT NOT NULL, driver_id INTEGER, file_type TEXT NOT NULL, mime_type TEXT NOT NULL, original_name TEXT, r2_key TEXT NOT NULL UNIQUE, file_size INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, classification TEXT NOT NULL DEFAULT 'CONFIDENTIAL' CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')), purpose_code TEXT NOT NULL DEFAULT 'MISSION_EXECUTION', evidence_type TEXT NOT NULL DEFAULT 'attachment' CHECK(evidence_type IN ('attachment','evidence','critical_evidence','compliance_evidence')), controller_company_id INTEGER, owner_type TEXT NOT NULL DEFAULT 'company', owner_id INTEGER, created_by_identity_type TEXT, created_by_identity_id INTEGER, access_policy_code TEXT NOT NULL DEFAULT 'MISSION_PARTICIPANT', retention_policy_code TEXT NOT NULL DEFAULT 'DE_MISSION_DEFAULT', retention_policy_version TEXT NOT NULL DEFAULT '1', retention_due_at TEXT, disposition_status TEXT NOT NULL DEFAULT 'active' CHECK(disposition_status IN ('active','restricted','pending_review','disposed')), disposition_reason TEXT, disposed_at TEXT, legal_hold_active INTEGER NOT NULL DEFAULT 0, content_sha256 TEXT, integrity_version TEXT NOT NULL DEFAULT '1', FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(mission_id) REFERENCES missions(id), FOREIGN KEY(driver_id) REFERENCES drivers(id));

-- table: mission_lifecycle_events
CREATE TABLE mission_lifecycle_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('cancelled','reactivated')),
  reason_code TEXT,
  note TEXT,
  actor_role TEXT NOT NULL,
  actor_identity_id INTEGER,
  actor_name TEXT,
  previous_status TEXT NOT NULL,
  next_status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: mission_management_requirements
CREATE TABLE mission_management_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  requested_actor_type TEXT NOT NULL,
  requested_actor_id INTEGER,
  requested_by_role TEXT NOT NULL,
  requested_by_identity_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','cancelled')),
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by_role TEXT,
  resolved_by_identity_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: mission_messages
CREATE TABLE mission_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, mission_id INTEGER NOT NULL, sender_role TEXT NOT NULL, driver_id INTEGER, message TEXT, message_type TEXT NOT NULL DEFAULT 'text', file_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, attention_required INTEGER NOT NULL DEFAULT 0, attention_resolved_at TEXT, FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(mission_id) REFERENCES missions(id), FOREIGN KEY(driver_id) REFERENCES drivers(id));

-- table: mission_next_situations
CREATE TABLE mission_next_situations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  continuity_id TEXT NOT NULL UNIQUE,
  continuity_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  sequence_no INTEGER NOT NULL,
  source_outcome_id TEXT,
  mission_state_version INTEGER,
  outcome_code TEXT NOT NULL CHECK(outcome_code IN ('ACHIEVED','PARTIALLY_ACHIEVED','NOT_ACHIEVED','BLOCKED','WAITING','UNKNOWN','CANCELLED')),
  state TEXT NOT NULL CHECK(state IN ('NEXT_SITUATION_READY','ACTIONABLE','WAITING','RECOVERY_REQUIRED','TERMINAL','DEFERRED')),
  reason_code TEXT NOT NULL,
  action_code TEXT,
  assignment_id INTEGER,
  assignment_version INTEGER,
  attempt_id TEXT,
  context_hash TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: mission_objects
CREATE TABLE mission_objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, mission_id INTEGER NOT NULL, sequence_no INTEGER NOT NULL DEFAULT 1,
  object_type TEXT NOT NULL, description TEXT, weight_kg REAL, volume_m3 REAL, pallet_count INTEGER,
  identifiers_json TEXT NOT NULL DEFAULT '[]', requirements_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mission_id,sequence_no), FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(mission_id) REFERENCES missions(id)
);

-- table: mission_outcome_assessments
CREATE TABLE mission_outcome_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome_id TEXT NOT NULL UNIQUE,
  assessment_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  assignment_id INTEGER,
  attempt_id TEXT,
  outcome_code TEXT NOT NULL CHECK(outcome_code IN ('ACHIEVED','PARTIALLY_ACHIEVED','NOT_ACHIEVED','BLOCKED','WAITING','UNKNOWN','CANCELLED')),
  confidence TEXT NOT NULL CHECK(confidence IN ('LOW','MEDIUM','HIGH')),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('VERIFIED','CANONICAL_ONLY','UNKNOWN','FAILED','NOT_APPLICABLE')),
  objective_hash TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  execution_summary_json TEXT NOT NULL DEFAULT '{}',
  recovery_summary_json TEXT NOT NULL DEFAULT '{}',
  next_situation_json TEXT NOT NULL DEFAULT '{}',
  decision_reason_json TEXT NOT NULL DEFAULT '[]',
  source_version TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: mission_plan_evaluations
CREATE TABLE mission_plan_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  plan_hash TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  state_token TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACCEPTABLE','REQUIRES_REVIEW','BLOCKED','STALE','UNSAFE','INSUFFICIENT_EVIDENCE','UNKNOWN')),
  evaluation_hash TEXT NOT NULL,
  findings_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  decision_json TEXT NOT NULL DEFAULT '{}',
  source_version TEXT NOT NULL,
  expires_at TEXT,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id),
  FOREIGN KEY(plan_id) REFERENCES mission_plans(id)
);

-- table: mission_plans
CREATE TABLE mission_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  context_hash TEXT NOT NULL,
  state_token TEXT NOT NULL,
  objective_json TEXT NOT NULL DEFAULT '{}',
  plan_json TEXT NOT NULL DEFAULT '{}',
  plan_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','SUPERSEDED','ACCEPTED','REJECTED','EXPIRED')),
  source_version TEXT NOT NULL,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id)
);

-- table: mission_recipient_state
CREATE TABLE mission_recipient_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  mission_owner_company_id INTEGER NOT NULL,
  recipient_key TEXT NOT NULL,
  recipient_role TEXT NOT NULL CHECK(recipient_role IN ('admin','driver','executor')),
  recipient_tenant_id INTEGER,
  recipient_driver_id INTEGER,
  recipient_executor_id INTEGER,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_owner_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(recipient_tenant_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(recipient_driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  FOREIGN KEY(recipient_executor_id) REFERENCES public_executor_identities(id) ON DELETE CASCADE,
  UNIQUE(mission_id,recipient_key)
);

-- table: mission_reference_counters
CREATE TABLE mission_reference_counters (
  company_id INTEGER PRIMARY KEY,
  next_value INTEGER NOT NULL DEFAULT 100001,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: mission_status_history
CREATE TABLE mission_status_history (id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(mission_id) REFERENCES missions(id));

-- table: mission_stops
CREATE TABLE mission_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, mission_id INTEGER NOT NULL, sequence_no INTEGER NOT NULL,
  stop_type TEXT NOT NULL CHECK(stop_type IN ('pickup','intermediate','delivery','other')), status TEXT NOT NULL DEFAULT 'pending',
  company_name TEXT, contact_name TEXT, contact_phone TEXT, address_line1 TEXT, address_line2 TEXT, postal_code TEXT, city TEXT, region TEXT,
  latitude REAL, longitude REAL, access_from TEXT, access_to TEXT, planned_arrival_at TEXT, planned_departure_at TEXT,
  estimated_arrival_at TEXT, actual_arrival_at TEXT, actual_departure_at TEXT, instructions TEXT,
  evidence_required INTEGER NOT NULL DEFAULT 0 CHECK(evidence_required IN (0,1)), state_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mission_id,sequence_no), FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(mission_id) REFERENCES missions(id)
);

-- table: mission_tenant_access
CREATE TABLE mission_tenant_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  owner_company_id INTEGER NOT NULL,
  access_company_id INTEGER NOT NULL,
  request_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (access_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES public_mission_requests(id) ON DELETE SET NULL,
  UNIQUE(mission_id, access_company_id)
);

-- table: mission_tenant_driver_assignments
CREATE TABLE mission_tenant_driver_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  owner_company_id INTEGER NOT NULL,
  access_company_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (access_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  UNIQUE(mission_id, access_company_id)
);

-- table: mission_transition_events
CREATE TABLE mission_transition_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  actor_identity_id INTEGER,
  actor_name TEXT,
  from_status TEXT,
  to_status TEXT,
  reason_code TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: mission_transition_requests
CREATE TABLE mission_transition_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  action_code TEXT NOT NULL,
  expected_updated_at TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','completed','failed')),
  result_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, mutation_phase TEXT NOT NULL DEFAULT 'processing', reconciliation_json TEXT,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- table: missions
CREATE TABLE missions (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, driver_id INTEGER, reference TEXT NOT NULL, mission_date TEXT, status TEXT NOT NULL DEFAULT 'Pending', public_enabled INTEGER NOT NULL DEFAULT 0, public_description TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, mission_end_time TEXT, pickup_time TEXT, delivery_time TEXT, deadline_at TEXT, pickup_at_utc TEXT, delivery_at_utc TEXT, deadline_at_utc TEXT, schedule_timezone TEXT, status_changed_at TEXT, delivery_proof_required INTEGER NOT NULL DEFAULT 1, customer_id INTEGER REFERENCES network_customers(id) ON DELETE SET NULL, state_version INTEGER NOT NULL DEFAULT 1, state_lock_token TEXT, state_lock_at TEXT, capability_code TEXT, objective TEXT, responsibility_mode TEXT, country_code TEXT, sector_code TEXT, product_definition_id INTEGER REFERENCES platform_product_definitions(id) ON DELETE SET NULL, lifecycle_definition_id INTEGER REFERENCES platform_lifecycle_definitions(id) ON DELETE SET NULL, lifecycle_state_code TEXT, archived_at TEXT, archived_by_identity_id INTEGER, archive_reason TEXT, mission_context_json TEXT NOT NULL DEFAULT '{}', FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(driver_id) REFERENCES drivers(id));

-- table: network_customer_locations
CREATE TABLE network_customer_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  company_name TEXT NOT NULL,
  address TEXT NOT NULL,
  access_from TEXT,
  access_to TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES network_customers(id) ON DELETE CASCADE
);

-- table: network_customers
CREATE TABLE network_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  customer_reference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: network_executor_trust
CREATE TABLE network_executor_trust (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  executor_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'trusted' CHECK(status IN ('trusted','suspended','blocked')),
  can_receive_missions INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id) ON DELETE CASCADE,
  UNIQUE(company_id,executor_id)
);

-- table: network_mission_invitations
CREATE TABLE network_mission_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  owner_company_id INTEGER NOT NULL,
  recipient_type TEXT NOT NULL CHECK(recipient_type IN ('tenant','executor')),
  recipient_company_id INTEGER,
  recipient_executor_id INTEGER,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Accepted','Rejected','Cancelled')),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(recipient_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(recipient_executor_id) REFERENCES public_executor_identities(id) ON DELETE CASCADE,
  CHECK(
    (recipient_type='tenant' AND recipient_company_id IS NOT NULL AND recipient_executor_id IS NULL)
    OR
    (recipient_type='executor' AND recipient_executor_id IS NOT NULL AND recipient_company_id IS NULL)
  )
);

-- table: network_tenant_trust
CREATE TABLE network_tenant_trust (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_a_id INTEGER NOT NULL,
  company_b_id INTEGER NOT NULL,
  requested_by_company_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','trusted','suspended','blocked','rejected')),
  can_receive_missions INTEGER NOT NULL DEFAULT 1,
  can_request_missions INTEGER NOT NULL DEFAULT 1,
  can_message_dispatch INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_a_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(company_b_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(requested_by_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CHECK(company_a_id < company_b_id),
  CHECK(requested_by_company_id IN (company_a_id,company_b_id)),
  UNIQUE(company_a_id,company_b_id)
);

-- table: notification_policy_registry
CREATE TABLE notification_policy_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_type TEXT NOT NULL,
  company_id INTEGER,
  country_code TEXT NOT NULL DEFAULT 'ZZ',
  purpose_code TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  provider_code TEXT NOT NULL DEFAULT 'in_app',
  retention_policy_code TEXT,
  allowed_recipient_roles TEXT NOT NULL DEFAULT '["admin","driver","executor"]',
  max_title_length INTEGER NOT NULL DEFAULT 160 CHECK(max_title_length BETWEEN 40 AND 240),
  max_body_length INTEGER NOT NULL DEFAULT 600 CHECK(max_body_length BETWEEN 80 AND 2000),
  minimize INTEGER NOT NULL DEFAULT 1 CHECK(minimize IN (0,1)),
  audit_required INTEGER NOT NULL DEFAULT 1 CHECK(audit_required IN (0,1)),
  version TEXT NOT NULL DEFAULT '1',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code)
);

-- table: notifications
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('admin','driver','executor')),
  recipient_tenant_id INTEGER,
  recipient_driver_id INTEGER,
  recipient_executor_id INTEGER,
  mission_id INTEGER,
  mission_owner_company_id INTEGER,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  dedupe_key TEXT NOT NULL UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, controller_company_id INTEGER, country_code TEXT NOT NULL DEFAULT 'DE', purpose_code TEXT NOT NULL DEFAULT 'operational_communications', data_classification TEXT NOT NULL DEFAULT 'INTERNAL', retention_policy_code TEXT, provider_code TEXT NOT NULL DEFAULT 'in_app', governance_policy_id INTEGER, governance_version TEXT NOT NULL DEFAULT '1', governance_minimized INTEGER NOT NULL DEFAULT 1, governance_audit_required INTEGER NOT NULL DEFAULT 1, legal_hold_active INTEGER NOT NULL DEFAULT 0, disposed_at TEXT, audited_at TEXT);

-- table: operational_access_leases
CREATE TABLE operational_access_leases (
  token_hash TEXT PRIMARY KEY,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  action_count INTEGER NOT NULL DEFAULT 0 CHECK (action_count >= 0 AND action_count <= 10)
);

-- table: organization_capability_eligibility
CREATE TABLE organization_capability_eligibility (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  capability_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'eligible' CHECK(status IN ('supported','available','eligible','restricted','retired')),
  source_type TEXT NOT NULL DEFAULT 'runtime',
  source_reference TEXT,
  reason_code TEXT,
  version TEXT NOT NULL DEFAULT '1',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,capability_code,version),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(capability_code) REFERENCES canonical_capability_registry(code)
);

-- table: organization_compliance_policies
CREATE TABLE organization_compliance_policies (
  company_id INTEGER PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL,
  sector_code TEXT NOT NULL DEFAULT 'general',
  sector_policy_code TEXT NOT NULL DEFAULT 'general-v1',
  processing_profile TEXT NOT NULL DEFAULT 'operational_communications',
  residency_policy_code TEXT NOT NULL DEFAULT 'DE_PRIMARY',
  policy_version TEXT NOT NULL DEFAULT '10.33.0',
  status TEXT NOT NULL DEFAULT 'configured',
  configured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: organization_invitations
CREATE TABLE organization_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invitation_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  role_code TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'tenant' CHECK(scope_type IN ('tenant','network','mission')),
  scope_id INTEGER,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','accepted','expired','revoked')),
  expires_at TEXT NOT NULL,
  invited_by_identity_id INTEGER,
  accepted_identity_id INTEGER,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(invited_by_identity_id) REFERENCES auth_identities(id) ON DELETE SET NULL,
  FOREIGN KEY(accepted_identity_id) REFERENCES auth_identities(id) ON DELETE SET NULL
);

-- table: organization_lifecycle_transitions
CREATE TABLE organization_lifecycle_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transition_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  transition_kind TEXT NOT NULL DEFAULT 'transition' CHECK(transition_kind IN ('initialization','transition')),
  reason_code TEXT NOT NULL,
  reason TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  request_id TEXT,
  expected_status_version INTEGER,
  resulting_status_version INTEGER NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: organization_onboarding_records
CREATE TABLE organization_onboarding_records (
  company_id INTEGER PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  purpose_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  country_code TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL,
  requirement_snapshot TEXT NOT NULL DEFAULT '{}',
  verification_requirement_snapshot TEXT NOT NULL DEFAULT '[]',
  capability_eligibility_snapshot TEXT NOT NULL DEFAULT '[]',
  subscription_eligibility_class TEXT NOT NULL DEFAULT 'eligible',
  owner_identity_id INTEGER,
  review_status TEXT NOT NULL DEFAULT 'pending',
  provisioning_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(provisioning_status IN ('PENDING','RUNNING','COMPLETED','PROVISIONING_FAILED')),
  provisioning_step TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(jurisdiction_code) REFERENCES jurisdiction_policies(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(owner_identity_id) REFERENCES auth_identities(id) ON DELETE SET NULL
);

-- table: organization_provisioning_events
CREATE TABLE organization_provisioning_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  attempt INTEGER NOT NULL,
  step_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started','succeeded','failed','reconciled')),
  idempotency_key TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: organization_role_catalog
CREATE TABLE organization_role_catalog (
  role_code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'tenant' CHECK(scope_type IN ('tenant','platform','network','mission')),
  active INTEGER NOT NULL DEFAULT 1,
  system_managed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, data_entry_id TEXT);

-- table: password_reset_tokens
CREATE TABLE password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_type TEXT NOT NULL CHECK(identity_type IN ('tenant','executor')),
  identity_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: plan_product_configuration
CREATE TABLE plan_product_configuration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL UNIQUE,
  price_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  billing_interval TEXT NOT NULL DEFAULT 'month',
  eligible_countries_json TEXT NOT NULL DEFAULT '["*"]',
  eligible_organization_types_json TEXT NOT NULL DEFAULT '["*"]',
  eligible_sectors_json TEXT NOT NULL DEFAULT '["*"]',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  limits_json TEXT NOT NULL DEFAULT '{}',
  version TEXT NOT NULL DEFAULT '1',
  status TEXT NOT NULL DEFAULT 'active',
  configuration_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

-- table: plans
CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  stripe_price_id TEXT,
  max_drivers INTEGER,
  max_missions_monthly INTEGER,
  max_storage_mb INTEGER,
  public_missions_enabled INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, data_entry_id TEXT);

-- table: platform_admin_bulk_operations
CREATE TABLE platform_admin_bulk_operations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_key TEXT NOT NULL UNIQUE,
 resource_type TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('warn','stop','trash','purge')),
 filter_json TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','running','completed','partial','blocked','cancelled')),
 matched_count INTEGER NOT NULL DEFAULT 0,
 processed_count INTEGER NOT NULL DEFAULT 0,
 success_count INTEGER NOT NULL DEFAULT 0,
 blocked_count INTEGER NOT NULL DEFAULT 0,
 failed_count INTEGER NOT NULL DEFAULT 0,
 cursor_id TEXT,
 actor_type TEXT NOT NULL,
 actor_id TEXT,
 request_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT
);

-- table: platform_admin_data_actions
CREATE TABLE platform_admin_data_actions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 resource_type TEXT NOT NULL CHECK(resource_type IN ('tenant','user','country','sector','ui','content','product_definition','expansion_case')),
 resource_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('warn','stop','trash','restore','purge','edit')),
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','completed','blocked','cancelled')),
 reason_code TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 payload_json TEXT NOT NULL DEFAULT '{}',
 target_company_id INTEGER,
 actor_type TEXT NOT NULL,
 actor_id TEXT,
 request_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT,
 UNIQUE(resource_type,resource_id,action,request_id)
);

-- table: platform_admin_operations
CREATE TABLE platform_admin_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_key TEXT NOT NULL UNIQUE,
  idempotency_key TEXT,
  action_code TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  scope_key TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  request_id TEXT,
  status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','executing','verifying','succeeded','failed','rolled_back','expired')),
  expected_version TEXT,
  preconditions_json TEXT NOT NULL DEFAULT '{}',
  impact_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  rollback_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  lease_expires_at TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, lease_token TEXT, lease_version INTEGER NOT NULL DEFAULT 1);

-- table: platform_admin_security_events
CREATE TABLE platform_admin_security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  request_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: platform_architecture_governance
CREATE TABLE platform_architecture_governance (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: platform_archive_governance
CREATE TABLE platform_archive_governance (
  archive_key TEXT PRIMARY KEY,
  authority_table TEXT NOT NULL,
  archive_tables_json TEXT NOT NULL DEFAULT '[]',
  runtime_reads INTEGER NOT NULL DEFAULT 0 CHECK (runtime_reads IN (0,1)),
  runtime_writes INTEGER NOT NULL DEFAULT 0 CHECK (runtime_writes IN (0,1)),
  retention_decision TEXT NOT NULL CHECK (retention_decision IN ('pending','retain','purge_after_legal_review')),
  legal_hold_supported INTEGER NOT NULL DEFAULT 1 CHECK (legal_hold_supported IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: platform_certification_evidence
CREATE TABLE platform_certification_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('static','schema','integration','adversarial','real_journey','recovery')),
  status TEXT NOT NULL CHECK (status IN ('pending','passed','failed','blocked')),
  environment TEXT NOT NULL DEFAULT 'unknown',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_key,evidence_type)
);

-- table: platform_certification_fixture_users
CREATE TABLE platform_certification_fixture_users (
  fixture_code TEXT NOT NULL,
  tenant_key TEXT NOT NULL CHECK(tenant_key IN ('A','B')),
  identity_id INTEGER NOT NULL,
  role_code TEXT NOT NULL,
  login TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(fixture_code,identity_id),
  FOREIGN KEY(identity_id) REFERENCES auth_identities(id) ON DELETE CASCADE
);

-- table: platform_certification_fixtures
CREATE TABLE platform_certification_fixtures (
  fixture_code TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  product_key TEXT NOT NULL,
  product_definition_id INTEGER,
  tenant_a_id INTEGER,
  tenant_b_id INTEGER,
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','RESETTING','FAILED','RETIRED')),
  version TEXT NOT NULL DEFAULT '1',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_a_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY(tenant_b_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- table: platform_configuration_change_requests
CREATE TABLE platform_configuration_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  configuration_version_id INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','validated','authorized','approved','activated','rejected','cancelled')),
  requested_by_type TEXT NOT NULL,
  requested_by_id TEXT,
  authorization_actor_type TEXT,
  authorization_actor_id TEXT,
  approved_by_type TEXT,
  approved_by_id TEXT,
  impact_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(configuration_version_id) REFERENCES platform_configuration_versions(id) ON DELETE CASCADE
);

-- table: platform_configuration_versions
CREATE TABLE platform_configuration_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  configuration_id TEXT NOT NULL,
  domain_code TEXT NOT NULL,
  config_key TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  payload_json TEXT NOT NULL,
  effective_at TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  approved_by_type TEXT,
  approved_by_id TEXT,
  audit_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT,
  UNIQUE(configuration_id,version),
  UNIQUE(domain_code,config_key,version)
);

-- table: platform_control_plane_dependencies
CREATE TABLE platform_control_plane_dependencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  dependency_key TEXT NOT NULL,
  relation TEXT NOT NULL CHECK(relation IN ('depends_on','used_by','blocks','affects','enables','verified_by')),
  impact_json TEXT NOT NULL DEFAULT '{}',
  rollback_json TEXT NOT NULL DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'canonical',
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_type,resource_key,dependency_type,dependency_key,relation)
);

-- table: platform_control_plane_error_contracts
CREATE TABLE platform_control_plane_error_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  error_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'ERROR',
  retryable INTEGER NOT NULL DEFAULT 0 CHECK(retryable IN (0,1)),
  next_action TEXT,
  authority_code TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_type,error_code)
);

-- table: platform_control_plane_readiness
CREATE TABLE platform_control_plane_readiness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('READY','BLOCKED','AUTHORITY_UNAVAILABLE','UNKNOWN')),
  score INTEGER NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 100),
  blockers_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  verification_json TEXT NOT NULL DEFAULT '{}',
  evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_type,resource_key)
);

-- table: platform_control_plane_resource_contracts
CREATE TABLE platform_control_plane_resource_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  label TEXT NOT NULL,
  authority_code TEXT NOT NULL,
  governance_version TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, owner_capability TEXT, risk_class TEXT NOT NULL DEFAULT 'medium', step_up_required INTEGER NOT NULL DEFAULT 0, identity_rule TEXT, lifecycle_json TEXT NOT NULL DEFAULT '{}', provenance_json TEXT NOT NULL DEFAULT '{}', consumer_scope_json TEXT NOT NULL DEFAULT '{}', version TEXT NOT NULL DEFAULT '1',
  UNIQUE(resource_type,resource_key)
);

-- table: platform_country_product_blueprints
CREATE TABLE "platform_country_product_blueprints" (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 country_code TEXT NOT NULL,
 name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','researching','preparing','ready','archived')),
 default_language_code TEXT NOT NULL DEFAULT 'en',
 notes TEXT NOT NULL DEFAULT '',
 created_by_type TEXT NOT NULL,
 created_by_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT,
 UNIQUE(country_code),
 FOREIGN KEY(country_code) REFERENCES platform_product_country_catalog(code)
);

-- table: platform_country_product_contents
CREATE TABLE platform_country_product_contents (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 blueprint_id INTEGER NOT NULL,
 content_key TEXT NOT NULL,
 category TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '',
 language_code TEXT NOT NULL DEFAULT 'en',
 required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
 status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','draft','ready')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(blueprint_id,content_key,language_code),
 FOREIGN KEY(blueprint_id) REFERENCES platform_country_product_blueprints(id) ON DELETE CASCADE
);

-- table: platform_country_product_languages
CREATE TABLE platform_country_product_languages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 blueprint_id INTEGER NOT NULL,
 language_code TEXT NOT NULL,
 language_name TEXT NOT NULL,
 is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(blueprint_id,language_code),
 FOREIGN KEY(blueprint_id) REFERENCES platform_country_product_blueprints(id) ON DELETE CASCADE
);

-- table: platform_country_product_legal_requirements
CREATE TABLE platform_country_product_legal_requirements (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 blueprint_id INTEGER NOT NULL,
 requirement_key TEXT NOT NULL,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 source_url TEXT NOT NULL DEFAULT '',
 required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
 status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','researching','prepared','reviewed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(blueprint_id,requirement_key),
 FOREIGN KEY(blueprint_id) REFERENCES platform_country_product_blueprints(id) ON DELETE CASCADE
);

-- table: platform_country_product_sectors
CREATE TABLE platform_country_product_sectors (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 blueprint_id INTEGER NOT NULL,
 sector_code TEXT NOT NULL,
 sector_name TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','blocked')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(blueprint_id,sector_code),
 FOREIGN KEY(blueprint_id) REFERENCES platform_country_product_blueprints(id) ON DELETE CASCADE
);

-- table: platform_data_entry_certifications
CREATE TABLE platform_data_entry_certifications (
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

-- table: platform_data_entry_records
CREATE TABLE "platform_data_entry_records" (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 entry_id TEXT NOT NULL UNIQUE,
 entry_type TEXT NOT NULL CHECK(entry_type IN (
  'product_component','product_definition','country_blueprint','country_product_launch','expansion_case','platform_configuration_draft',
  'product_country','sector','language','currency','region','classification','policy','consent','residency','retention',
  'role','capability','responsibility','storage','provider','component','page','feature','configuration','guidance','plan','eligibility','pricing'
 )),
 source_type TEXT NOT NULL CHECK(source_type IN ('super_admin','tenant','user','system','import','integration','external_source')),
 source_id TEXT,
 actor_type TEXT NOT NULL,
 actor_id TEXT,
 tenant_scope TEXT,
 country_scope TEXT,
 payload_json TEXT NOT NULL DEFAULT '{}',
 schema_version TEXT NOT NULL,
 classification TEXT NOT NULL CHECK(classification IN ('CANONICAL','REFERENCE','CONFIGURATION','OPERATIONAL','USER_GENERATED','IMPORTED','SAMPLE','TEST','DRAFT','SENSITIVE')),
 purpose TEXT NOT NULL CHECK(purpose IN ('production','configuration','testing','migration','import','development','demonstration','temporary')),
 provenance_json TEXT NOT NULL DEFAULT '{}',
 validation_json TEXT NOT NULL DEFAULT '{}',
 policy_json TEXT NOT NULL DEFAULT '{}',
 dependency_json TEXT NOT NULL DEFAULT '{}',
 impact_json TEXT NOT NULL DEFAULT '{}',
 risk_level TEXT NOT NULL CHECK(risk_level IN ('low','medium','high','critical')),
 status TEXT NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','validated','committed','rejected','cancelled')),
 canonical_resource_type TEXT,
 canonical_resource_id TEXT,
 canonical_status TEXT,
 idempotency_key TEXT UNIQUE,
 commit_started_at TEXT,
 committed_at TEXT,
 rejection_code TEXT,
 rejection_message TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 commit_recovery_status TEXT NOT NULL DEFAULT 'none',
 commit_attempt INTEGER NOT NULL DEFAULT 0
);

-- table: platform_data_lifecycle_events
CREATE TABLE platform_data_lifecycle_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id TEXT NOT NULL UNIQUE,
 resource_type TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 previous_stage TEXT,
 stage TEXT NOT NULL CHECK(stage IN ('DRAFT','VALIDATED','COMMITTED','ACTIVE','RESTRICTED','QUARANTINED','RESTORED','PURGED','RETAINED','BLOCKED')),
 action TEXT NOT NULL,
 reason_code TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 source_entry_id TEXT,
 canonical_authority TEXT,
 dependency_snapshot_json TEXT NOT NULL DEFAULT '{}',
 legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1)),
 actor_type TEXT NOT NULL,
 actor_id TEXT,
 request_id TEXT,
 metadata_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: platform_demo_fixture_users
CREATE TABLE platform_demo_fixture_users (
  fixture_code TEXT NOT NULL,
  identity_id INTEGER NOT NULL,
  role_code TEXT NOT NULL,
  login TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(fixture_code,identity_id),
  FOREIGN KEY(identity_id) REFERENCES auth_identities(id) ON DELETE CASCADE
);

-- table: platform_demo_fixtures
CREATE TABLE platform_demo_fixtures (
  fixture_code TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  tenant_id INTEGER,
  default_product_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','QUARANTINED','FAILED','RETIRED')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(tenant_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- table: platform_demo_product_profiles
CREATE TABLE platform_demo_product_profiles (
  product_code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  source_product_definition_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RETIRED')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(source_product_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL
);

-- table: platform_environment_profiles
CREATE TABLE platform_environment_profiles (
  company_id INTEGER PRIMARY KEY,
  environment_code TEXT NOT NULL CHECK(environment_code IN ('PRODUCTION','DEMO','TEST','CERTIFICATION')),
  product_code TEXT NOT NULL DEFAULT 'on_mission',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','QUARANTINED','EXPIRED','SUSPENDED')),
  side_effect_policy_code TEXT NOT NULL DEFAULT 'REAL_OPERATIONAL_EFFECTS',
  scenario_code TEXT,
  expires_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_type TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, country_code TEXT, product_definition_id INTEGER,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- table: platform_governed_intake_batches
CREATE TABLE platform_governed_intake_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_id TEXT NOT NULL UNIQUE,
  intake_type TEXT NOT NULL CHECK(intake_type IN ('manual_entry','data_entry_import','market_package')),
  source_type TEXT NOT NULL CHECK(source_type IN ('manual','structured_file','market_package','integration','system')),
  source_name TEXT,
  source_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  tenant_scope TEXT,
  country_scope TEXT,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','SCANNING','PREVIEWED','BLOCKED','APPROVED','COMMITTING','PARTIAL','COMMITTED','FAILED','CANCELLED')),
  item_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  summary_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

-- table: platform_governed_intake_items
CREATE TABLE platform_governed_intake_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL,
  source_ref TEXT,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PREVIEWED','BLOCKED','DUPLICATE','APPROVED','COMMITTING','COMMITTED','FAILED','SKIPPED')),
  target_entry_id TEXT,
  target_resource_type TEXT,
  target_resource_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(intake_id,item_key),
  FOREIGN KEY(intake_id) REFERENCES platform_governed_intake_batches(intake_id) ON DELETE CASCADE
);

-- table: platform_infrastructure_resource_events
CREATE TABLE platform_infrastructure_resource_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id TEXT NOT NULL REFERENCES platform_infrastructure_resources(resource_id),
  event_type TEXT NOT NULL CHECK(event_type IN ('PROPOSED','VALIDATED','ACTIVATED','DEGRADED','RETIRED','EVIDENCE_ADDED')),
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: platform_infrastructure_resources
CREATE TABLE platform_infrastructure_resources (
  resource_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 120),
  resource_type TEXT NOT NULL CHECK(resource_type IN ('D1_DATABASE','R2_BUCKET','KV_NAMESPACE','VECTORIZE_INDEX','AI_SERVICE','WORKER','OTHER')),
  provider_code TEXT NOT NULL CHECK(length(provider_code) BETWEEN 2 AND 40),
  environment_scope TEXT NOT NULL CHECK(environment_scope IN ('production','development','shared')),
  owner_capability TEXT NOT NULL CHECK(length(owner_capability) BETWEEN 2 AND 100),
  jurisdiction_code TEXT NOT NULL CHECK(length(jurisdiction_code) BETWEEN 2 AND 16),
  provider_reference TEXT NOT NULL CHECK(length(provider_reference) BETWEEN 2 AND 240),
  schema_version TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(lifecycle_state IN ('PROPOSED','VALIDATED','ACTIVE','DEGRADED','RETIRED')),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: platform_infrastructure_roadmap
CREATE TABLE platform_infrastructure_roadmap (
  task_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  workstream TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','VERIFIED')),
  priority TEXT NOT NULL DEFAULT 'HIGH' CHECK(priority IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  evidence_text TEXT,
  owner_label TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: platform_lifecycle_definitions
CREATE TABLE platform_lifecycle_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lifecycle_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  country_code TEXT,
  sector_code TEXT NOT NULL,
  product_definition_id INTEGER,
  launch_id INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  initial_state_code TEXT NOT NULL,
  terminal_states_json TEXT NOT NULL DEFAULT '[]',
  liveness_policy_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lifecycle_key,version),
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(product_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL
);

-- table: platform_lifecycle_states
CREATE TABLE platform_lifecycle_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lifecycle_definition_id INTEGER NOT NULL,
  state_code TEXT NOT NULL,
  label TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'OPERATIONAL',
  terminal INTEGER NOT NULL DEFAULT 0 CHECK(terminal IN (0,1)),
  custody_active INTEGER NOT NULL DEFAULT 0 CHECK(custody_active IN (0,1)),
  sequence_no INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lifecycle_definition_id,state_code),
  FOREIGN KEY(lifecycle_definition_id) REFERENCES platform_lifecycle_definitions(id) ON DELETE CASCADE
);

-- table: platform_lifecycle_transitions
CREATE TABLE platform_lifecycle_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lifecycle_definition_id INTEGER NOT NULL,
  from_state_code TEXT NOT NULL,
  to_state_code TEXT NOT NULL,
  transition_code TEXT NOT NULL,
  action_code TEXT,
  reason_code TEXT,
  required_role_codes_json TEXT NOT NULL DEFAULT '[]',
  guard_json TEXT NOT NULL DEFAULT '{}',
  evidence_policy_json TEXT NOT NULL DEFAULT '{}',
  sequence_no INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lifecycle_definition_id,from_state_code,to_state_code),
  UNIQUE(lifecycle_definition_id,transition_code),
  FOREIGN KEY(lifecycle_definition_id) REFERENCES platform_lifecycle_definitions(id) ON DELETE CASCADE
);

-- table: platform_market_launch_task_evidence
CREATE TABLE platform_market_launch_task_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_version_id INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','BLOCKED','COMPLETE')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  updated_by_type TEXT,
  updated_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(package_version_id, task_key),
  FOREIGN KEY(package_version_id) REFERENCES platform_market_package_versions(id) ON DELETE CASCADE
);

-- table: platform_market_package_imports
CREATE TABLE platform_market_package_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_version_id INTEGER NOT NULL,
  source_format TEXT NOT NULL,
  source_name TEXT,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACCEPTED' CHECK(status IN ('ACCEPTED','REJECTED')),
  manifest_json TEXT NOT NULL DEFAULT '{}',
  errors_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_by_type TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(package_version_id) REFERENCES platform_market_package_versions(id) ON DELETE CASCADE
);

-- table: platform_market_package_versions
CREATE TABLE platform_market_package_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IMPORTED' CHECK(status IN ('IMPORTED','DRAFT','NORMALIZED','VALIDATED','READY','AUTHORIZED','PUBLISHED','VERIFIED','LIVE','REPLACED','SUSPENDED','RETIRED','REJECTED')),
  source_format TEXT NOT NULL DEFAULT 'json' CHECK(source_format IN ('json','zip','export')),
  source_hash TEXT NOT NULL,
  package_json TEXT NOT NULL DEFAULT '{}',
  import_report_json TEXT NOT NULL DEFAULT '{}',
  readiness_json TEXT NOT NULL DEFAULT '{}',
  dependency_snapshot_json TEXT NOT NULL DEFAULT '{}',
  contract_hash TEXT,
  launch_id INTEGER,
  previous_version_id INTEGER,
  authorized_by_type TEXT,
  authorized_by_id TEXT,
  authorized_at TEXT,
  published_at TEXT,
  verified_at TEXT,
  live_at TEXT,
  created_by_type TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(package_id,version),
  FOREIGN KEY(package_id) REFERENCES platform_market_packages(id) ON DELETE CASCADE,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL,
  FOREIGN KEY(previous_version_id) REFERENCES platform_market_package_versions(id) ON DELETE SET NULL
);

-- table: platform_market_packages
CREATE TABLE platform_market_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_key TEXT NOT NULL UNIQUE,
  product_key TEXT NOT NULL DEFAULT 'on_mission',
  country_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','LIVE','RESTRICTED','SUSPENDED','RETIRED')),
  onboarding_mode TEXT NOT NULL DEFAULT 'OPEN' CHECK(onboarding_mode IN ('OPEN','INVITE_ONLY','CLOSED')),
  active_version_id INTEGER,
  previous_version_id INTEGER,
  created_by_type TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(country_code) REFERENCES platform_product_country_catalog(code)
);

-- table: platform_market_publication_operations
CREATE TABLE platform_market_publication_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_version_id INTEGER NOT NULL UNIQUE,
  package_id INTEGER NOT NULL,
  operation_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PREPARED' CHECK(status IN ('PREPARED','IN_PROGRESS','FAILED','COMPLETED','RECOVERY_REQUIRED')),
  stage TEXT NOT NULL DEFAULT 'PREPARED',
  stage_evidence_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  started_by_type TEXT,
  started_by_id TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(package_version_id) REFERENCES platform_market_package_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(package_id) REFERENCES platform_market_packages(id) ON DELETE CASCADE
);

-- table: platform_market_release_contracts
CREATE TABLE platform_market_release_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_version_id INTEGER NOT NULL UNIQUE,
  contract_hash TEXT NOT NULL UNIQUE,
  contract_json TEXT NOT NULL,
  verification_json TEXT NOT NULL DEFAULT '{}',
  dependency_snapshot_json TEXT NOT NULL DEFAULT '{}',
  rollback_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'AUTHORIZED' CHECK(status IN ('AUTHORIZED','PUBLISHED','VERIFIED','LIVE','REPLACED','SUSPENDED','RETIRED')),
  authorized_by_type TEXT,
  authorized_by_id TEXT,
  authorized_at TEXT,
  published_at TEXT,
  verified_at TEXT,
  live_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(package_version_id) REFERENCES platform_market_package_versions(id) ON DELETE CASCADE
);

-- table: platform_mission_reference_scenarios
CREATE TABLE platform_mission_reference_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  country_code TEXT,
  sector_code TEXT NOT NULL,
  lifecycle_definition_id INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  mission_contract_json TEXT NOT NULL DEFAULT '{}',
  steps_json TEXT NOT NULL DEFAULT '[]',
  exception_contract_json TEXT NOT NULL DEFAULT '{}',
  verification_contract_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scenario_code,version),
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(lifecycle_definition_id) REFERENCES platform_lifecycle_definitions(id)
);

-- table: platform_mutation_leases
CREATE TABLE platform_mutation_leases (
  scope_key TEXT PRIMARY KEY,
  lock_token TEXT NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: platform_product_country_catalog
CREATE TABLE platform_product_country_catalog (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  requires_review INTEGER NOT NULL DEFAULT 1 CHECK(requires_review IN (0,1)),
  default_subscription_class TEXT NOT NULL DEFAULT 'eligible',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, data_entry_id TEXT);

-- table: platform_product_definition_components
CREATE TABLE platform_product_definition_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  definition_id INTEGER NOT NULL,
  component_type TEXT NOT NULL CHECK(component_type IN ('identity','vocabulary','content','capability','workflow','role','experience','policy','integration','dependency')),
  component_key TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'inline' CHECK(source_type IN ('inline','platform_configuration','country_blueprint','capability_registry','base_definition')),
  source_ref TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','blocked')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT,
  UNIQUE(definition_id,component_type,component_key,version),
  FOREIGN KEY(definition_id) REFERENCES platform_product_definitions(id) ON DELETE CASCADE
);

-- table: platform_product_definition_manifests
CREATE TABLE platform_product_definition_manifests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  definition_id INTEGER NOT NULL,
  definition_version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'compiled' CHECK(status IN ('compiled','verified','active','retired')),
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(definition_id,definition_version,manifest_hash),
  FOREIGN KEY(definition_id) REFERENCES platform_product_definitions(id) ON DELETE CASCADE
);

-- table: platform_product_definitions
CREATE TABLE platform_product_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','compiled','verified','active','retired')),
  base_definition_id INTEGER,
  launch_id INTEGER,
  definition_version INTEGER NOT NULL DEFAULT 1,
  compiled_version INTEGER,
  compiled_hash TEXT,
  compiled_at TEXT,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT,
  UNIQUE(product_key, definition_version),
  FOREIGN KEY(base_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);

-- table: platform_product_dependency_edges
CREATE TABLE platform_product_dependency_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  from_node_id INTEGER NOT NULL,
  to_node_id INTEGER NOT NULL,
  relation TEXT NOT NULL CHECK(relation IN ('depends_on','used_by','blocks','affects','enables','verified_by')),
  impact_json TEXT NOT NULL DEFAULT '{}',
  rollback_json TEXT NOT NULL DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'canonical',
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(launch_id,from_node_id,to_node_id,relation),
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE,
  FOREIGN KEY(from_node_id) REFERENCES platform_product_dependency_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY(to_node_id) REFERENCES platform_product_dependency_nodes(id) ON DELETE CASCADE
);

-- table: platform_product_dependency_nodes
CREATE TABLE platform_product_dependency_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  node_type TEXT NOT NULL,
  node_key TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(launch_id,node_type,node_key),
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE
);

-- table: platform_product_expansion_cases
CREATE TABLE platform_product_expansion_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expansion_key TEXT NOT NULL UNIQUE,
  source_definition_id INTEGER,
  source_launch_id INTEGER,
  target_country_code TEXT NOT NULL,
  target_sector_code TEXT NOT NULL DEFAULT 'general',
  expansion_type TEXT NOT NULL CHECK(expansion_type IN ('new_country','new_sector','new_language','capability','workflow','variant')),
  status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','preparing','composing','verifying','ready','launching','live','blocked','retired')),
  stage TEXT NOT NULL DEFAULT 'decision',
  owner_type TEXT,
  owner_id TEXT,
  source_snapshot_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT,
  FOREIGN KEY(source_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(source_launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL,
  FOREIGN KEY(target_country_code) REFERENCES country_catalog(code)
);

-- table: platform_product_expansion_deltas
CREATE TABLE platform_product_expansion_deltas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expansion_id INTEGER NOT NULL,
  component_type TEXT NOT NULL,
  component_key TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK(change_type IN ('inherited','modified','added','removed','review')),
  source_ref TEXT,
  target_ref TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','accepted','rejected','applied')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(expansion_id,component_type,component_key),
  FOREIGN KEY(expansion_id) REFERENCES platform_product_expansion_cases(id) ON DELETE CASCADE
);

-- table: platform_product_expansion_lineage
CREATE TABLE platform_product_expansion_lineage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expansion_id INTEGER NOT NULL,
  parent_definition_id INTEGER,
  child_definition_id INTEGER,
  relation TEXT NOT NULL CHECK(relation IN ('inherits','overrides','adds','removes','creates')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(expansion_id,parent_definition_id,child_definition_id,relation),
  FOREIGN KEY(expansion_id) REFERENCES platform_product_expansion_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(child_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL
);

-- table: platform_product_expansion_tasks
CREATE TABLE platform_product_expansion_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expansion_id INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','ready','in_progress','blocked','completed','skipped','not_applicable')),
  required INTEGER NOT NULL DEFAULT 1,
  dependency_task_id INTEGER,
  authority TEXT NOT NULL DEFAULT 'expansion',
  action_code TEXT,
  target_route TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  completion_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(expansion_id,task_key),
  FOREIGN KEY(expansion_id) REFERENCES platform_product_expansion_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(dependency_task_id) REFERENCES platform_product_expansion_tasks(id) ON DELETE SET NULL
);

-- table: platform_product_identity_active
CREATE TABLE platform_product_identity_active (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
  revision_id INTEGER NOT NULL REFERENCES platform_product_identity_revisions(revision_id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL
);

-- table: platform_product_identity_revisions
CREATE TABLE platform_product_identity_revisions (
  revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 80),
  short_name TEXT NOT NULL CHECK(length(short_name) BETWEEN 1 AND 12),
  tagline TEXT NOT NULL DEFAULT '' CHECK(length(tagline) <= 180),
  logo_asset_key TEXT,
  favicon_asset_key TEXT,
  scope TEXT NOT NULL DEFAULT 'platform' CHECK(scope IN ('platform','market','tenant')),
  scope_key TEXT NOT NULL DEFAULT 'global',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_by TEXT,
  published_at TEXT
);

-- table: platform_product_preparation_research
CREATE TABLE platform_product_preparation_research (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  research_key TEXT NOT NULL,
  topic TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_review','completed','deferred')),
  findings TEXT,
  sources_json TEXT NOT NULL DEFAULT '[]',
  reviewed_by_type TEXT,
  reviewed_by_id TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(launch_id,research_key),
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE
);

-- table: platform_product_preparation_tasks
CREATE TABLE platform_product_preparation_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','completed','blocked')),
  research_required INTEGER NOT NULL DEFAULT 0 CHECK(research_required IN (0,1)),
  source_required INTEGER NOT NULL DEFAULT 0 CHECK(source_required IN (0,1)),
  dependency_task_id INTEGER,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  completion_note TEXT,
  completed_by_type TEXT,
  completed_by_id TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(launch_id,task_key),
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE,
  FOREIGN KEY(dependency_task_id) REFERENCES platform_product_preparation_tasks(id) ON DELETE SET NULL
);

-- table: platform_product_release_lifecycles
CREATE TABLE platform_product_release_lifecycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL UNIQUE,
  previous_launch_id INTEGER,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','validated','authorized','published','verified','live','retired')),
  contract_hash TEXT,
  dependency_snapshot_json TEXT NOT NULL DEFAULT '{}',
  verification_evidence_json TEXT NOT NULL DEFAULT '{}',
  rollback_path_json TEXT NOT NULL DEFAULT '{}',
  authorized_by_type TEXT,
  authorized_by_id TEXT,
  authorized_at TEXT,
  published_at TEXT,
  verified_at TEXT,
  live_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, contract_snapshot_json TEXT, dependency_snapshot_hash TEXT,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE,
  FOREIGN KEY(previous_launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL
);

-- table: platform_product_release_operations
CREATE TABLE platform_product_release_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_key TEXT NOT NULL UNIQUE,
  launch_id INTEGER NOT NULL,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('publish','verify','rollback')),
  status TEXT NOT NULL DEFAULT 'precheck' CHECK(status IN ('precheck','preparing','publishing','verifying','committed','failed','reconciliation_required')),
  actor_type TEXT,
  actor_id TEXT,
  request_id TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE
);

-- table: platform_product_sector_lifecycles
CREATE TABLE platform_product_sector_lifecycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  product_definition_id INTEGER,
  sector_code TEXT NOT NULL,
  lifecycle_definition_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  effective_at TEXT,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE,
  FOREIGN KEY(product_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(lifecycle_definition_id) REFERENCES platform_lifecycle_definitions(id)
);

-- table: platform_product_test_scenario_steps
CREATE TABLE platform_product_test_scenario_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  phase_code TEXT NOT NULL,
  label TEXT NOT NULL,
  journeys_json TEXT NOT NULL DEFAULT '[]',
  preconditions_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','blocked','completed','skipped')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scenario_id,sequence),
  UNIQUE(scenario_id,phase_code),
  FOREIGN KEY(scenario_id) REFERENCES platform_product_test_scenarios(id) ON DELETE CASCADE
);

-- table: platform_product_test_scenarios
CREATE TABLE platform_product_test_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  company_id INTEGER,
  mission_id INTEGER,
  sector_code TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','blocked','prepared','consumed','superseded')),
  scenario_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, contract_hash TEXT, dependency_snapshot_hash TEXT,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE SET NULL
);

-- table: platform_product_verification_runs
CREATE TABLE platform_product_verification_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL UNIQUE,
  operation_id INTEGER,
  idempotency_key TEXT,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  launch_id INTEGER,
  launch_version TEXT,
  company_id INTEGER,
  mission_id INTEGER,
  mode TEXT NOT NULL DEFAULT 'controlled' CHECK(mode IN ('observational','controlled')),
  status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','executing','verifying','succeeded','failed','blocked')),
  journey_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(operation_id) REFERENCES platform_admin_operations(id) ON DELETE SET NULL,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE SET NULL
);

-- table: platform_product_verification_steps
CREATE TABLE platform_product_verification_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  journey_code TEXT NOT NULL,
  step_code TEXT NOT NULL,
  authority TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK(proof_kind IN ('configuration','runtime','user_state','canonical_action','transition','evidence')),
  status TEXT NOT NULL DEFAULT 'executing' CHECK(status IN ('executing','passed','failed','blocked','skipped')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id,sequence),
  UNIQUE(run_id,journey_code,step_code),
  FOREIGN KEY(run_id) REFERENCES platform_product_verification_runs(id) ON DELETE CASCADE
);

-- table: platform_region_placements
CREATE TABLE platform_region_placements (
  region_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  market_code TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL,
  provider_code TEXT NOT NULL DEFAULT 'cloudflare',
  environment_scope TEXT NOT NULL DEFAULT 'production' CHECK(environment_scope IN ('development','production','shared')),
  resource_set_id TEXT,
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','BLOCKED','READY_FOR_REVIEW','ACTIVE','RETIRED')),
  activation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(activation_allowed IN (0,1)),
  policy_version TEXT NOT NULL DEFAULT 'regional-placement-v1',
  readiness_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(status != 'ACTIVE' OR activation_allowed = 1)
);

-- table: platform_reusable_classifications
CREATE TABLE platform_reusable_classifications (code TEXT PRIMARY KEY,name TEXT NOT NULL,domain TEXT NOT NULL DEFAULT 'general',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT);

-- table: platform_reusable_currencies
CREATE TABLE platform_reusable_currencies (code TEXT PRIMARY KEY,name TEXT NOT NULL,symbol TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT);

-- table: platform_reusable_eligibility
CREATE TABLE platform_reusable_eligibility (code TEXT PRIMARY KEY,name TEXT NOT NULL,rule_json TEXT NOT NULL DEFAULT '{}',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT);

-- table: platform_reusable_features
CREATE TABLE platform_reusable_features (code TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT);

-- table: platform_reusable_guidance
CREATE TABLE platform_reusable_guidance (code TEXT PRIMARY KEY,name TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',language_code TEXT NOT NULL DEFAULT 'en',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT);

-- table: platform_reusable_languages
CREATE TABLE platform_reusable_languages (code TEXT PRIMARY KEY,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT);

-- table: platform_reusable_pages
CREATE TABLE platform_reusable_pages (id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,page_type TEXT NOT NULL DEFAULT 'content',language_code TEXT NOT NULL DEFAULT 'en',country_code TEXT,body TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT,FOREIGN KEY(country_code) REFERENCES platform_product_country_catalog(code));

-- table: platform_reusable_policies
CREATE TABLE platform_reusable_policies (code TEXT PRIMARY KEY,name TEXT NOT NULL,policy_type TEXT NOT NULL,scope TEXT NOT NULL DEFAULT 'platform',configuration_json TEXT NOT NULL DEFAULT '{}',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT);

-- table: platform_reusable_pricing
CREATE TABLE platform_reusable_pricing (code TEXT PRIMARY KEY,name TEXT NOT NULL,currency TEXT NOT NULL DEFAULT 'EUR',price_minor INTEGER NOT NULL DEFAULT 0,billing_interval TEXT NOT NULL DEFAULT 'month',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT);

-- table: platform_reusable_regions
CREATE TABLE platform_reusable_regions (code TEXT PRIMARY KEY,name TEXT NOT NULL,country_code TEXT,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT);

-- table: platform_reusable_responsibilities
CREATE TABLE platform_reusable_responsibilities (code TEXT PRIMARY KEY,name TEXT NOT NULL,role_code TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT,FOREIGN KEY(role_code) REFERENCES organization_role_catalog(role_code));

-- table: platform_reusable_sectors
CREATE TABLE platform_reusable_sectors (code TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT);

-- table: platform_storage_registry
CREATE TABLE platform_storage_registry (code TEXT PRIMARY KEY,name TEXT NOT NULL,provider_code TEXT NOT NULL,region_code TEXT,purpose TEXT NOT NULL DEFAULT 'general',residency_mode TEXT NOT NULL DEFAULT 'policy',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT,FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code));

-- table: platform_trash_items
CREATE TABLE platform_trash_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 trash_key TEXT NOT NULL UNIQUE,
 resource_type TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 display_name TEXT NOT NULL,
 reason_code TEXT NOT NULL CHECK(reason_code IN ('sample_data','unused_reference','abandoned_draft','failed_attempt','pre_live_product','manual_cleanup','user_requested','retention_expiry')),
 confidence TEXT NOT NULL DEFAULT 'review' CHECK(confidence IN ('high','medium','review')),
 source_status TEXT,
 source_active INTEGER,
 snapshot_json TEXT NOT NULL DEFAULT '{}',
 dependency_snapshot_json TEXT NOT NULL DEFAULT '{}',
 created_by_type TEXT NOT NULL,
 created_by_id TEXT,
 trashed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 purged_at TEXT,
 restored_at TEXT,
 legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1))
, evidence_status TEXT NOT NULL DEFAULT 'complete' CHECK(evidence_status IN ('complete','pending_reconciliation')), evidence_error_code TEXT, evidence_updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z');

-- table: platform_user_actors
CREATE TABLE platform_user_actors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('read_only_user','action_user','tenant','independent_executor','driver','platform_actor')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  UNIQUE(platform_user_id, actor_type)
);

-- table: platform_user_memberships
CREATE TABLE platform_user_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  membership_type TEXT NOT NULL CHECK(membership_type IN ('tenant','network','mission','platform')),
  membership_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','suspended','revoked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  UNIQUE(platform_user_id, membership_type, membership_id)
);

-- table: platform_user_restrictions
CREATE TABLE platform_user_restrictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  restriction_code TEXT NOT NULL,
  reason TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  UNIQUE(platform_user_id, restriction_code)
);

-- table: platform_user_roles
CREATE TABLE "platform_user_roles" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  role_code TEXT NOT NULL CHECK(role_code IN ('owner','admin','manager','operator','driver','developer','platform_support','platform_administrator','platform_super_administrator')),
  scope_type TEXT NOT NULL DEFAULT 'tenant' CHECK(scope_type IN ('tenant','platform','network','mission')),
  scope_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  UNIQUE(platform_user_id, role_code, scope_type, scope_id)
);

-- table: platform_users
CREATE TABLE platform_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  principal_type TEXT NOT NULL CHECK(principal_type IN ('tenant','executor')),
  principal_id INTEGER NOT NULL,
  account_state TEXT NOT NULL DEFAULT 'active' CHECK(account_state IN ('invited','registered','active','restricted','suspended','deactivated','deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(principal_type, principal_id)
);

-- table: privacy_legal_holds
CREATE TABLE privacy_legal_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  identity_type TEXT,
  identity_id INTEGER,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('account','company','mission','audit','file','evidence')),
  scope_id INTEGER,
  reason TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT
);

-- table: privacy_request_events
CREATE TABLE privacy_request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  privacy_request_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  actor_identity_id INTEGER,
  note TEXT,
  outcome_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(privacy_request_id) REFERENCES privacy_requests(id) ON DELETE CASCADE
);

-- table: privacy_requests
CREATE TABLE privacy_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  identity_type TEXT NOT NULL CHECK(identity_type IN ('tenant','executor','driver')),
  identity_id INTEGER NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('access','rectification','erasure','restriction','export','objection','consent_withdrawal')),
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','processing','completed','partially_completed','restricted','rejected','cancelled')),
  reason TEXT,
  policy_version TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at TEXT,
  completed_at TEXT,
  outcome_code TEXT,
  outcome_note TEXT
, assigned_role TEXT, assigned_at TEXT, last_reviewed_at TEXT, legal_hold_active INTEGER NOT NULL DEFAULT 0, response_channel TEXT);

-- table: processing_purposes
CREATE TABLE processing_purposes (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  default_legal_basis TEXT NOT NULL,
  data_minimization_rule TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: public_executor_identities
CREATE TABLE public_executor_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, session_version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT);

-- table: public_executor_profiles
CREATE TABLE public_executor_profiles (
  executor_id INTEGER PRIMARY KEY,
  registered_company_name TEXT NOT NULL,
  company_category TEXT NOT NULL,
  working_cities TEXT NOT NULL DEFAULT '[]',
  working_zip_codes TEXT NOT NULL DEFAULT '[]',
  mobile TEXT NOT NULL,
  description TEXT NOT NULL,
  vehicle_types TEXT NOT NULL DEFAULT '[]',
  website TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, country_code TEXT NOT NULL DEFAULT 'ZZ',
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id) ON DELETE CASCADE
);

-- table: public_executor_support_requests
CREATE TABLE public_executor_support_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  executor_id INTEGER NOT NULL,
  contact_email TEXT,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  mission_reference TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id)
);

-- table: public_mission_requests
CREATE TABLE public_mission_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, mission_id INTEGER NOT NULL, requester_name TEXT NOT NULL, requester_email TEXT, requester_phone TEXT, requester_message TEXT, status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, executor_id INTEGER REFERENCES public_executor_identities(id), requester_type TEXT, requester_company_id INTEGER, requester_identity_id INTEGER, updated_at TEXT, custody_driver_id INTEGER, FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(mission_id) REFERENCES missions(id));

-- table: readiness_definitions
CREATE TABLE readiness_definitions (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  actor_type TEXT,
  ordinal INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- table: readiness_requirements
CREATE TABLE readiness_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  readiness_code TEXT NOT NULL,
  requirement_code TEXT NOT NULL,
  requirement_label TEXT NOT NULL,
  requirement_kind TEXT NOT NULL CHECK(requirement_kind IN ('identity','verification','jurisdiction','profile','membership','role','entitlement','security','system')),
  blocking INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(readiness_code) REFERENCES readiness_definitions(code) ON DELETE CASCADE,
  UNIQUE(readiness_code, requirement_code)
);

-- table: request_idempotency
CREATE TABLE request_idempotency (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  resource_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
, resource_reference TEXT);

-- table: residency_policies
CREATE TABLE residency_policies (
  code TEXT PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL,
  primary_region TEXT NOT NULL,
  primary_provider TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('required','preferred','policy')),
  fallback_allowed INTEGER NOT NULL DEFAULT 0,
  version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- table: retention_policies
CREATE TABLE retention_policies (
  code TEXT PRIMARY KEY,
  purpose_code TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL,
  sector_code TEXT NOT NULL DEFAULT 'general',
  retention_days INTEGER,
  action_after_expiry TEXT NOT NULL CHECK(action_after_expiry IN ('delete','anonymize','restrict','review')),
  legal_hold_allowed INTEGER NOT NULL DEFAULT 1,
  version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code)
);

-- table: sector_policies
CREATE TABLE sector_policies (
  code TEXT PRIMARY KEY,
  sector_code TEXT NOT NULL,
  regulatory_profile TEXT NOT NULL DEFAULT 'general_operational',
  data_profile TEXT NOT NULL DEFAULT 'standard',
  effective_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sector_code,effective_version)
);

-- table: security_rate_limits
CREATE TABLE security_rate_limits (
  rate_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: subscription_access_grants
CREATE TABLE subscription_access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE,
  grant_type TEXT NOT NULL DEFAULT 'gift_card',
  plan_code TEXT NOT NULL,
  gift_code_id INTEGER,
  starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: subscription_entitlements
CREATE TABLE subscription_entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  capability_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'entitled',
  source_type TEXT NOT NULL DEFAULT 'subscription',
  source_reference TEXT,
  limit_value TEXT,
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES plans(id),
  UNIQUE(company_id,capability_code,version)
);

-- table: subscription_gift_codes
CREATE TABLE subscription_gift_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  plan_code TEXT NOT NULL DEFAULT 'business',
  duration_days INTEGER NOT NULL DEFAULT 30,
  max_redemptions INTEGER NOT NULL DEFAULT 1,
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- table: subscription_policies
CREATE TABLE "subscription_policies" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  country_code TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  billing_mode TEXT NOT NULL DEFAULT 'paid',
  billing_period_days INTEGER NOT NULL DEFAULT 30,
  grace_days INTEGER NOT NULL DEFAULT 7,
  verification_required INTEGER NOT NULL DEFAULT 1,
  max_drivers INTEGER,
  max_missions_period INTEGER,
  max_storage_mb INTEGER,
  public_missions_enabled INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  subscription_class TEXT NOT NULL DEFAULT 'eligible',
  can_create_missions INTEGER NOT NULL DEFAULT 0,
  can_create_drivers INTEGER NOT NULL DEFAULT 0,
  can_share_foryou INTEGER NOT NULL DEFAULT 0,
  can_request_foryou INTEGER NOT NULL DEFAULT 0,
  can_share_network INTEGER NOT NULL DEFAULT 0,
  can_accept_network INTEGER NOT NULL DEFAULT 0,
  UNIQUE(subject_type,country_code,plan_code)
);

-- table: subscription_state_transitions
CREATE TABLE subscription_state_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  predecessor_state TEXT,
  successor_state TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  reason_code TEXT NOT NULL,
  reason TEXT,
  provider_event_id TEXT,
  expected_version INTEGER,
  version INTEGER NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  audit_event_id TEXT,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

-- table: subscription_usage_periods
CREATE TABLE subscription_usage_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  executor_id INTEGER,
  subject_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  missions_created INTEGER NOT NULL DEFAULT 0,
  drivers_created INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subject_type,company_id,executor_id,period_start)
);

-- table: subscriptions
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE,
  plan_id INTEGER,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

-- table: support_requests
CREATE TABLE support_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  identity_id INTEGER,
  role TEXT NOT NULL,
  contact_email TEXT,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  mission_reference TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (identity_id) REFERENCES auth_identities(id)
);

-- table: tenant_executor_links
CREATE TABLE tenant_executor_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  executor_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id),
  UNIQUE(company_id, executor_id)
);

-- table: trust_key_events
CREATE TABLE trust_key_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trust_key_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(trust_key_id) REFERENCES trust_keys(id) ON DELETE CASCADE
);

-- table: trust_keys
CREATE TABLE trust_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_hint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK(status IN ('issued','active','suspended','expired','revoked')),
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TEXT,
  suspended_at TEXT,
  revoked_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_id) REFERENCES verification_profiles(id) ON DELETE CASCADE
);

-- table: user_readiness_events
CREATE TABLE user_readiness_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE
);

-- table: verification_check_legacy
CREATE TABLE verification_check_legacy (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  method TEXT,
  verified_at TEXT,
  reviewer_note TEXT,
  updated_at TEXT NOT NULL
);

-- table: verification_checks
CREATE TABLE "verification_checks" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  check_type TEXT NOT NULL CHECK(check_type IN ('email','phone','company','country','identity')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected','not_required')),
  method TEXT,
  verified_at TEXT,
  reviewer_note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_id) REFERENCES verification_profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id,check_type)
);

-- table: verification_email_codes
CREATE TABLE verification_email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_id) REFERENCES verification_profiles(id) ON DELETE CASCADE
);

-- table: verification_profiles
CREATE TABLE "verification_profiles" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_type TEXT NOT NULL CHECK(identity_type IN ('tenant','executor','driver')),
  identity_id INTEGER NOT NULL,
  email_snapshot TEXT,
  phone_snapshot TEXT,
  company_name_snapshot TEXT,
  person_name_snapshot TEXT,
  country_code TEXT,
  declared_country_code TEXT,
  verified_country_code TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  region TEXT,
  review_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(review_status IN ('draft','pending','approved','rejected')),
  trust_level INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewer_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, company_id INTEGER,
  UNIQUE(identity_type, identity_id)
);

-- view: mission_active_assignment_projection
CREATE VIEW mission_active_assignment_projection AS
SELECT id,company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,request_id,status,
       assigned_at,updated_at,version,source_type,source_id,metadata_json
FROM mission_assignments WHERE status='active';

-- view: mission_canonical_projection
CREATE VIEW mission_canonical_projection AS
SELECT
  m.id,m.company_id,m.reference,
  ps.company_name AS pickup_company,
  ps.address_line1 AS pickup_address,
  ds.company_name AS delivery_company,
  ds.address_line1 AS delivery_address,
  m.mission_date,m.status,m.public_enabled,m.public_description,m.created_at,m.updated_at,
  m.mission_end_time,m.pickup_time,m.delivery_time,m.deadline_at,m.pickup_at_utc,m.delivery_at_utc,m.deadline_at_utc,m.schedule_timezone,
  m.status_changed_at,m.delivery_proof_required,m.customer_id,
  ps.access_from AS pickup_access_from,
  ps.access_to AS pickup_access_to,
  ds.access_from AS delivery_access_from,
  ds.access_to AS delivery_access_to,
  m.state_version,m.state_lock_token,m.state_lock_at,
  ps.address_line1 AS pickup_street,
  ps.postal_code AS pickup_zip_code,
  ps.city AS pickup_city,
  ds.address_line1 AS delivery_street,
  ds.postal_code AS delivery_zip_code,
  ds.city AS delivery_city,
  ps.latitude AS pickup_latitude,
  ps.longitude AS pickup_longitude,
  ds.latitude AS delivery_latitude,
  ds.longitude AS delivery_longitude,
  o.object_type AS object_type,
  o.description AS object_description,
  o.weight_kg AS weight_kg,
  o.volume_m3 AS volume_m3,
  o.pallet_count AS pallet_count,
  json_extract(o.requirements_json,'$.vehicle') AS vehicle_requirement,
  json_extract(o.requirements_json,'$.loading') AS loading_type,
  json_extract(o.requirements_json,'$.unloading') AS unloading_type,
  json_extract(o.requirements_json,'$.matchingNotes') AS matching_notes,
  m.capability_code,m.objective,m.responsibility_mode,m.country_code,m.sector_code,m.product_definition_id,m.lifecycle_definition_id,m.lifecycle_state_code,
  m.archived_at,m.archived_by_identity_id,m.archive_reason
FROM missions m
LEFT JOIN mission_stops ps
  ON ps.company_id=m.company_id AND ps.mission_id=m.id AND ps.stop_type='pickup'
  AND ps.id=(SELECT x.id FROM mission_stops x WHERE x.company_id=m.company_id AND x.mission_id=m.id AND x.stop_type='pickup' ORDER BY x.sequence_no LIMIT 1)
LEFT JOIN mission_stops ds
  ON ds.company_id=m.company_id AND ds.mission_id=m.id AND ds.stop_type='delivery'
  AND ds.id=(SELECT x.id FROM mission_stops x WHERE x.company_id=m.company_id AND x.mission_id=m.id AND x.stop_type='delivery' ORDER BY x.sequence_no DESC LIMIT 1)
LEFT JOIN mission_objects o
  ON o.company_id=m.company_id AND o.mission_id=m.id
  AND o.id=(SELECT x.id FROM mission_objects x WHERE x.company_id=m.company_id AND x.mission_id=m.id ORDER BY x.sequence_no LIMIT 1);

-- index: idx_action_execution_telemetry_company_time
CREATE INDEX idx_action_execution_telemetry_company_time
  ON action_execution_telemetry(company_id,created_at DESC,id DESC);

-- index: idx_action_execution_telemetry_expiry
CREATE INDEX idx_action_execution_telemetry_expiry
  ON action_execution_telemetry(expires_at);

-- index: idx_action_execution_telemetry_mission_time
CREATE INDEX idx_action_execution_telemetry_mission_time
  ON action_execution_telemetry(company_id,mission_id,created_at DESC,id DESC);

-- index: idx_action_execution_telemetry_trace
CREATE INDEX idx_action_execution_telemetry_trace
  ON action_execution_telemetry(company_id,trace_id,event_sequence);

-- index: idx_activation_review_fulfillment
CREATE INDEX idx_activation_review_fulfillment
ON activation_review_requests(identity_type,identity_id,status,user_completed_at,created_at DESC);

-- index: idx_activation_review_identity
CREATE INDEX idx_activation_review_identity
ON activation_review_requests(identity_type,identity_id,status,created_at DESC);

-- index: idx_activation_review_tenant
CREATE INDEX idx_activation_review_tenant
ON activation_review_requests(tenant_id,status,created_at DESC);

-- index: idx_admin_control_audit_company
CREATE INDEX idx_admin_control_audit_company ON admin_control_audit_events(target_company_id,created_at DESC);

-- index: idx_admin_control_audit_created
CREATE INDEX idx_admin_control_audit_created ON admin_control_audit_events(created_at DESC);

-- index: idx_admin_control_audit_resource
CREATE INDEX idx_admin_control_audit_resource ON admin_control_audit_events(resource_type,resource_id,created_at DESC);

-- index: idx_agent_action_profile_action
CREATE INDEX idx_agent_action_profile_action ON agent_action_outcome_profiles(action_code,updated_at DESC);

-- index: idx_agent_action_profile_company
CREATE INDEX idx_agent_action_profile_company ON agent_action_outcome_profiles(company_id,updated_at DESC);

-- index: idx_agent_autonomy_policy_action_scope
CREATE INDEX idx_agent_autonomy_policy_action_scope ON agent_action_autonomy_policies(action_code,scope_type,scope_key,active);

-- index: idx_agent_autonomy_policy_active
CREATE INDEX idx_agent_autonomy_policy_active ON agent_action_autonomy_policies(active,updated_at DESC);

-- index: idx_agent_calibration_observation_action
CREATE INDEX idx_agent_calibration_observation_action ON agent_calibration_observations(company_id,action_code,occurred_at DESC);

-- index: idx_agent_calibration_observation_class
CREATE INDEX idx_agent_calibration_observation_class ON agent_calibration_observations(company_id,evaluation_class,occurred_at DESC);

-- index: idx_agent_calibration_observation_company
CREATE INDEX idx_agent_calibration_observation_company ON agent_calibration_observations(company_id,occurred_at DESC);

-- index: idx_agent_calibration_observation_executor
CREATE INDEX idx_agent_calibration_observation_executor ON agent_calibration_observations(company_id,executor_id,occurred_at DESC);

-- index: idx_agent_calibration_profile_action
CREATE INDEX idx_agent_calibration_profile_action ON agent_calibration_profiles(company_id,action_code,updated_at DESC);

-- index: idx_agent_calibration_profile_company
CREATE INDEX idx_agent_calibration_profile_company ON agent_calibration_profiles(company_id,updated_at DESC);

-- index: idx_agent_calibration_profile_scope
CREATE INDEX idx_agent_calibration_profile_scope ON agent_calibration_profiles(company_id,scope_type,scope_key,updated_at DESC);

-- index: idx_agent_calibration_runs_company
CREATE INDEX idx_agent_calibration_runs_company ON agent_calibration_runs(company_id,completed_at DESC);

-- index: idx_agent_company_autonomy_mode
CREATE INDEX idx_agent_company_autonomy_mode ON agent_company_autonomy_config(mode,execution_enabled,updated_at DESC);

-- index: idx_agent_decision_action
CREATE INDEX idx_agent_decision_action ON agent_decision_events(action_code,created_at DESC);

-- index: idx_agent_decision_agent
CREATE INDEX idx_agent_decision_agent ON agent_decision_events(agent_id,created_at DESC);

-- index: idx_agent_decision_company_mission
CREATE INDEX idx_agent_decision_company_mission ON agent_decision_events(company_id,mission_id,created_at DESC);

-- index: idx_agent_decision_decision
CREATE INDEX idx_agent_decision_decision ON agent_decision_events(decision_id);

-- index: idx_agent_decision_policy
CREATE INDEX idx_agent_decision_policy ON agent_decision_events(policy_version,policy_hash);

-- index: idx_agent_decision_risk
CREATE INDEX idx_agent_decision_risk ON agent_decision_events(risk_class,created_at DESC);

-- index: idx_agent_exec_action
CREATE INDEX idx_agent_exec_action ON agent_execution_attempts(action_code,created_at DESC);

-- index: idx_agent_exec_assignment_fence
CREATE INDEX idx_agent_exec_assignment_fence
ON agent_execution_attempts(company_id,mission_id,assignment_id,assignment_version,status);

-- index: idx_agent_exec_company_mission
CREATE INDEX idx_agent_exec_company_mission ON agent_execution_attempts(company_id,mission_id,created_at DESC);

-- index: idx_agent_exec_decision
CREATE INDEX idx_agent_exec_decision ON agent_execution_attempts(decision_id);

-- index: idx_agent_exec_intent
CREATE INDEX idx_agent_exec_intent ON agent_execution_attempts(execution_intent_id);

-- index: idx_agent_exec_policy
CREATE INDEX idx_agent_exec_policy ON agent_execution_attempts(policy_version,policy_hash);

-- index: idx_agent_exec_runtime_lease
CREATE INDEX idx_agent_exec_runtime_lease
ON agent_execution_attempts(status,runtime_lease_expires_at,updated_at);

-- index: idx_agent_exec_status
CREATE INDEX idx_agent_exec_status ON agent_execution_attempts(status,created_at DESC);

-- index: idx_agent_executor_profile_company
CREATE INDEX idx_agent_executor_profile_company ON agent_executor_outcome_profiles(company_id,updated_at DESC);

-- index: idx_agent_executor_profile_executor
CREATE INDEX idx_agent_executor_profile_executor ON agent_executor_outcome_profiles(executor_id,updated_at DESC);

-- index: idx_agent_learning_observation_action
CREATE INDEX idx_agent_learning_observation_action ON agent_learning_observations(company_id,action_code,occurred_at DESC);

-- index: idx_agent_learning_observation_company
CREATE INDEX idx_agent_learning_observation_company ON agent_learning_observations(company_id,occurred_at DESC);

-- index: idx_agent_learning_observation_outcome
CREATE INDEX idx_agent_learning_observation_outcome ON agent_learning_observations(company_id,outcome_code,occurred_at DESC);

-- index: idx_agent_learning_profile_action
CREATE INDEX idx_agent_learning_profile_action ON agent_learning_profiles(company_id,action_code,updated_at DESC);

-- index: idx_agent_learning_profile_company
CREATE INDEX idx_agent_learning_profile_company ON agent_learning_profiles(company_id,updated_at DESC);

-- index: idx_agent_learning_runs_company
CREATE INDEX idx_agent_learning_runs_company ON agent_learning_runs(company_id,completed_at DESC);

-- index: idx_agent_organization_profile_updated
CREATE INDEX idx_agent_organization_profile_updated ON agent_organization_outcome_profiles(updated_at DESC);

-- index: idx_agent_outcome_action
CREATE INDEX idx_agent_outcome_action ON agent_outcome_events(action_code, occurred_at DESC);

-- index: idx_agent_outcome_company_mission
CREATE INDEX idx_agent_outcome_company_mission ON agent_outcome_events(company_id, mission_id, occurred_at DESC);

-- index: idx_agent_outcome_decision
CREATE INDEX idx_agent_outcome_decision ON agent_outcome_events(decision_id);

-- index: idx_agent_outcome_executor
CREATE INDEX idx_agent_outcome_executor ON agent_outcome_events(executor_id, occurred_at DESC);

-- index: idx_agent_outcome_outcome
CREATE INDEX idx_agent_outcome_outcome ON agent_outcome_events(outcome_code, occurred_at DESC);

-- index: idx_agent_outcome_resolution_action
CREATE INDEX idx_agent_outcome_resolution_action ON agent_outcome_resolution_events(company_id,action_code,resolved_at DESC);

-- index: idx_agent_outcome_resolution_company
CREATE INDEX idx_agent_outcome_resolution_company ON agent_outcome_resolution_events(company_id,resolved_at DESC);

-- index: idx_agent_outcome_resolution_event
CREATE INDEX idx_agent_outcome_resolution_event ON agent_outcome_resolution_events(event_id,resolved_at DESC);

-- index: idx_agent_pilot_company_scope
CREATE UNIQUE INDEX idx_agent_pilot_company_scope ON agent_customer_pilot_profiles(company_id,country_code,sector_code,status);

-- index: idx_agent_pilot_events_mission
CREATE INDEX idx_agent_pilot_events_mission ON agent_pilot_events(company_id,mission_id,created_at DESC);

-- index: idx_agent_pilot_events_scope
CREATE INDEX idx_agent_pilot_events_scope ON agent_pilot_events(pilot_id,created_at DESC);

-- index: idx_agent_pilot_mission_scope
CREATE INDEX idx_agent_pilot_mission_scope ON agent_pilot_mission_enrollments(company_id,mission_id,status);

-- index: idx_agent_pilot_mission_status
CREATE INDEX idx_agent_pilot_mission_status ON agent_pilot_mission_enrollments(pilot_id,status,updated_at DESC);

-- index: idx_agent_pilot_readiness
CREATE INDEX idx_agent_pilot_readiness ON agent_pilot_readiness_checks(pilot_id,status,evaluated_at DESC);

-- index: idx_agent_pilot_status
CREATE INDEX idx_agent_pilot_status ON agent_customer_pilot_profiles(status,updated_at DESC);

-- index: idx_agent_production_execution_attempt
CREATE INDEX idx_agent_production_execution_attempt ON agent_production_execution_events(attempt_id,occurred_at DESC);

-- index: idx_agent_production_execution_company
CREATE INDEX idx_agent_production_execution_company ON agent_production_execution_events(company_id,occurred_at DESC);

-- index: idx_agent_production_execution_mission
CREATE INDEX idx_agent_production_execution_mission ON agent_production_execution_events(company_id,mission_id,occurred_at DESC);

-- index: idx_agent_production_execution_pilot
CREATE INDEX idx_agent_production_execution_pilot ON agent_production_execution_events(company_id,pilot_id,occurred_at DESC);

-- index: idx_agent_recovery_attempt
CREATE INDEX idx_agent_recovery_attempt ON agent_execution_recovery_events(attempt_id,created_at DESC);

-- index: idx_agent_recovery_company_mission
CREATE INDEX idx_agent_recovery_company_mission ON agent_execution_recovery_events(company_id,mission_id,created_at DESC);

-- index: idx_agent_recovery_state
CREATE INDEX idx_agent_recovery_state ON agent_execution_recovery_events(recovery_state,created_at DESC);

-- index: idx_agent_semantic_memory_company_status
CREATE INDEX idx_agent_semantic_memory_company_status ON agent_semantic_memory_documents(company_id,status,updated_at DESC);

-- index: idx_agent_semantic_memory_hash
CREATE INDEX idx_agent_semantic_memory_hash ON agent_semantic_memory_documents(company_id,content_hash);

-- index: idx_agent_semantic_memory_mission
CREATE INDEX idx_agent_semantic_memory_mission ON agent_semantic_memory_documents(company_id,mission_id,sequence DESC);

-- index: idx_agent_semantic_memory_vector
CREATE INDEX idx_agent_semantic_memory_vector ON agent_semantic_memory_documents(company_id,vector_id);

-- index: idx_analytics_policy_scope
CREATE INDEX idx_analytics_policy_scope ON analytics_policy_registry(company_id,country_code,active,effective_at DESC);

-- index: idx_audit_company_created
CREATE INDEX idx_audit_company_created ON audit_logs(company_id, created_at DESC);

-- index: idx_audit_created
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- index: idx_audit_resource
CREATE INDEX idx_audit_resource ON audit_logs(company_id, resource_type, resource_id);

-- index: idx_auth_company_role
CREATE INDEX idx_auth_company_role
ON auth_identities(company_id, role, active);

-- index: idx_auth_driver
CREATE INDEX idx_auth_driver
ON auth_identities(company_id, driver_id);

-- index: idx_auth_identity_session_authority
CREATE INDEX idx_auth_identity_session_authority
ON auth_identities(id, active, session_version);

-- index: idx_backup_reconciliation_scope
CREATE INDEX idx_backup_reconciliation_scope ON backup_reconciliation_events(company_id,recovery_point_id,created_at DESC);

-- index: idx_backup_recovery_points_expiry
CREATE INDEX idx_backup_recovery_points_expiry ON backup_recovery_points(expires_at,deletion_status);

-- index: idx_backup_recovery_points_scope
CREATE INDEX idx_backup_recovery_points_scope ON backup_recovery_points(backup_code,company_id,captured_at DESC);

-- index: idx_backup_restore_requests_status
CREATE INDEX idx_backup_restore_requests_status ON backup_restore_requests(execution_status,authorization_status,requested_at DESC);

-- index: idx_billing_identities_provider
CREATE INDEX idx_billing_identities_provider ON billing_identities(provider_code,provider_customer_id);

-- index: idx_billing_invoices_company
CREATE INDEX idx_billing_invoices_company ON billing_invoices(company_id,issued_at);

-- index: idx_billing_jurisdiction_policies_active
CREATE INDEX idx_billing_jurisdiction_policies_active ON billing_jurisdiction_policies(country_code,jurisdiction_code,active);

-- index: idx_billing_payments_company
CREATE INDEX idx_billing_payments_company ON billing_payments(company_id,processed_at);

-- index: idx_billing_provider_events_status
CREATE INDEX idx_billing_provider_events_status ON billing_provider_events(processing_status,created_at);

-- index: idx_billing_reconciliation_company
CREATE INDEX idx_billing_reconciliation_company ON billing_reconciliation_events(company_id,created_at);

-- index: idx_billing_state_transitions_company
CREATE INDEX idx_billing_state_transitions_company ON billing_state_transitions(company_id,entity_type,occurred_at);

-- index: idx_canonical_capability_domain
CREATE INDEX idx_canonical_capability_domain ON canonical_capability_registry(domain_code,status);

-- index: idx_canonical_object_type_capability
CREATE INDEX idx_canonical_object_type_capability ON canonical_object_type_registry(capability_code,status);

-- index: idx_canonical_relationship_scope
CREATE INDEX idx_canonical_relationship_scope ON canonical_relationship_type_registry(relationship_scope,status);

-- index: idx_capability_contract_status
CREATE INDEX idx_capability_contract_status ON canonical_capability_contracts(status,capability_code);

-- index: idx_certification_fixture_status
CREATE INDEX idx_certification_fixture_status
  ON platform_certification_fixtures(status,updated_at DESC);

-- index: idx_certification_fixture_users_login
CREATE INDEX idx_certification_fixture_users_login
  ON platform_certification_fixture_users(fixture_code,login);

-- index: idx_company_management_country
CREATE INDEX idx_company_management_country ON company_management_profiles(country_code,status);

-- index: idx_company_management_lifecycle
CREATE INDEX idx_company_management_lifecycle ON company_management_profiles(status,status_version,updated_at);

-- index: idx_company_management_sector
CREATE INDEX idx_company_management_sector ON company_management_profiles(sector_code,status);

-- index: idx_compliance_evidence_company
CREATE INDEX idx_compliance_evidence_company ON compliance_evidence_registry(company_id,observed_at DESC);

-- index: idx_compliance_evidence_control
CREATE INDEX idx_compliance_evidence_control ON compliance_evidence_registry(control_code,status,observed_at DESC);

-- index: idx_compliance_evidence_type
CREATE INDEX idx_compliance_evidence_type ON compliance_evidence_registry(evidence_type,status,observed_at DESC);

-- index: idx_consent_policy_audit_company
CREATE INDEX idx_consent_policy_audit_company
  ON consent_policy_audit_events(company_id,created_at DESC);

-- index: idx_consent_policy_audit_created
CREATE INDEX idx_consent_policy_audit_created
  ON consent_policy_audit_events(created_at DESC);

-- index: idx_consent_policy_purpose
CREATE INDEX idx_consent_policy_purpose
  ON consent_policy_versions(purpose_code,country_code,active,effective_at DESC);

-- index: idx_consent_policy_scope
CREATE INDEX idx_consent_policy_scope
  ON consent_policy_versions(company_id,country_code,purpose_code,active,effective_at DESC);

-- index: idx_consent_records_identity_purpose
CREATE INDEX idx_consent_records_identity_purpose
  ON consent_records(company_id,identity_type,identity_id,purpose_code,granted);

-- index: idx_country_blueprint_contents
CREATE INDEX idx_country_blueprint_contents ON platform_country_product_contents(blueprint_id,language_code,status,required);

-- index: idx_country_blueprint_languages
CREATE INDEX idx_country_blueprint_languages ON platform_country_product_languages(blueprint_id,is_primary,enabled);

-- index: idx_country_blueprint_legal
CREATE INDEX idx_country_blueprint_legal ON platform_country_product_legal_requirements(blueprint_id,status,required);

-- index: idx_country_blueprint_sectors
CREATE INDEX idx_country_blueprint_sectors ON platform_country_product_sectors(blueprint_id,status,required);

-- index: idx_country_blueprints_country_status
CREATE INDEX idx_country_blueprints_country_status ON platform_country_product_blueprints(country_code,status,updated_at DESC);

-- index: idx_country_catalog_active_name
CREATE INDEX idx_country_catalog_active_name ON country_catalog(active,name);

-- index: idx_country_catalog_active_updated
CREATE INDEX idx_country_catalog_active_updated ON country_catalog(active, updated_at DESC, created_at DESC);

-- index: idx_country_product_launch_active
CREATE INDEX idx_country_product_launch_active ON country_product_launches(country_code,status,active);

-- index: idx_country_product_launch_changes
CREATE INDEX idx_country_product_launch_changes ON country_product_launch_change_requests(launch_id,stage,created_at DESC);

-- index: idx_country_product_launch_status
CREATE INDEX idx_country_product_launch_status ON country_product_launches(status,updated_at DESC);

-- index: idx_cp_dependencies_dependency
CREATE INDEX idx_cp_dependencies_dependency ON platform_control_plane_dependencies(dependency_type,dependency_key,relation);

-- index: idx_cp_dependencies_resource
CREATE INDEX idx_cp_dependencies_resource ON platform_control_plane_dependencies(resource_type,resource_key,relation);

-- index: idx_cp_error_contracts_resource
CREATE INDEX idx_cp_error_contracts_resource ON platform_control_plane_error_contracts(resource_type,error_code);

-- index: idx_cp_readiness_status
CREATE INDEX idx_cp_readiness_status ON platform_control_plane_readiness(status,updated_at DESC);

-- index: idx_cp_resource_contract_owner
CREATE INDEX idx_cp_resource_contract_owner ON platform_control_plane_resource_contracts(owner_capability,resource_type);

-- index: idx_cp_resource_contracts_type
CREATE INDEX idx_cp_resource_contracts_type ON platform_control_plane_resource_contracts(resource_type,updated_at DESC);

-- index: idx_critical_audit_company_created
CREATE INDEX idx_critical_audit_company_created ON critical_audit_events(company_id,created_at);

-- index: idx_critical_audit_phase
CREATE INDEX idx_critical_audit_phase ON critical_audit_events(phase,created_at);

-- index: idx_custody_case_company
CREATE INDEX idx_custody_case_company
ON mission_custody_cases(company_id,mission_id,created_at DESC);

-- index: idx_custody_handoff_channel
CREATE INDEX idx_custody_handoff_channel
ON mission_custody_cases(company_id,mission_id,transfer_channel,status);

-- index: idx_customer_locations
CREATE INDEX idx_customer_locations ON network_customer_locations(company_id,customer_id,active,label);

-- index: idx_data_classification_registry_table
CREATE INDEX idx_data_classification_registry_table
  ON data_classification_registry(table_name,column_name);

-- index: idx_data_lifecycle_entry
CREATE INDEX idx_data_lifecycle_entry ON platform_data_lifecycle_events(source_entry_id,created_at DESC,id DESC);

-- index: idx_data_lifecycle_resource
CREATE INDEX idx_data_lifecycle_resource ON platform_data_lifecycle_events(resource_type,resource_id,id DESC);

-- index: idx_data_lifecycle_stage
CREATE INDEX idx_data_lifecycle_stage ON platform_data_lifecycle_events(stage,created_at DESC,id DESC);

-- index: idx_delivery_proof_mission
CREATE INDEX idx_delivery_proof_mission
ON mission_delivery_proofs(company_id, mission_id);

-- index: idx_demo_execution_events_company_mission
CREATE INDEX idx_demo_execution_events_company_mission ON demo_execution_events(company_id,mission_id,sequence);

-- index: idx_demo_fixture_users_login
CREATE INDEX idx_demo_fixture_users_login
  ON platform_demo_fixture_users(fixture_code,login);

-- index: idx_demo_fixtures_status
CREATE INDEX idx_demo_fixtures_status
  ON platform_demo_fixtures(status,updated_at DESC);

-- index: idx_demo_product_profiles_country_sector
CREATE INDEX idx_demo_product_profiles_country_sector
  ON platform_demo_product_profiles(country_code,sector_code,status);

-- index: idx_demo_scenario_company_status
CREATE INDEX idx_demo_scenario_company_status ON demo_scenario_instances(company_id,status,updated_at DESC);

-- index: idx_demo_scenario_current_sequence
CREATE INDEX idx_demo_scenario_current_sequence
  ON demo_scenario_instances(company_id,status,current_sequence,updated_at DESC);

-- index: idx_demo_scenario_mission
CREATE INDEX idx_demo_scenario_mission ON demo_scenario_instances(mission_id,status);

-- index: idx_driver_content_preferences_driver
CREATE INDEX idx_driver_content_preferences_driver
ON driver_content_preferences(company_id,driver_id);

-- index: idx_driver_daily_notes_scope
CREATE INDEX idx_driver_daily_notes_scope
ON driver_daily_notes(company_id,driver_id,id);

-- index: idx_driver_direct_messages_scope
CREATE INDEX idx_driver_direct_messages_scope
ON driver_direct_messages(company_id, driver_id, id);

-- index: idx_driver_operational_company
CREATE INDEX idx_driver_operational_company
ON driver_operational_profiles(company_id, driver_id);

-- index: idx_drivers_company_active_removed
CREATE INDEX idx_drivers_company_active_removed ON drivers(company_id,active,removed_at,id);

-- index: idx_environment_profiles_code_status
CREATE INDEX idx_environment_profiles_code_status ON platform_environment_profiles(environment_code,status,updated_at DESC);

-- index: idx_environment_profiles_country_product
CREATE INDEX idx_environment_profiles_country_product
  ON platform_environment_profiles(environment_code,country_code,product_definition_id,status);

-- index: idx_environment_profiles_scenario
CREATE INDEX idx_environment_profiles_scenario ON platform_environment_profiles(scenario_code,status);

-- index: idx_event_ledger_transition_outcome
CREATE INDEX idx_event_ledger_transition_outcome
ON mission_event_ledger(transition_key,outcome,updated_at DESC);

-- index: idx_execution_intents_company_mission
CREATE INDEX idx_execution_intents_company_mission ON mission_execution_intents(company_id,mission_id,created_at DESC);

-- index: idx_execution_intents_provider
CREATE INDEX idx_execution_intents_provider ON mission_execution_intents(provider_code,provider_operation_id);

-- index: idx_execution_intents_status
CREATE INDEX idx_execution_intents_status ON mission_execution_intents(status,created_at DESC);

-- index: idx_executor_assignments_company_mission_status
CREATE INDEX idx_executor_assignments_company_mission_status
  ON mission_executor_assignments(company_id,mission_id,status,id DESC);

-- index: idx_executor_assignments_executor
CREATE INDEX idx_executor_assignments_executor
ON mission_executor_assignments(executor_id, status, assigned_at DESC);

-- index: idx_executor_operational_situation
CREATE INDEX idx_executor_operational_situation
ON executor_operational_profiles(situation,updated_at DESC);

-- index: idx_executor_profiles_country
CREATE INDEX idx_executor_profiles_country ON public_executor_profiles(country_code);

-- index: idx_executor_session_authority
CREATE INDEX idx_executor_session_authority
ON public_executor_identities(id, active, session_version);

-- index: idx_executor_support_created
CREATE INDEX idx_executor_support_created
ON public_executor_support_requests(executor_id, created_at DESC);

-- index: idx_external_provider_audit_provider
CREATE INDEX idx_external_provider_audit_provider ON external_provider_audit_events(provider_code,company_id,created_at DESC);

-- index: idx_external_provider_capabilities_action
CREATE INDEX idx_external_provider_capabilities_action
ON external_provider_capabilities(action_code,active,version DESC);

-- index: idx_external_provider_capabilities_provider
CREATE INDEX idx_external_provider_capabilities_provider
ON external_provider_capabilities(provider_code,active,version DESC);

-- index: idx_external_provider_execution_attempt
CREATE INDEX idx_external_provider_execution_attempt
ON external_provider_execution_events(attempt_id,created_at DESC);

-- index: idx_external_provider_execution_provider
CREATE INDEX idx_external_provider_execution_provider
ON external_provider_execution_events(provider_code,created_at DESC);

-- index: idx_external_provider_execution_scope
CREATE INDEX idx_external_provider_execution_scope
ON external_provider_execution_events(company_id,mission_id,created_at DESC);

-- index: idx_external_provider_policy_scope
CREATE INDEX idx_external_provider_policy_scope ON external_provider_policies(provider_code,company_id,country_code,active,effective_at DESC);

-- index: idx_governed_intake_items_entry
CREATE INDEX idx_governed_intake_items_entry ON platform_governed_intake_items(target_entry_id);

-- index: idx_governed_intake_items_status
CREATE INDEX idx_governed_intake_items_status ON platform_governed_intake_items(intake_id,status,id);

-- index: idx_governed_intake_scope
CREATE INDEX idx_governed_intake_scope ON platform_governed_intake_batches(country_scope,tenant_scope,created_at DESC);

-- index: idx_governed_intake_source_hash
CREATE INDEX idx_governed_intake_source_hash ON platform_governed_intake_batches(source_hash,intake_type);

-- index: idx_governed_intake_status
CREATE INDEX idx_governed_intake_status ON platform_governed_intake_batches(status,updated_at DESC,id DESC);

-- index: idx_infra_resource_events_resource
CREATE INDEX idx_infra_resource_events_resource ON platform_infrastructure_resource_events(resource_id,event_id DESC);

-- index: idx_infra_resources_environment
CREATE INDEX idx_infra_resources_environment ON platform_infrastructure_resources(environment_scope,lifecycle_state,resource_type);

-- index: idx_infra_resources_owner
CREATE INDEX idx_infra_resources_owner ON platform_infrastructure_resources(owner_capability,lifecycle_state);

-- index: idx_lifecycle_definitions_scope
CREATE INDEX idx_lifecycle_definitions_scope ON platform_lifecycle_definitions(country_code,sector_code,status,version DESC);

-- index: idx_lifecycle_states_definition
CREATE INDEX idx_lifecycle_states_definition ON platform_lifecycle_states(lifecycle_definition_id,sequence_no,state_code);

-- index: idx_lifecycle_transitions_definition
CREATE INDEX idx_lifecycle_transitions_definition ON platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,sequence_no);

-- index: idx_management_requirement_actor
CREATE INDEX idx_management_requirement_actor
ON mission_management_requirements(requested_actor_type,requested_actor_id,status,created_at DESC);

-- index: idx_management_requirement_mission
CREATE INDEX idx_management_requirement_mission
ON mission_management_requirements(company_id,mission_id,status,created_at DESC);

-- index: idx_market_launch_task_status
CREATE INDEX idx_market_launch_task_status ON platform_market_launch_task_evidence(package_version_id,status,updated_at DESC);

-- index: idx_market_package_imports_version
CREATE INDEX idx_market_package_imports_version
  ON platform_market_package_imports(package_version_id,created_at DESC);

-- index: idx_market_package_versions_status
CREATE INDEX idx_market_package_versions_status
  ON platform_market_package_versions(package_id,status,updated_at DESC);

-- index: idx_market_packages_status
CREATE INDEX idx_market_packages_status
  ON platform_market_packages(status,updated_at DESC);

-- index: idx_market_publication_operations_status
CREATE INDEX idx_market_publication_operations_status ON platform_market_publication_operations(status,updated_at DESC);

-- index: idx_market_release_contract_status
CREATE INDEX idx_market_release_contract_status
  ON platform_market_release_contracts(status,updated_at DESC);

-- index: idx_mission_access_codes_active
CREATE UNIQUE INDEX idx_mission_access_codes_active
  ON mission_access_codes(mission_id) WHERE status='active';

-- index: idx_mission_access_codes_hash_status
CREATE INDEX idx_mission_access_codes_hash_status
  ON mission_access_codes(code_hash,status);

-- index: idx_mission_assignment_decisions_mission
CREATE INDEX idx_mission_assignment_decisions_mission
  ON mission_assignment_decisions(company_id,mission_id,status,created_at DESC,id DESC);

-- index: idx_mission_assignment_decisions_target
CREATE INDEX idx_mission_assignment_decisions_target
  ON mission_assignment_decisions(target_type,target_id,status,created_at DESC);

-- index: idx_mission_assignment_events_mission
CREATE INDEX idx_mission_assignment_events_mission ON mission_assignment_events(mission_id,created_at,id);

-- index: idx_mission_assignment_reconciliation_mission
CREATE UNIQUE INDEX idx_mission_assignment_reconciliation_mission
  ON mission_assignment_reconciliation(mission_id);

-- index: idx_mission_assignment_subjects_company_status
CREATE INDEX idx_mission_assignment_subjects_company_status
  ON mission_assignment_subjects(company_id,subject_type,status,updated_at DESC,id DESC);

-- index: idx_mission_assignment_subjects_source
CREATE INDEX idx_mission_assignment_subjects_source
  ON mission_assignment_subjects(source_authority,source_id,status);

-- index: idx_mission_assignments_assignee
CREATE INDEX idx_mission_assignments_assignee
  ON mission_assignments(assignee_type,assignee_id,status,updated_at DESC);

-- index: idx_mission_assignments_company_mission_status
CREATE INDEX idx_mission_assignments_company_mission_status
  ON mission_assignments(company_id,mission_id,status,updated_at DESC,id DESC);

-- index: idx_mission_assignments_company_status
CREATE INDEX idx_mission_assignments_company_status
  ON mission_assignments(company_id,status,updated_at DESC,id DESC);

-- index: idx_mission_assignments_one_active
CREATE UNIQUE INDEX idx_mission_assignments_one_active
  ON mission_assignments(mission_id) WHERE status='active';

-- index: idx_mission_cancellation_company
CREATE INDEX idx_mission_cancellation_company
ON mission_cancellations(company_id,created_at DESC);

-- index: idx_mission_cancellations_company_mission
CREATE INDEX idx_mission_cancellations_company_mission ON mission_cancellations(company_id,mission_id);

-- index: idx_mission_custody_cases_company_mission
CREATE INDEX idx_mission_custody_cases_company_mission ON mission_custody_cases(company_id,mission_id);

-- index: idx_mission_custody_events_company_mission
CREATE INDEX idx_mission_custody_events_company_mission
  ON mission_custody_events(company_id,mission_id,created_at,id);

-- index: idx_mission_custody_events_mission
CREATE INDEX idx_mission_custody_events_mission ON mission_custody_events(mission_id,created_at,id);

-- index: idx_mission_delivery_proofs_company_mission
CREATE INDEX idx_mission_delivery_proofs_company_mission ON mission_delivery_proofs(company_id,mission_id);

-- index: idx_mission_event_ledger_company_mission
CREATE INDEX idx_mission_event_ledger_company_mission
  ON mission_event_ledger(company_id,mission_id,created_at,id);

-- index: idx_mission_event_ledger_company_mission_outcome_time
CREATE INDEX idx_mission_event_ledger_company_mission_outcome_time
  ON mission_event_ledger(company_id,mission_id,outcome,created_at DESC,id DESC);

-- index: idx_mission_event_ledger_mission
CREATE INDEX idx_mission_event_ledger_mission
ON mission_event_ledger(company_id,mission_id,id DESC);

-- index: idx_mission_event_ledger_outcome
CREATE INDEX idx_mission_event_ledger_outcome
ON mission_event_ledger(outcome,updated_at DESC);

-- index: idx_mission_evidence_events_company_mission
CREATE INDEX idx_mission_evidence_events_company_mission
  ON mission_evidence_events(company_id,mission_id,created_at,id);

-- index: idx_mission_evidence_events_mission
CREATE INDEX idx_mission_evidence_events_mission ON mission_evidence_events(mission_id,created_at,id);

-- index: idx_mission_exceptions_company_mission
CREATE INDEX idx_mission_exceptions_company_mission ON mission_exceptions(company_id,mission_id);

-- index: idx_mission_exceptions_company_mission_status_time
CREATE INDEX idx_mission_exceptions_company_mission_status_time
  ON mission_exceptions(company_id,mission_id,status,created_at DESC,id DESC);

-- index: idx_mission_exceptions_open
CREATE INDEX idx_mission_exceptions_open
ON mission_exceptions(company_id,mission_id,status,created_at);

-- index: idx_mission_files_company_mission
CREATE INDEX idx_mission_files_company_mission ON mission_files(company_id,mission_id);

-- index: idx_mission_files_company_mission_id
CREATE INDEX idx_mission_files_company_mission_id
  ON mission_files(company_id,mission_id,id);

-- index: idx_mission_files_controller
CREATE INDEX idx_mission_files_controller ON mission_files(controller_company_id,owner_type,owner_id);

-- index: idx_mission_files_creator
CREATE INDEX idx_mission_files_creator ON mission_files(created_by_identity_type,created_by_identity_id);

-- index: idx_mission_files_governance
CREATE INDEX idx_mission_files_governance ON mission_files(company_id,mission_id,disposition_status,purpose_code,id);

-- index: idx_mission_files_retention
CREATE INDEX idx_mission_files_retention ON mission_files(retention_policy_code,retention_due_at,legal_hold_active,disposition_status);

-- index: idx_mission_lifecycle_events_company_mission
CREATE INDEX idx_mission_lifecycle_events_company_mission ON mission_lifecycle_events(company_id,mission_id);

-- index: idx_mission_lifecycle_events_mission
CREATE INDEX idx_mission_lifecycle_events_mission
ON mission_lifecycle_events(company_id,mission_id,created_at DESC,id DESC);

-- index: idx_mission_management_requirements_company_mission
CREATE INDEX idx_mission_management_requirements_company_mission ON mission_management_requirements(company_id,mission_id);

-- index: idx_mission_messages_attention
CREATE INDEX idx_mission_messages_attention
ON mission_messages(company_id,mission_id,attention_required,attention_resolved_at);

-- index: idx_mission_messages_company_mission
CREATE INDEX idx_mission_messages_company_mission ON mission_messages(company_id,mission_id);

-- index: idx_mission_messages_scope_id
CREATE INDEX idx_mission_messages_scope_id ON mission_messages(company_id,mission_id,id);

-- index: idx_mission_next_situation_current
CREATE INDEX idx_mission_next_situation_current
ON mission_next_situations(company_id,mission_id,created_at DESC,id DESC);

-- index: idx_mission_next_situation_outcome
CREATE INDEX idx_mission_next_situation_outcome
ON mission_next_situations(source_outcome_id,created_at DESC);

-- index: idx_mission_next_situation_sequence
CREATE UNIQUE INDEX idx_mission_next_situation_sequence
ON mission_next_situations(company_id,mission_id,sequence_no);

-- index: idx_mission_next_situation_state
CREATE INDEX idx_mission_next_situation_state
ON mission_next_situations(company_id,state,created_at DESC,id DESC);

-- index: idx_mission_objects_company_mission
CREATE INDEX idx_mission_objects_company_mission
  ON mission_objects(company_id,mission_id,sequence_no);

-- index: idx_mission_objects_mission
CREATE INDEX idx_mission_objects_mission ON mission_objects(mission_id,sequence_no);

-- index: idx_mission_outcome_attempt
CREATE INDEX idx_mission_outcome_attempt
ON mission_outcome_assessments(attempt_id,created_at DESC);

-- index: idx_mission_outcome_code
CREATE INDEX idx_mission_outcome_code
ON mission_outcome_assessments(company_id,outcome_code,created_at DESC);

-- index: idx_mission_outcome_company_mission
CREATE INDEX idx_mission_outcome_company_mission
ON mission_outcome_assessments(company_id,mission_id,created_at DESC,id DESC);

-- index: idx_mission_plan_evaluations_company_mission_status_expiry
CREATE INDEX idx_mission_plan_evaluations_company_mission_status_expiry
  ON mission_plan_evaluations(company_id,mission_id,status,expires_at DESC,id DESC);

-- index: idx_mission_plan_evaluations_company_plan_hash
CREATE INDEX idx_mission_plan_evaluations_company_plan_hash
  ON mission_plan_evaluations(company_id,plan_id,plan_hash,evaluation_hash);

-- index: idx_mission_plan_evaluations_hash
CREATE INDEX idx_mission_plan_evaluations_hash ON mission_plan_evaluations(company_id,mission_id,plan_hash,evaluation_hash);

-- index: idx_mission_plan_evaluations_plan
CREATE INDEX idx_mission_plan_evaluations_plan ON mission_plan_evaluations(company_id,mission_id,plan_id,id DESC);

-- index: idx_mission_plan_evaluations_status
CREATE INDEX idx_mission_plan_evaluations_status ON mission_plan_evaluations(company_id,mission_id,status,id DESC);

-- index: idx_mission_plans_company_mission_status_updated
CREATE INDEX idx_mission_plans_company_mission_status_updated
  ON mission_plans(company_id,mission_id,status,updated_at DESC,id DESC);

-- index: idx_mission_plans_company_plan_hash
CREATE INDEX idx_mission_plans_company_plan_hash
  ON mission_plans(company_id,plan_hash);

-- index: idx_mission_plans_context
CREATE INDEX idx_mission_plans_context ON mission_plans(company_id,mission_id,context_hash);

-- index: idx_mission_plans_mission_status
CREATE INDEX idx_mission_plans_mission_status ON mission_plans(company_id,mission_id,status,id DESC);

-- index: idx_mission_recipient_state_mission
CREATE INDEX idx_mission_recipient_state_mission
ON mission_recipient_state(mission_id,mission_owner_company_id);

-- index: idx_mission_recipient_state_owner_mission
CREATE INDEX idx_mission_recipient_state_owner_mission ON mission_recipient_state(mission_owner_company_id,mission_id);

-- index: idx_mission_recipient_state_unseen
CREATE INDEX idx_mission_recipient_state_unseen
ON mission_recipient_state(recipient_key,acknowledged_at,updated_at DESC);

-- index: idx_mission_status_history_mission_status_time
CREATE INDEX idx_mission_status_history_mission_status_time
  ON mission_status_history(mission_id,status,created_at DESC,id DESC);

-- index: idx_mission_stops_company_mission
CREATE INDEX idx_mission_stops_company_mission
  ON mission_stops(company_id,mission_id,sequence_no);

-- index: idx_mission_stops_mission
CREATE INDEX idx_mission_stops_mission ON mission_stops(mission_id,sequence_no);

-- index: idx_mission_tenant_access_company
CREATE INDEX idx_mission_tenant_access_company
ON mission_tenant_access(access_company_id, status, mission_id);

-- index: idx_mission_tenant_access_owner
CREATE INDEX idx_mission_tenant_access_owner
ON mission_tenant_access(owner_company_id, status, mission_id);

-- index: idx_mission_tenant_access_owner_mission
CREATE INDEX idx_mission_tenant_access_owner_mission ON mission_tenant_access(owner_company_id,mission_id);

-- index: idx_mission_tenant_driver_assignment_owner_mission
CREATE INDEX idx_mission_tenant_driver_assignment_owner_mission ON mission_tenant_driver_assignments(owner_company_id,mission_id);

-- index: idx_mission_transition_events_company_mission
CREATE INDEX idx_mission_transition_events_company_mission
  ON mission_transition_events(company_id,mission_id,created_at,id);

-- index: idx_mission_transition_requests_company_mission
CREATE INDEX idx_mission_transition_requests_company_mission
  ON mission_transition_requests(company_id,mission_id,status,updated_at);

-- index: idx_missions_capability
CREATE INDEX idx_missions_capability ON missions(capability_code,status,updated_at);

-- index: idx_missions_company_date
CREATE INDEX idx_missions_company_date
  ON missions(company_id,mission_date DESC,id DESC);

-- index: idx_missions_company_reference_unique
CREATE UNIQUE INDEX idx_missions_company_reference_unique
ON missions(company_id, reference);

-- index: idx_missions_company_sector_country_updated
CREATE INDEX idx_missions_company_sector_country_updated
  ON missions(company_id,sector_code,country_code,updated_at DESC,id DESC);

-- index: idx_missions_company_state_version
CREATE INDEX idx_missions_company_state_version ON missions(company_id,state_version,id);

-- index: idx_missions_company_status_updated
CREATE INDEX idx_missions_company_status_updated
  ON missions(company_id,status,updated_at DESC,id DESC);

-- index: idx_missions_customer
CREATE INDEX idx_missions_customer ON missions(company_id,customer_id,mission_date DESC);

-- index: idx_missions_deadline_utc
CREATE INDEX idx_missions_deadline_utc ON missions(deadline_at_utc);

-- index: idx_missions_lifecycle
CREATE INDEX idx_missions_lifecycle ON missions(lifecycle_definition_id,lifecycle_state_code,status);

-- index: idx_missions_sector
CREATE INDEX idx_missions_sector ON missions(country_code,sector_code,product_definition_id);

-- index: idx_network_customers_company
CREATE INDEX idx_network_customers_company
ON network_customers(company_id,status,company_name);

-- index: idx_network_executor_trust
CREATE INDEX idx_network_executor_trust
ON network_executor_trust(company_id,status,updated_at DESC);

-- index: idx_network_invitation_executor_inbox
CREATE INDEX idx_network_invitation_executor_inbox
ON network_mission_invitations(recipient_executor_id,status,created_at DESC);

-- index: idx_network_invitation_owner
CREATE INDEX idx_network_invitation_owner
ON network_mission_invitations(owner_company_id,status,created_at DESC);

-- index: idx_network_invitation_owner_mission_status_id
CREATE INDEX idx_network_invitation_owner_mission_status_id
  ON network_mission_invitations(owner_company_id,mission_id,status,id DESC);

-- index: idx_network_invitation_pending_executor
CREATE UNIQUE INDEX idx_network_invitation_pending_executor
ON network_mission_invitations(mission_id,recipient_executor_id)
WHERE recipient_type='executor' AND status='Pending';

-- index: idx_network_invitation_pending_tenant
CREATE UNIQUE INDEX idx_network_invitation_pending_tenant
ON network_mission_invitations(mission_id,recipient_company_id)
WHERE recipient_type='tenant' AND status='Pending';

-- index: idx_network_invitation_tenant_inbox
CREATE INDEX idx_network_invitation_tenant_inbox
ON network_mission_invitations(recipient_company_id,status,created_at DESC);

-- index: idx_network_one_active_invitation_per_mission
CREATE UNIQUE INDEX idx_network_one_active_invitation_per_mission
ON network_mission_invitations(owner_company_id,mission_id)
WHERE status IN ('Pending','Accepted');

-- index: idx_network_tenant_trust_a
CREATE INDEX idx_network_tenant_trust_a
ON network_tenant_trust(company_a_id,status,updated_at DESC);

-- index: idx_network_tenant_trust_b
CREATE INDEX idx_network_tenant_trust_b
ON network_tenant_trust(company_b_id,status,updated_at DESC);

-- index: idx_notification_policy_scope
CREATE INDEX idx_notification_policy_scope ON notification_policy_registry(notification_type,company_id,country_code,active,effective_at DESC);

-- index: idx_notifications_admin
CREATE INDEX idx_notifications_admin
ON notifications(recipient_role,recipient_tenant_id,id);

-- index: idx_notifications_controller
CREATE INDEX idx_notifications_controller ON notifications(controller_company_id,created_at DESC);

-- index: idx_notifications_driver
CREATE INDEX idx_notifications_driver
ON notifications(recipient_role,recipient_tenant_id,recipient_driver_id,id);

-- index: idx_notifications_executor
CREATE INDEX idx_notifications_executor
ON notifications(recipient_role,recipient_executor_id,id);

-- index: idx_notifications_governance
CREATE INDEX idx_notifications_governance ON notifications(data_classification,purpose_code,provider_code,created_at DESC);

-- index: idx_notifications_retention
CREATE INDEX idx_notifications_retention ON notifications(retention_policy_code,legal_hold_active,disposed_at,created_at);

-- index: idx_notifications_unread
CREATE INDEX idx_notifications_unread
ON notifications(read_at,recipient_role,id);

-- index: idx_open_custody_case
CREATE UNIQUE INDEX idx_open_custody_case
ON mission_custody_cases(mission_id)
WHERE status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance');

-- index: idx_operational_access_leases_expiry
CREATE INDEX idx_operational_access_leases_expiry
ON operational_access_leases(expires_at);

-- index: idx_org_capability_code
CREATE INDEX idx_org_capability_code ON organization_capability_eligibility(capability_code,status,active);

-- index: idx_org_capability_company
CREATE INDEX idx_org_capability_company ON organization_capability_eligibility(company_id,status,active);

-- index: idx_org_invites_company_status
CREATE INDEX idx_org_invites_company_status ON organization_invitations(company_id,status,created_at DESC);

-- index: idx_org_invites_email
CREATE INDEX idx_org_invites_email ON organization_invitations(email,status);

-- index: idx_org_invites_expiry
CREATE INDEX idx_org_invites_expiry ON organization_invitations(expires_at,status);

-- index: idx_org_lifecycle_company_status
CREATE INDEX idx_org_lifecycle_company_status ON organization_lifecycle_transitions(company_id,to_status,created_at DESC);

-- index: idx_org_lifecycle_company_time
CREATE INDEX idx_org_lifecycle_company_time ON organization_lifecycle_transitions(company_id,created_at DESC,id DESC);

-- index: idx_org_onboarding_country
CREATE INDEX idx_org_onboarding_country ON organization_onboarding_records(country_code,jurisdiction_code);

-- index: idx_org_onboarding_status
CREATE INDEX idx_org_onboarding_status ON organization_onboarding_records(provisioning_status,updated_at);

-- index: idx_org_provision_events_company
CREATE INDEX idx_org_provision_events_company ON organization_provisioning_events(company_id,created_at DESC,id DESC);

-- index: idx_password_reset_expiry
CREATE INDEX idx_password_reset_expiry
ON password_reset_tokens(expires_at, used_at);

-- index: idx_password_reset_identity
CREATE INDEX idx_password_reset_identity
ON password_reset_tokens(identity_type, identity_id, created_at DESC);

-- index: idx_plan_product_configuration_status
CREATE INDEX idx_plan_product_configuration_status ON plan_product_configuration(status,plan_id);

-- index: idx_platform_admin_operations_active_scope
CREATE UNIQUE INDEX idx_platform_admin_operations_active_scope
ON platform_admin_operations(scope_key)
WHERE status IN ('preparing','executing','verifying');

-- index: idx_platform_admin_operations_idempotency
CREATE UNIQUE INDEX idx_platform_admin_operations_idempotency
ON platform_admin_operations(action_code,scope_key,idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- index: idx_platform_admin_operations_request
CREATE INDEX idx_platform_admin_operations_request
ON platform_admin_operations(request_id,created_at DESC,id DESC);

-- index: idx_platform_admin_operations_resource
CREATE INDEX idx_platform_admin_operations_resource
ON platform_admin_operations(resource_type,resource_id,created_at DESC,id DESC);

-- index: idx_platform_admin_operations_status
CREATE INDEX idx_platform_admin_operations_status
ON platform_admin_operations(status,updated_at DESC,id DESC);

-- index: idx_platform_admin_security_events_time
CREATE INDEX idx_platform_admin_security_events_time ON platform_admin_security_events(created_at DESC,id DESC);

-- index: idx_platform_architecture_governance_status
CREATE INDEX idx_platform_architecture_governance_status
  ON platform_architecture_governance(status);

-- index: idx_platform_bulk_ops_status
CREATE INDEX idx_platform_bulk_ops_status ON platform_admin_bulk_operations(status,updated_at DESC,id DESC);

-- index: idx_platform_certification_evidence_run
CREATE INDEX idx_platform_certification_evidence_run
  ON platform_certification_evidence(run_key,evidence_type,status);

-- index: idx_platform_config_change_stage
CREATE INDEX idx_platform_config_change_stage ON platform_configuration_change_requests(stage,updated_at DESC);

-- index: idx_platform_config_change_version
CREATE INDEX idx_platform_config_change_version ON platform_configuration_change_requests(configuration_version_id,created_at DESC);

-- index: idx_platform_config_effective
CREATE INDEX idx_platform_config_effective ON platform_configuration_versions(effective_at,status,active);

-- index: idx_platform_config_lookup
CREATE INDEX idx_platform_config_lookup ON platform_configuration_versions(domain_code,config_key,status,active);

-- index: idx_platform_data_actions_resource
CREATE INDEX idx_platform_data_actions_resource ON platform_admin_data_actions(resource_type,resource_id,created_at DESC);

-- index: idx_platform_data_actions_status
CREATE INDEX idx_platform_data_actions_status ON platform_admin_data_actions(status,action,created_at DESC);

-- index: idx_platform_data_entry_canonical
CREATE INDEX idx_platform_data_entry_canonical ON platform_data_entry_records(canonical_resource_type,canonical_resource_id,status);

-- index: idx_platform_data_entry_commit_recovery
CREATE INDEX idx_platform_data_entry_commit_recovery ON platform_data_entry_records(status,commit_started_at,commit_recovery_status);

-- index: idx_platform_data_entry_scope
CREATE INDEX idx_platform_data_entry_scope ON platform_data_entry_records(country_scope,tenant_scope,created_at DESC);

-- index: idx_platform_data_entry_status
CREATE INDEX idx_platform_data_entry_status ON platform_data_entry_records(status,created_at DESC,id DESC);

-- index: idx_platform_data_entry_type
CREATE INDEX idx_platform_data_entry_type ON platform_data_entry_records(entry_type,created_at DESC,id DESC);

-- index: idx_platform_entry_cert_classification
CREATE INDEX idx_platform_entry_cert_classification ON platform_data_entry_certifications(classification,updated_at DESC,id DESC);

-- index: idx_platform_entry_cert_resource
CREATE INDEX idx_platform_entry_cert_resource ON platform_data_entry_certifications(resource_type,resource_id);

-- index: idx_platform_infrastructure_roadmap_status
CREATE INDEX idx_platform_infrastructure_roadmap_status ON platform_infrastructure_roadmap(status, priority, task_key);

-- index: idx_platform_mutation_leases_expiry
CREATE INDEX idx_platform_mutation_leases_expiry
  ON platform_mutation_leases(expires_at);

-- index: idx_platform_product_verification_idempotency
CREATE UNIQUE INDEX idx_platform_product_verification_idempotency
ON platform_product_verification_runs(country_code,sector_code,COALESCE(company_id,0),idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- index: idx_platform_product_verification_launch
CREATE INDEX idx_platform_product_verification_launch
ON platform_product_verification_runs(launch_id,launch_version,created_at DESC,id DESC);

-- index: idx_platform_product_verification_scope
CREATE INDEX idx_platform_product_verification_scope
ON platform_product_verification_runs(country_code,sector_code,company_id,created_at DESC,id DESC);

-- index: idx_platform_product_verification_status
CREATE INDEX idx_platform_product_verification_status
ON platform_product_verification_runs(status,updated_at DESC,id DESC);

-- index: idx_platform_product_verification_steps_run
CREATE INDEX idx_platform_product_verification_steps_run
ON platform_product_verification_steps(run_id,sequence);

-- index: idx_platform_product_verification_steps_status
CREATE INDEX idx_platform_product_verification_steps_status
ON platform_product_verification_steps(status,created_at DESC,id DESC);

-- index: idx_platform_region_placements_market
CREATE INDEX idx_platform_region_placements_market ON platform_region_placements(market_code, jurisdiction_code);

-- index: idx_platform_region_placements_status
CREATE INDEX idx_platform_region_placements_status ON platform_region_placements(status, updated_at DESC);

-- index: idx_platform_responsibilities_role
CREATE INDEX idx_platform_responsibilities_role ON platform_reusable_responsibilities(role_code,active);

-- index: idx_platform_reusable_pages_country
CREATE INDEX idx_platform_reusable_pages_country ON platform_reusable_pages(country_code,status);

-- index: idx_platform_reusable_pages_language
CREATE INDEX idx_platform_reusable_pages_language ON platform_reusable_pages(language_code,status);

-- index: idx_platform_storage_provider
CREATE INDEX idx_platform_storage_provider ON platform_storage_registry(provider_code,active);

-- index: idx_platform_trash_evidence
CREATE INDEX idx_platform_trash_evidence ON platform_trash_items(evidence_status,updated_at DESC,id DESC);

-- index: idx_platform_trash_resource
CREATE INDEX idx_platform_trash_resource ON platform_trash_items(resource_type,resource_id,purged_at,id DESC);

-- index: idx_platform_trash_state
CREATE INDEX idx_platform_trash_state ON platform_trash_items(resource_type,legal_hold,purged_at,trashed_at DESC,id DESC);

-- index: idx_platform_user_memberships
CREATE INDEX idx_platform_user_memberships ON platform_user_memberships(membership_type,membership_id,status);

-- index: idx_platform_user_restrictions
CREATE INDEX idx_platform_user_restrictions ON platform_user_restrictions(platform_user_id,active);

-- index: idx_platform_user_roles_scope
CREATE INDEX idx_platform_user_roles_scope ON platform_user_roles(role_code,scope_type,scope_id,active);

-- index: idx_platform_users_principal
CREATE INDEX idx_platform_users_principal ON platform_users(principal_type,principal_id,account_state);

-- index: idx_privacy_holds_company
CREATE INDEX idx_privacy_holds_company ON privacy_legal_holds(company_id,active);

-- index: idx_privacy_holds_scope
CREATE INDEX idx_privacy_holds_scope ON privacy_legal_holds(scope_type,scope_id,active);

-- index: idx_privacy_request_events_request
CREATE INDEX idx_privacy_request_events_request ON privacy_request_events(privacy_request_id,created_at DESC);

-- index: idx_privacy_requests_assigned
CREATE INDEX idx_privacy_requests_assigned ON privacy_requests(assigned_role,status,requested_at DESC);

-- index: idx_privacy_requests_company
CREATE INDEX idx_privacy_requests_company ON privacy_requests(company_id,status);

-- index: idx_privacy_requests_subject
CREATE INDEX idx_privacy_requests_subject ON privacy_requests(identity_type,identity_id,status);

-- index: idx_privacy_requests_workflow
CREATE INDEX idx_privacy_requests_workflow ON privacy_requests(status,request_type,requested_at DESC);

-- index: idx_product_country_catalog_active_name
CREATE INDEX idx_product_country_catalog_active_name
  ON platform_product_country_catalog(active,name);

-- index: idx_product_country_catalog_active_updated
CREATE INDEX idx_product_country_catalog_active_updated
  ON platform_product_country_catalog(active,updated_at DESC,created_at DESC);

-- index: idx_product_definition_components
CREATE INDEX idx_product_definition_components
ON platform_product_definition_components(definition_id,component_type,status,component_key);

-- index: idx_product_definition_launch
CREATE INDEX idx_product_definition_launch
ON platform_product_definitions(launch_id,status,id DESC);

-- index: idx_product_definition_lookup
CREATE INDEX idx_product_definition_lookup
ON platform_product_definitions(country_code,sector_code,status,updated_at DESC,id DESC);

-- index: idx_product_definition_manifests
CREATE INDEX idx_product_definition_manifests
ON platform_product_definition_manifests(definition_id,definition_version DESC,id DESC);

-- index: idx_product_dependency_edges_from
CREATE INDEX idx_product_dependency_edges_from ON platform_product_dependency_edges(launch_id,from_node_id,relation);

-- index: idx_product_dependency_edges_to
CREATE INDEX idx_product_dependency_edges_to ON platform_product_dependency_edges(launch_id,to_node_id,relation);

-- index: idx_product_dependency_nodes_launch
CREATE INDEX idx_product_dependency_nodes_launch ON platform_product_dependency_nodes(launch_id,node_type,status);

-- index: idx_product_expansion_deltas
CREATE INDEX idx_product_expansion_deltas ON platform_product_expansion_deltas(expansion_id,change_type,status,component_type,component_key);

-- index: idx_product_expansion_lineage_child
CREATE INDEX idx_product_expansion_lineage_child ON platform_product_expansion_lineage(child_definition_id,relation,parent_definition_id);

-- index: idx_product_expansion_lineage_parent
CREATE INDEX idx_product_expansion_lineage_parent ON platform_product_expansion_lineage(parent_definition_id,relation,child_definition_id);

-- index: idx_product_expansion_scope
CREATE INDEX idx_product_expansion_scope ON platform_product_expansion_cases(target_country_code,target_sector_code,status,updated_at DESC,id DESC);

-- index: idx_product_expansion_source
CREATE INDEX idx_product_expansion_source ON platform_product_expansion_cases(source_definition_id,source_launch_id,status,id DESC);

-- index: idx_product_expansion_tasks
CREATE INDEX idx_product_expansion_tasks ON platform_product_expansion_tasks(expansion_id,status,required,id);

-- index: idx_product_identity_revisions_created
CREATE INDEX idx_product_identity_revisions_created ON platform_product_identity_revisions(created_at DESC);

-- index: idx_product_identity_revisions_scope
CREATE INDEX idx_product_identity_revisions_scope ON platform_product_identity_revisions(scope,scope_key,status,revision_id DESC);

-- index: idx_product_prep_research_launch
CREATE INDEX idx_product_prep_research_launch ON platform_product_preparation_research(launch_id,status,updated_at DESC);

-- index: idx_product_prep_tasks_dependency
CREATE INDEX idx_product_prep_tasks_dependency ON platform_product_preparation_tasks(dependency_task_id,status);

-- index: idx_product_prep_tasks_launch
CREATE INDEX idx_product_prep_tasks_launch ON platform_product_preparation_tasks(launch_id,status,required,category,id);

-- index: idx_product_release_contract_hash
CREATE INDEX idx_product_release_contract_hash ON platform_product_release_lifecycles(contract_hash);

-- index: idx_product_release_lifecycle_previous
CREATE INDEX idx_product_release_lifecycle_previous ON platform_product_release_lifecycles(previous_launch_id);

-- index: idx_product_release_lifecycle_state
CREATE INDEX idx_product_release_lifecycle_state ON platform_product_release_lifecycles(state,updated_at DESC);

-- index: idx_product_release_operations_launch
CREATE INDEX idx_product_release_operations_launch ON platform_product_release_operations(launch_id,updated_at DESC);

-- index: idx_product_release_operations_status
CREATE INDEX idx_product_release_operations_status ON platform_product_release_operations(status,updated_at DESC);

-- index: idx_product_sector_lifecycle_lookup
CREATE INDEX idx_product_sector_lifecycle_lookup
ON platform_product_sector_lifecycles(launch_id,sector_code,status,active);

-- index: idx_product_test_scenario_contract_hash
CREATE INDEX idx_product_test_scenario_contract_hash ON platform_product_test_scenarios(contract_hash);

-- index: idx_product_test_scenario_launch
CREATE UNIQUE INDEX idx_product_test_scenario_launch ON platform_product_test_scenarios(launch_id);

-- index: idx_product_test_scenario_status
CREATE INDEX idx_product_test_scenario_status ON platform_product_test_scenarios(status,updated_at DESC,id DESC);

-- index: idx_product_test_scenario_steps_scenario
CREATE INDEX idx_product_test_scenario_steps_scenario ON platform_product_test_scenario_steps(scenario_id,sequence);

-- index: idx_product_test_scenario_steps_status
CREATE INDEX idx_product_test_scenario_steps_status ON platform_product_test_scenario_steps(status,updated_at DESC,id DESC);

-- index: idx_product_test_scenario_target
CREATE INDEX idx_product_test_scenario_target ON platform_product_test_scenarios(company_id,mission_id);

-- index: idx_public_requests_company_mission_status_type_updated
CREATE INDEX idx_public_requests_company_mission_status_type_updated
  ON public_mission_requests(company_id,mission_id,status,requester_type,COALESCE(updated_at,created_at) DESC,id DESC);

-- index: idx_public_requests_company_mission_status_updated
CREATE INDEX idx_public_requests_company_mission_status_updated
  ON public_mission_requests(company_id,mission_id,status,updated_at DESC,id DESC);

-- index: idx_public_requests_custody_driver
CREATE INDEX idx_public_requests_custody_driver
ON public_mission_requests(company_id,mission_id,custody_driver_id,status);

-- index: idx_public_requests_executor
CREATE INDEX idx_public_requests_executor
ON public_mission_requests(executor_id, created_at DESC);

-- index: idx_public_requests_one_pending_per_mission
CREATE UNIQUE INDEX idx_public_requests_one_pending_per_mission
ON public_mission_requests(mission_id)
WHERE status='Pending';

-- index: idx_public_requests_requester_company
CREATE INDEX idx_public_requests_requester_company
ON public_mission_requests(requester_company_id, mission_id, status);

-- index: idx_public_requests_updated_at
CREATE INDEX idx_public_requests_updated_at ON public_mission_requests(updated_at DESC);

-- index: idx_reference_scenarios_lifecycle
CREATE INDEX idx_reference_scenarios_lifecycle
ON platform_mission_reference_scenarios(lifecycle_definition_id,status,version DESC);

-- index: idx_reference_scenarios_scope
CREATE INDEX idx_reference_scenarios_scope
ON platform_mission_reference_scenarios(country_code,sector_code,status,version DESC);

-- index: idx_request_idempotency_expiry
CREATE INDEX idx_request_idempotency_expiry
ON request_idempotency(expires_at);

-- index: idx_request_idempotency_resource_reference
CREATE INDEX idx_request_idempotency_resource_reference
ON request_idempotency(scope_key,action_key,resource_reference);

-- index: idx_request_idempotency_unique
CREATE UNIQUE INDEX idx_request_idempotency_unique
ON request_idempotency(scope_key,action_key,idempotency_key);

-- index: idx_security_rate_limits_expiry
CREATE INDEX idx_security_rate_limits_expiry
ON security_rate_limits(window_expires_at);

-- index: idx_shared_driver_assignment_driver
CREATE INDEX idx_shared_driver_assignment_driver
ON mission_tenant_driver_assignments(access_company_id, driver_id, mission_id);

-- index: idx_subscription_entitlements_capability
CREATE INDEX idx_subscription_entitlements_capability ON subscription_entitlements(capability_code,status,active);

-- index: idx_subscription_entitlements_company
CREATE INDEX idx_subscription_entitlements_company ON subscription_entitlements(company_id,active);

-- index: idx_subscription_gift_active
CREATE INDEX idx_subscription_gift_active ON subscription_gift_codes(active,expires_at);

-- index: idx_subscription_grant_company
CREATE INDEX idx_subscription_grant_company ON subscription_access_grants(company_id,active,ends_at);

-- index: idx_subscription_policies_executor_current
CREATE INDEX idx_subscription_policies_executor_current
  ON subscription_policies(subject_type,active,billing_mode,subscription_class,country_code);

-- index: idx_subscription_policies_lookup
CREATE INDEX idx_subscription_policies_lookup ON subscription_policies(subject_type,country_code,active);

-- index: idx_subscription_transitions_subscription
CREATE INDEX idx_subscription_transitions_subscription ON subscription_state_transitions(subscription_id,version);

-- index: idx_subscription_usage_company
CREATE INDEX idx_subscription_usage_company ON subscription_usage_periods(company_id,subject_type,period_start);

-- index: idx_subscription_usage_executor
CREATE INDEX idx_subscription_usage_executor ON subscription_usage_periods(executor_id,subject_type,period_start);

-- index: idx_subscriptions_company
CREATE INDEX idx_subscriptions_company ON subscriptions(company_id);

-- index: idx_subscriptions_stripe_customer
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- index: idx_subscriptions_stripe_subscription
CREATE INDEX idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);

-- index: idx_support_company_created
CREATE INDEX idx_support_company_created
ON support_requests(company_id, created_at DESC);

-- index: idx_support_status
CREATE INDEX idx_support_status
ON support_requests(status, created_at DESC);

-- index: idx_telemetry_expires
CREATE INDEX idx_telemetry_expires ON action_execution_telemetry(expires_at);

-- index: idx_tenant_access_owner_mission_status
CREATE INDEX idx_tenant_access_owner_mission_status
  ON mission_tenant_access(owner_company_id,mission_id,status,updated_at DESC,id DESC);

-- index: idx_tenant_driver_assignment_mission_owner_access
CREATE INDEX idx_tenant_driver_assignment_mission_owner_access
  ON mission_tenant_driver_assignments(mission_id,owner_company_id,access_company_id,driver_id);

-- index: idx_tenant_executor_company
CREATE INDEX idx_tenant_executor_company
ON tenant_executor_links(company_id, status, created_at DESC);

-- index: idx_tenant_executor_executor
CREATE INDEX idx_tenant_executor_executor
ON tenant_executor_links(executor_id, status, created_at DESC);

-- index: idx_transition_events_mission
CREATE INDEX idx_transition_events_mission
ON mission_transition_events(company_id,mission_id,created_at DESC,id DESC);

-- index: idx_transition_requests_company_mission_status
CREATE INDEX idx_transition_requests_company_mission_status
  ON mission_transition_requests(company_id,mission_id,status,updated_at DESC,id DESC);

-- index: idx_transition_requests_mission
CREATE INDEX idx_transition_requests_mission
ON mission_transition_requests(company_id,mission_id,created_at DESC);

-- index: idx_transition_requests_reconciliation
CREATE INDEX idx_transition_requests_reconciliation
ON mission_transition_requests(company_id,mission_id,status,mutation_phase,updated_at ASC,id ASC);

-- index: idx_transition_requests_uncertain
CREATE INDEX idx_transition_requests_uncertain
ON mission_transition_requests(company_id,mission_id,status,mutation_phase,updated_at ASC,id ASC);

-- index: idx_trust_key_events_key
CREATE INDEX idx_trust_key_events_key
ON trust_key_events(trust_key_id, created_at DESC);

-- index: idx_trust_keys_profile_status
CREATE INDEX idx_trust_keys_profile_status
ON trust_keys(profile_id, status, issued_at DESC);

-- index: idx_user_readiness_events_user
CREATE INDEX idx_user_readiness_events_user ON user_readiness_events(platform_user_id,created_at DESC);

-- index: idx_verification_checks_profile
CREATE INDEX idx_verification_checks_profile ON verification_checks(profile_id,check_type,status);

-- index: idx_verification_email_codes_profile
CREATE INDEX idx_verification_email_codes_profile
ON verification_email_codes(profile_id, expires_at, used_at);

-- index: idx_verification_profiles_company_target
CREATE INDEX idx_verification_profiles_company_target
ON verification_profiles(identity_type,company_id,review_status);

-- index: idx_verification_profiles_identity
CREATE INDEX idx_verification_profiles_identity
ON verification_profiles(identity_type,identity_id);

-- index: idx_verification_profiles_jurisdiction_review
CREATE INDEX idx_verification_profiles_jurisdiction_review
ON verification_profiles(identity_type,identity_id,review_status,verified_country_code);

-- index: uq_capability_data_entry
CREATE UNIQUE INDEX uq_capability_data_entry ON canonical_capability_registry(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_market_package_product_country
CREATE UNIQUE INDEX uq_market_package_product_country
  ON platform_market_packages(product_key,country_code);

-- index: uq_market_package_source_hash
CREATE UNIQUE INDEX uq_market_package_source_hash
  ON platform_market_package_versions(package_id,source_hash);

-- index: uq_plan_data_entry
CREATE UNIQUE INDEX uq_plan_data_entry ON plans(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_platform_admin_operation_lease_token
CREATE UNIQUE INDEX uq_platform_admin_operation_lease_token
ON platform_admin_operations(lease_token) WHERE lease_token IS NOT NULL;

-- index: uq_platform_configuration_active
CREATE UNIQUE INDEX uq_platform_configuration_active
ON platform_configuration_versions(domain_code,config_key) WHERE active=1;

-- index: uq_product_component_data_entry
CREATE UNIQUE INDEX uq_product_component_data_entry ON platform_product_definition_components(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_product_country_data_entry
CREATE UNIQUE INDEX uq_product_country_data_entry ON platform_product_country_catalog(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_product_sector_lifecycle_active
CREATE UNIQUE INDEX uq_product_sector_lifecycle_active
ON platform_product_sector_lifecycles(launch_id,sector_code) WHERE active=1;

-- index: uq_provider_data_entry
CREATE UNIQUE INDEX uq_provider_data_entry ON external_provider_registry(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_classification_data_entry
CREATE UNIQUE INDEX uq_reusable_classification_data_entry ON platform_reusable_classifications(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_currency_data_entry
CREATE UNIQUE INDEX uq_reusable_currency_data_entry ON platform_reusable_currencies(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_eligibility_data_entry
CREATE UNIQUE INDEX uq_reusable_eligibility_data_entry ON platform_reusable_eligibility(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_feature_data_entry
CREATE UNIQUE INDEX uq_reusable_feature_data_entry ON platform_reusable_features(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_guidance_data_entry
CREATE UNIQUE INDEX uq_reusable_guidance_data_entry ON platform_reusable_guidance(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_language_data_entry
CREATE UNIQUE INDEX uq_reusable_language_data_entry ON platform_reusable_languages(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_page_data_entry
CREATE UNIQUE INDEX uq_reusable_page_data_entry ON platform_reusable_pages(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_policy_data_entry
CREATE UNIQUE INDEX uq_reusable_policy_data_entry ON platform_reusable_policies(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_pricing_data_entry
CREATE UNIQUE INDEX uq_reusable_pricing_data_entry ON platform_reusable_pricing(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_region_data_entry
CREATE UNIQUE INDEX uq_reusable_region_data_entry ON platform_reusable_regions(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_responsibility_data_entry
CREATE UNIQUE INDEX uq_reusable_responsibility_data_entry ON platform_reusable_responsibilities(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_reusable_sector_data_entry
CREATE UNIQUE INDEX uq_reusable_sector_data_entry ON platform_reusable_sectors(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_role_data_entry
CREATE UNIQUE INDEX uq_role_data_entry ON organization_role_catalog(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: uq_storage_data_entry
CREATE UNIQUE INDEX uq_storage_data_entry ON platform_storage_registry(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: ux_configuration_version_data_entry
CREATE UNIQUE INDEX ux_configuration_version_data_entry ON platform_configuration_versions(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: ux_expansion_case_data_entry
CREATE UNIQUE INDEX ux_expansion_case_data_entry ON platform_product_expansion_cases(data_entry_id) WHERE data_entry_id IS NOT NULL;

-- index: ux_product_definition_data_entry
CREATE UNIQUE INDEX ux_product_definition_data_entry ON platform_product_definitions(data_entry_id) WHERE data_entry_id IS NOT NULL;
