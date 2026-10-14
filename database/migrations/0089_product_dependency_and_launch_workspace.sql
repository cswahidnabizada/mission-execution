-- ON Mission 10.38.16 — Product Dependency Graph + Product Launch Workspace
-- This is orchestration metadata. It does not replace Canonical Truth, authorization,
-- lifecycle, subscription, billing, compliance, or mission authorities.

CREATE TABLE IF NOT EXISTS platform_product_preparation_research (
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
CREATE INDEX IF NOT EXISTS idx_product_prep_research_launch ON platform_product_preparation_research(launch_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_product_preparation_tasks (
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
CREATE INDEX IF NOT EXISTS idx_product_prep_tasks_launch ON platform_product_preparation_tasks(launch_id,status,required,category,id);
CREATE INDEX IF NOT EXISTS idx_product_prep_tasks_dependency ON platform_product_preparation_tasks(dependency_task_id,status);

CREATE TABLE IF NOT EXISTS platform_product_dependency_nodes (
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
CREATE INDEX IF NOT EXISTS idx_product_dependency_nodes_launch ON platform_product_dependency_nodes(launch_id,node_type,status);

CREATE TABLE IF NOT EXISTS platform_product_dependency_edges (
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
CREATE INDEX IF NOT EXISTS idx_product_dependency_edges_from ON platform_product_dependency_edges(launch_id,from_node_id,relation);
CREATE INDEX IF NOT EXISTS idx_product_dependency_edges_to ON platform_product_dependency_edges(launch_id,to_node_id,relation);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_product_preparation_research','findings','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_preparation_research','sources_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_preparation_tasks','evidence_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_preparation_tasks','completion_note','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_dependency_nodes','metadata_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_dependency_edges','impact_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_dependency_edges','rollback_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
