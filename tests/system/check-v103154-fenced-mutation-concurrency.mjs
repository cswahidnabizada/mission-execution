import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const safety=fs.readFileSync('src/worker/modules/transitions/transition-safety.service.js','utf8');
const helper=fs.readFileSync('src/worker/modules/transitions/transition-route.helper.js','utf8');
const fence=fs.readFileSync('src/worker/modules/transitions/fenced-mutation.context.js','utf8');
const lifecycle=fs.readFileSync('src/worker/modules/transitions/mission-transition.service.js','utf8');
const missionRepo=fs.readFileSync('src/worker/repositories/mission.repository.js','utf8');
const baseline=fs.readFileSync('tests/system/check-v103152-independent-executor-full-lifecycle.mjs','utf8');

assert.match(fence,/state_lock_token/,'fence must validate the canonical mission lease token');
assert.match(fence,/MUTATION_LEASE_LOST/,'lost leases must fail closed');
assert.match(helper,/createFencedMutationContext/,'every guarded mutation must receive a fenced context');
assert.match(helper,/await fence\.assert\(\)/,'guarded mutation must validate its fence around domain execution');
assert.match(safety,/state_lock_token=\?/,'lease acquisition must use an opaque token');
assert.match(safety,/STALE_TRANSITION_SECONDS=120/,'stale transition threshold must remain explicit');
assert.match(lifecycle,/state_lock_token=\?\)/,'canonical lifecycle writes must be lease fenced');
assert.match(missionRepo,/state_lock_token=\?\)/,'mission assignment/details/delete writes must be lease fenced');
assert.match(missionRepo,/MUTATION_LEASE_LOST/,'mission repository must fail closed when a fenced touch loses its lease');
assert.match(safety,/TRANSITION_RECOVERY_REQUIRED/,'unresolved recovery must fail closed');
assert.match(safety,/mutation_phase='processing' AND datetime\(updated_at\)<=datetime\('now',\?\)/,'stale processing intents must remain recoverable');
assert.match(safety,/event\?\.outcome==='committed'/,'committed event recovery must be idempotent');
assert.match(helper,/actionCode==='delete_mission'/,'terminal deletion requires explicit durable handling');
assert.match(baseline,/10\.31\.52.*baseline preserved/,'10.31.52 baseline test must be version-forward compatible');

for(const f of [
 'src/worker/modules/transitions/fenced-mutation.context.js',
 'src/worker/modules/transitions/transition-safety.service.js',
 'src/worker/modules/transitions/transition-route.helper.js',
 'src/worker/modules/transitions/mission-transition.service.js',
 'src/worker/repositories/mission.repository.js',
 'src/worker/modules/missions/missions.service.js',
 'src/worker/modules/public/public.service.js',
 'src/worker/modules/attention/attention.service.js',
 'src/worker/modules/files/files.service.js',
 'src/worker/extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js'
]) execFileSync(process.execPath,['--check',f]);

// Deterministic lease-fencing simulation: the same worker token is valid until
// another worker replaces it; the old worker must then be rejected.
let currentToken='worker-A';
const fakeEnv={DB:{prepare(){return {bind(){return {async first(){return {id:1,state_version:2,state_lock_token:currentToken,state_lock_at:'now'};}};}};}}};
const {assertMutationLease}=await import('../../src/worker/modules/transitions/fenced-mutation.context.js');
await assertMutationLease(fakeEnv,{companyId:1,missionId:1,lockToken:'worker-A'});
currentToken='worker-B';
await assert.rejects(()=>assertMutationLease(fakeEnv,{companyId:1,missionId:1,lockToken:'worker-A'}),e=>e?.message==='MUTATION_LEASE_LOST');
await assertMutationLease(fakeEnv,{companyId:1,missionId:1,lockToken:'worker-B'});

console.log('10.31.54 fenced mutation + concurrency integrity contract/simulation: PASS');
