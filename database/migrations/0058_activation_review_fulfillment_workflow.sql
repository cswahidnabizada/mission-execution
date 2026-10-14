-- ON Mission 10.31.89 — Activation Review Fulfillment Workflow
-- User completion is distinct from reviewer completion.
-- The user can satisfy a requested update without closing the review;
-- the reviewer remains the authority that completes the review and issues a new Trust Key.
ALTER TABLE activation_review_requests ADD COLUMN user_completed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_activation_review_fulfillment
ON activation_review_requests(identity_type,identity_id,status,user_completed_at,created_at DESC);
