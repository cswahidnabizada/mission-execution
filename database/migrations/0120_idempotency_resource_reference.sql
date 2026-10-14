-- 10.71.3 — deterministic idempotency recovery reference.
-- A canonical mutation may succeed immediately before the idempotency finalization
-- write. Persisting the canonical resource reference lets a retry reconcile the
-- original mutation instead of releasing the claim and creating a duplicate.
ALTER TABLE request_idempotency ADD COLUMN resource_reference TEXT;
CREATE INDEX IF NOT EXISTS idx_request_idempotency_resource_reference
ON request_idempotency(scope_key,action_key,resource_reference);
