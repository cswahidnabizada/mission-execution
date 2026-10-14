-- V7: layered verification + ON Mission Trust Keys.
-- Run once before deploying V7.

CREATE TABLE IF NOT EXISTS verification_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_type TEXT NOT NULL CHECK(identity_type IN ('tenant','executor')),
  identity_id INTEGER NOT NULL,
  email_snapshot TEXT,
  phone_snapshot TEXT,
  company_name_snapshot TEXT,
  review_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(review_status IN ('draft','pending','approved','rejected')),
  trust_level INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewer_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(identity_type, identity_id)
);

CREATE TABLE IF NOT EXISTS verification_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  check_type TEXT NOT NULL
    CHECK(check_type IN ('email','phone','company','balm','identity')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','verified','rejected','not_required')),
  method TEXT,
  verified_at TEXT,
  reviewer_note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_id) REFERENCES verification_profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id, check_type)
);

CREATE TABLE IF NOT EXISTS verification_email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_id) REFERENCES verification_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_verification_email_codes_profile
ON verification_email_codes(profile_id, expires_at, used_at);

CREATE TABLE IF NOT EXISTS trust_keys (
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

CREATE INDEX IF NOT EXISTS idx_trust_keys_profile_status
ON trust_keys(profile_id, status, issued_at DESC);

CREATE TABLE IF NOT EXISTS trust_key_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trust_key_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(trust_key_id) REFERENCES trust_keys(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trust_key_events_key
ON trust_key_events(trust_key_id, created_at DESC);
