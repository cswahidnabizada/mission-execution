import fs from "node:fs"; import path from "node:path";
const root=process.cwd(); const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const svc=read("src/worker/modules/transitions/transition-safety.service.js");
const route=read("src/worker/modules/transitions/transition-reconciliation.routes.js");
const helper=read("src/worker/modules/transitions/transition-route.helper.js");
const mig=read("database/migrations/0043_transition_reconciliation_recovery.sql");
for(const [name,text,checks] of [
 ["service",svc,["verifyUncertainMutation","safeReconciliationHint","recovery_required","TRANSITION_NOT_COMMITTED","legacy_uncertain_assignment_proven_by_canonical_driver"]],
 ["route",route,["transition-reconciliation","reconcileMissionTransitionTruth","requireAdmin"]],
 ["helper",helper,["reconciliationHint:body"]],
 ["migration",mig,["reconciliation_json"]]
]) for(const c of checks) if(!text.includes(c)) throw new Error(`${name}: missing ${c}`);
console.log("10.30.30 transition reconciliation gate: PASS");
