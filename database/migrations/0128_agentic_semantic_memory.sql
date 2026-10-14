-- ON Mission 11.08.0 — Agentic Semantic Memory
-- Derived semantic projection only. Canonical truth remains authoritative.
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
CREATE INDEX idx_agent_semantic_memory_company_status ON agent_semantic_memory_documents(company_id,status,updated_at DESC);
CREATE INDEX idx_agent_semantic_memory_mission ON agent_semantic_memory_documents(company_id,mission_id,sequence DESC);
CREATE INDEX idx_agent_semantic_memory_vector ON agent_semantic_memory_documents(company_id,vector_id);
CREATE INDEX idx_agent_semantic_memory_hash ON agent_semantic_memory_documents(company_id,content_hash);
