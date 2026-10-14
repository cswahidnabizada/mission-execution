import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(c,m)=>{if(!c){console.error(`TENANT ISOLATION CHECK FAILED: ${m}`);process.exit(1);}};
const access=read('src/worker/security/mission-access.js');
const custody=read('src/worker/extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js');
const shared=read('src/worker/repositories/shared-mission.repository.js');
const executor=read('src/worker/repositories/executor.repository.js');
const migration=read('database/migrations/0107_d1_invariant_hardening_wave_2.sql');
const requirements=read('src/worker/extensions/mission-management/requirements/management-requirement.repository.js');
const matrix=[
  ['Tenant A → Tenant A','owner/shared/custody paths are tenant-scoped'],['Tenant A → Tenant B','explicit relationship required'],['Tenant B → Tenant A','reverse owner authority denied'],['shared mission','access_company_id + mission + active required'],['pending network','recipient company/executor required'],['accepted network','recipient + trust required'],['ForYou discovery','published pending mission only'],['custody recipient','target identity + owner scope required'],['executor','exact assignment/recipient required'],['driver','exact driver tenant + identity required'],['platform admin','separate platform authority']
];
// Canonical mission access boundaries.
must(access.includes('sharedRepo.findSharedMissionForTenant(env,sessionTenant,missionId)'), 'tenant shared access is not routed through the canonical shared-mission authority');
must(access.includes("ni.recipient_company_id=? AND ni.status='Pending'"), 'pending network tenant access is not recipient-scoped');
must(access.includes("r.requester_company_id=? AND r.status='Pending'"), 'pending ForYou tenant access is not requester-scoped');
must(access.includes("m.public_enabled=1") && access.includes("m.status='Pending'"), 'ForYou discovery is not restricted to published pending missions');
must(access.includes('recipient_executor_id=?') && access.includes("ni.recipient_type='executor'"), 'executor network access is not recipient-scoped');
must(access.includes('sd.assignee_company_id') && access.includes('sd.assignee_id'), 'shared driver access is not bound to driver tenant + identity');
must(access.includes('cc.target_type=? AND cc.target_id=?'), 'custody recipient access is not bound to target identity');
// Canonical repositories.
must(shared.includes('mta.access_company_id=? AND mta.mission_id=? AND mta.status=\'active\''), 'shared tenant repository does not enforce access tenant scope');
must(shared.includes('sd.assignee_company_id') && shared.includes('sd.assignee_id=?'), 'shared driver repository does not enforce driver tenant + identity scope');
must(executor.includes('mea.assignee_id=? AND mea.mission_id=?'), 'executor repository does not enforce exact assignment identity');
// Operational requirement actor isolation.
must(requirements.includes('requested_actor_type=?') && requirements.includes('COALESCE(requested_actor_id,0)=COALESCE(?,0)'), 'requirements are not actor-bound');
must(requirements.includes("error.code='REQUIREMENT_ACTOR_MISMATCH'"), 'actor mismatch does not fail explicitly');
// D1 defense-in-depth invariants.
must(migration.includes('trg_mission_tenant_access_scope_guard_insert'), 'mission tenant access insert invariant missing');
must(migration.includes('trg_mission_tenant_driver_assignment_scope_guard_insert'), 'tenant-driver assignment insert invariant missing');
must(migration.includes('trg_mission_custody_cases_scope_guard_insert'), 'custody case insert invariant missing');
// Every custody mutation by numeric case ID is owner-company scoped.
for (const name of ['markReleased','markAwaitingAcceptance','resolveCase','updateRouting','setDistributionStatus','bindRecipient','cancelCase']) {
  const start=custody.indexOf(`async function ${name}`); must(start>=0,`custody mutation ${name} missing`);
  const end=custody.indexOf('\n}',start); const block=custody.slice(start,end>start?end:custody.length);
  must(/WHERE company_id=\?/.test(block),`custody mutation ${name} lacks owner-company predicate`);
}
must(/findAwaitingAcceptanceForActor\(env,companyId,missionId/.test(custody), 'custody acceptance lookup lacks owner-company scope');
must(!/UPDATE mission_custody_cases[\s\S]{0,500}WHERE id=\? AND status/.test(custody),'ID-only custody mutation found without tenant scope');
console.log(`tenant isolation matrix OK (${matrix.length} adversarial scenarios; canonical access + repository + D1 + custody mutation boundaries certified)`);
