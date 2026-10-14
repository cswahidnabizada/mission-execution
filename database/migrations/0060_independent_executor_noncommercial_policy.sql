-- ON Mission 10.31.91
-- Independent executors are currently non-commercial. Normalize all existing active
-- executor policies so an accidental legacy billing/capacity field cannot create a
-- subscription gate. A future paid executor product must explicitly introduce a
-- paid + eligible policy row after this migration.
UPDATE subscription_policies
SET billing_mode='free',
    subscription_class='exempt',
    max_drivers=NULL,
    active=1,
    updated_at=CURRENT_TIMESTAMP
WHERE subject_type='independent_executor' AND active=1;

CREATE INDEX IF NOT EXISTS idx_subscription_policies_executor_current
  ON subscription_policies(subject_type,active,billing_mode,subscription_class,country_code);
