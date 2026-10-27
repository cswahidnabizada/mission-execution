import assert from 'node:assert/strict';
import fs from 'node:fs';
const studio=fs.readFileSync(new URL('../../src/worker/security/platform-data-studio.service.js',import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../../src/worker/security/platform-data-entry.service.js',import.meta.url),'utf8');
assert.match(studio,/const normalizeScope=v=>v===undefined\|\|v===null\|\|v===''\?null:String\(v\)\.trim\(\)/,
  'scope normalization must treat null/empty as a value, not as a bypass');
assert.match(studio,/normalizeScope\(submitted\)!==normalizeScope\(current\)/,
  'tenant/market scope edits must require the owning authority even when current scope is null');
assert.match(studio,/DATA_STUDIO_SCOPE_CHANGE_REQUIRES_OWNER/);
assert.match(studio,/withPlatformMutationLease/,'updates must retain the mutation fence');
assert.match(studio,/expectedUpdatedAt/,'updates must retain optimistic concurrency');
assert.match(studio,/prepareDataEntry\(env,actor/,'preview and commit must pass through server-side data-entry validation');
assert.match(entry,/const dependencies=await dependencyCheck\(env,type,normalized\)/,
  'relationships must be resolved by server-side dependency checks');
assert.match(entry,/dependencies\.blockers\.length===0/,'unresolved dependencies must block preview/commit');
assert.match(studio,/ensureDataLifecycleEvent/,'successful changes must record lifecycle evidence');
assert.match(studio,/readAfterWriteVerified=sameIdentity&&fieldsMatch/,'success requires canonical read-back verification');
console.log('16.58.0 asset scope and authority fence: PASS');
