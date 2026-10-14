-- ON Mission 16.6.0 — unified market launch workbench and durable publication operation evidence.
-- These records coordinate work; canonical product/market/mission authorities remain unchanged.
CREATE TABLE IF NOT EXISTS platform_market_launch_task_evidence (
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
CREATE INDEX IF NOT EXISTS idx_market_launch_task_status ON platform_market_launch_task_evidence(package_version_id,status,updated_at DESC);
CREATE TABLE IF NOT EXISTS platform_market_publication_operations (
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
CREATE INDEX IF NOT EXISTS idx_market_publication_operations_status ON platform_market_publication_operations(status,updated_at DESC);
