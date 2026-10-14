-- ON Mission 11.16.0 — Controlled Autonomy Governance
-- Action-specific autonomy is an execution safety ceiling, never a source of mission truth.

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

CREATE INDEX idx_agent_autonomy_policy_action_scope ON agent_action_autonomy_policies(action_code,scope_type,scope_key,active);
CREATE INDEX idx_agent_autonomy_policy_active ON agent_action_autonomy_policies(active,updated_at DESC);

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

CREATE INDEX idx_agent_company_autonomy_mode ON agent_company_autonomy_config(mode,execution_enabled,updated_at DESC);

ALTER TABLE agent_decision_events ADD COLUMN policy_hash TEXT;
ALTER TABLE agent_decision_events ADD COLUMN policy_scope TEXT;
ALTER TABLE agent_decision_events ADD COLUMN policy_snapshot_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX idx_agent_decision_policy ON agent_decision_events(policy_version,policy_hash);

ALTER TABLE agent_execution_attempts ADD COLUMN policy_version TEXT;
ALTER TABLE agent_execution_attempts ADD COLUMN policy_hash TEXT;
ALTER TABLE agent_execution_attempts ADD COLUMN policy_scope TEXT;
ALTER TABLE agent_execution_attempts ADD COLUMN policy_snapshot_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX idx_agent_exec_policy ON agent_execution_attempts(policy_version,policy_hash);

CREATE TRIGGER agent_action_autonomy_policies_no_delete
BEFORE DELETE ON agent_action_autonomy_policies
BEGIN
  SELECT RAISE(ABORT, 'AGENT_AUTONOMY_POLICY_DELETE_FORBIDDEN');
END;

CREATE TRIGGER agent_company_autonomy_config_no_delete
BEFORE DELETE ON agent_company_autonomy_config
BEGIN
  SELECT RAISE(ABORT, 'AGENT_COMPANY_AUTONOMY_DELETE_FORBIDDEN');
END;
