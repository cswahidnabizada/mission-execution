-- ON Mission 11.06.0 — Agentic Memory / Outcome Profiles
-- Derived memory only. These projections never become mission, assignment,
-- authorization, lifecycle or evidence authorities.

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

CREATE INDEX idx_agent_executor_profile_company ON agent_executor_outcome_profiles(company_id,updated_at DESC);
CREATE INDEX idx_agent_executor_profile_executor ON agent_executor_outcome_profiles(executor_id,updated_at DESC);

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

CREATE INDEX idx_agent_organization_profile_updated ON agent_organization_outcome_profiles(updated_at DESC);

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

CREATE INDEX idx_agent_action_profile_company ON agent_action_outcome_profiles(company_id,updated_at DESC);
CREATE INDEX idx_agent_action_profile_action ON agent_action_outcome_profiles(action_code,updated_at DESC);
