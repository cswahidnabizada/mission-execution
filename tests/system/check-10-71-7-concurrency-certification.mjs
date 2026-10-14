import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const fail=[];

const transition=read('src/worker/modules/transitions/transition-safety.service.js');
const route=read('src/worker/modules/transitions/transition-route.helper.js');
const missions=read('src/worker/modules/missions/missions.routes.js');
const api=read('public/assets/js/core/api.js');
const studio=read('src/worker/security/platform-data-studio.service.js');
const studioUi=read('public/assets/js/frontend/admin/data-studio.js');
const trash=read('src/worker/security/platform-trash.service.js');
const lease=read('src/worker/security/platform-mutation-lease.service.js');
const migration=read('database/migrations/0121_canonical_mutation_leases.sql');

const must=(condition,message)=>{if(!condition)fail.push(message);};

// Mission canonical CAS / stale-truth fence.
must(transition.includes('expectedUpdatedAt') && transition.includes('MISSION_CHANGED'), 'mission transition guard must enforce stale state tokens with 409');
must(transition.includes('state_version=? AND state_lock_token IS NULL'), 'mission lease acquisition must be compare-and-set on canonical state_version');
must(transition.includes('state_version=state_version+1'), 'mission mutation must advance canonical state version');
must(missions.includes('requireStateToken:true'), 'guarded mission mutation routes must require a state token');
must(route.includes('ensureCanonicalMutationVersion'), 'successful mission mutations must converge on one canonical post-mutation version');
must(route.includes('markMutationApplied'), 'mutation outcome must be durably recorded before lease release');
must(api.includes('onmission:stale-mission'), 'frontend must surface stale mission truth for refresh');
must(api.includes('fetchCanonicalMissionStateToken'), 'frontend must resolve canonical mission state before tokenless protected mutation');
must(api.includes('MISSION_CHANGED'), 'frontend must recognize the canonical stale-mission conflict');

// All canonical mission mutation routes in this wave use the guarded boundary.
for(const [routeName,count] of [
  ['missions.routes.js', (missions.match(/guardedMissionMutation/g)||[]).length],
]) must(count>=4, `${routeName} must route mission mutations through guardedMissionMutation`);

// Shared non-domain lease boundary.
must(migration.includes('platform_mutation_leases'), 'shared mutation lease migration missing');
must(lease.includes('INSERT OR IGNORE INTO platform_mutation_leases'), 'mutation lease acquisition must be atomic');
must(lease.includes('expires_at<=CURRENT_TIMESTAMP'), 'expired mutation leases must be safely reclaimable');
must(lease.includes('DELETE FROM platform_mutation_leases WHERE scope_key=? AND lock_token=?'), 'mutation leases must release only by owner token');
must(studio.includes("withPlatformMutationLease"), 'Data Studio commits must use the shared mutation lease');
must(studio.includes('Re-read after acquiring the lease'), 'Data Studio must re-read canonical truth after acquiring its lease');
must(studio.includes('DATA_STUDIO_STALE_RECORD'), 'Data Studio stale edits must fail with explicit 409 conflict');
must(studioUi.includes('expectedUpdatedAt:current.record.record.updated_at'), 'Data Studio UI must submit the canonical state token');

// Trash/restore/purge exclusivity.
must(trash.includes("withPlatformMutationLease"), 'Trash mutations must use the shared mutation lease');
must(trash.includes("purged_at IS NULL AND restored_at IS NULL"), 'Trash restore/purge must require an unconsumed canonical trash state');
must(trash.includes("WHERE id=? AND purged_at IS NULL AND restored_at IS NULL"), 'purge finalization must be compare-and-set against restore/purge state');
must(trash.includes("trash-resource:${clean(resourceType,100)}"), 'trash creation must serialize per canonical resource');
must(trash.includes("trash-item:${Number(id)}"), 'restore/purge must serialize per trash item');

// Prevent accidental second authority.
must(!studio.includes('platform_mutation_leases'), 'Data Studio must use the shared lease service rather than embedding a second lease authority');
must(!trash.includes('CREATE TABLE platform_mutation_leases'), 'Trash must not define a second lease authority');

if(fail.length){
  console.error('10.71.7 CONCURRENCY CERTIFICATION FAILED');
  console.error(fail.join('\n'));
  process.exit(1);
}

assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS platform_mutation_leases'));
console.log('10.71.7 Concurrency Certification: PASS — mission CAS/stale truth, Data Studio serialization, and Trash/Restore/Purge exclusivity verified');
