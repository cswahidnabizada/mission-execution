-- ON Mission 10.31.84 — Core Operational Capability Reconciliation
-- A fully verified tenant on a valid standard plan must be able to create missions.
-- Advanced distribution capabilities remain plan-controlled. Usage limits remain
-- enforced by the secured capacity gate.
UPDATE subscription_policies
SET can_create_missions=1,
    can_create_drivers=1,
    updated_at=CURRENT_TIMESTAMP
WHERE subject_type='tenant_admin'
  AND plan_code IN ('starter','business')
  AND billing_mode='paid'
  AND active=1;

UPDATE subscription_policies
SET can_create_missions=1,
    can_create_drivers=1,
    updated_at=CURRENT_TIMESTAMP
WHERE subject_type='tenant_admin'
  AND plan_code='free'
  AND billing_mode='free'
  AND active=1;
