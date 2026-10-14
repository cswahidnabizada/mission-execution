-- V7.5 security foundation.
-- Adds strongly-authoritative session generations in D1. KV remains the fast
-- session store, while D1 can immediately invalidate stale KV sessions after
-- password resets, credential rotation, or account disable operations.

ALTER TABLE auth_identities ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public_executor_identities ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_auth_identity_session_authority
ON auth_identities(id, active, session_version);

CREATE INDEX IF NOT EXISTS idx_executor_session_authority
ON public_executor_identities(id, active, session_version);
