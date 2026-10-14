import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const activation=read("public/assets/js/core/activation-module.js");
const activationService=read("src/worker/security/activation.service.js");
const gate=read("src/worker/security/operational-gate.service.js");
const situation=read("src/worker/security/user-situation.service.js");
const policy=read("src/worker/security/subscription-policy.service.js");
const migration=read("database/migrations/0060_independent_executor_noncommercial_policy.sql");
const foryou=read("src/worker/extensions/actions-intelligence/feature-state/foryou.provider.js");
const workspace=read("public/assets/ui/canonical-mission-workspace.js");
const subscription=read("public/assets/js/pages/subscription.js");

// 1. Activation center must never reference an out-of-scope billingRequired variable.
const billingDefs=[...activation.matchAll(/const billingRequired=/g)];
assert.equal(billingDefs.length,1,"activation must keep one canonical billingRequired definition per render scope");
assert.match(activation,/billing\.subscriptionRequired===true && billing\.subscriptionClass!=="exempt"/);
assert.match(activationService,/subscriptionRequired:situation\?\.subscriptionRequired===true/);

// 2. Billing capacity is an eligible-subscription signal only.
assert.match(gate,/const billingEligible=b\.subscriptionRequired===true && b\.subscriptionClass!=="exempt"/);
assert.match(gate,/if\(billingEligible && !activation\.next && missionLeft/);
assert.match(gate,/if\(billingEligible && !activation\.next && driverLeft/);

// 3. Canonical capacity read model exposes used/limit/remaining for every consumer.
assert.match(situation,/capacity=Object\.freeze/);
assert.match(situation,/remaining:/);
assert.match(situation,/activeDrivers:Object\.freeze/);

// 4. Independent executor billing can only become commercial through an explicit paid+eligible policy.
assert.match(policy,/executorPaidPolicy=type==="independent_executor"/);
assert.match(policy,/billing_mode.*paid/);
assert.match(policy,/subscription_class.*eligible/);
assert.match(policy,/!executorPaidPolicy/);
assert.match(policy,/subscriptionClass:"exempt"/);
assert.match(migration,/WHERE subject_type='independent_executor'/);
assert.match(migration,/billing_mode='free'/);
assert.match(migration,/subscription_class='exempt'/);
assert.match(migration,/max_drivers=NULL/);

// 5. ForYou projection is null-safe and supplies requester type for executor requests.
assert.match(foryou,/row\?\.requester_type/);
assert.match(foryou,/requesterType=String/);
assert.match(workspace,/filter\(Boolean\)\.filter/);
assert.match(workspace,/x\?\.recipient_type/);

// 6. Billing UI consumes canonical capacity and hides non-commercial usage/billing.
assert.match(subscription,/c\.capacity/);
assert.match(subscription,/billingEligible=c\.subscriptionRequired===true && c\.subscriptionClass!=="exempt"/);
assert.match(subscription,/billingNotRequired/);

console.log("10.32.0 operational capacity + activation resilience + ForYou safety: PASS");
