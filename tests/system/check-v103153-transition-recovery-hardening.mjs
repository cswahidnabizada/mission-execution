import assert from 'node:assert/strict';
import fs from 'node:fs';
const safety=fs.readFileSync('src/worker/modules/transitions/transition-safety.service.js','utf8');
const helper=fs.readFileSync('src/worker/modules/transitions/transition-route.helper.js','utf8');
const network=fs.readFileSync('src/worker/modules/network/network.routes.js','utf8');
const attention=fs.readFileSync('src/worker/modules/attention/attention.routes.js','utf8');

assert.match(safety,/STALE_TRANSITION_SECONDS=120/,'stale transition threshold must be explicit');
assert.ok(safety.includes("OR (mutation_phase='processing' AND datetime(updated_at)<=datetime('now',?))"),'stale processing intents must be reconciled');
assert.doesNotMatch(safety,/FROM public_mission_requests\s+WHERE id=\? AND company_id=\? AND mission_id=\? LIMIT 1\s+WHERE/,'reconciliation query must not contain duplicate WHERE');
assert.match(safety,/TRANSITION_RECOVERY_REQUIRED/,'unresolved transition truth must block subsequent mutations');
assert.match(safety,/status==='recovery_required'/,'unresolved reconciliation outcome must be surfaced');
assert.match(helper,/actionCode==='delete_mission'/,'hard-delete must have an explicit terminal handling path');
assert.match(helper,/commitMutationEvent\(env,\{transitionKey:guard\.key,companyId,missionId,result,stateTokenAfter:null\}\)/,'successful hard-delete must commit its durable event');
assert.match(network,/body:\{\.\.\.b,invitationId:Number\(params\.id\)\}/,'network response reconciliation must bind to exact invitation');
assert.match(attention,/body:\{\.\.\.b,exceptionId:Number\(params\.exceptionId\)\}/,'exception reconciliation must bind to exact exception');
console.log('10.31.53 transition recovery hardening contract: PASS');
