-- V7.5.9: independent executor operational situation for contextual Mission TV.
CREATE TABLE IF NOT EXISTS executor_operational_profiles (
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
CREATE INDEX IF NOT EXISTS idx_executor_operational_situation
ON executor_operational_profiles(situation,updated_at DESC);
