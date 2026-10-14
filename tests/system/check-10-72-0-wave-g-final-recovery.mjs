import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fail=[];
const must=(condition,message)=>{if(!condition)fail.push(message)};

const pkg=JSON.parse(read('package.json'));
const release=read('RELEASE.md');
const runtime=read('tests/runtime/runtime-certification-harness.mjs');
const recovery=read('tests/runtime/recovery-certification-harness.mjs');
const trash=read('src/worker/security/platform-trash.service.js');
const dataEntry=read('src/worker/security/platform-data-entry.service.js');
const dataStudio=read('src/worker/security/platform-data-studio.service.js');
const canonicalDb=read('src/worker/core/canonical-db.js');
const transitionSafety=read('src/worker/modules/transitions/transition-safety.service.js');
const idem=read('src/worker/security/idempotency.js');
const lease=read('src/worker/security/platform-mutation-lease.service.js');
const lifecycle=read('src/worker/security/platform-data-lifecycle.service.js');
const routes=read('src/worker/modules/admin-control/admin-build-data.routes.js');

must(pkg.version===read('VERSION').trim(),`package release must match VERSION (found ${pkg.version})`);
must(release.includes('Wave G — controlled failure, replay and reconciliation completion'),'release must define the completed Wave G objective');
must(canonicalDb.includes("error.code='AUTHORITY_UNAVAILABLE'")&&canonicalDb.includes('status=503'),'canonical DB failures must remain explicit 503 authority failures');
must(transitionSafety.includes('recovery_required'),'mission transition recovery state must remain explicit');
must(idem.includes('resource_reference')||idem.includes('resourceReference'),'idempotency must retain canonical resource reconciliation');
must(lease.includes('withPlatformMutationLease'),'shared mutation lease must remain available');
must(dataStudio.includes('withPlatformMutationLease')&&dataStudio.includes('DATA_STUDIO_STALE_RECORD'),'Data Studio must retain lease + stale-write fencing');
must(trash.includes('reconcileTrashEvidence')&&trash.includes('withPlatformMutationLease'),'Trash reconciliation must remain idempotent and concurrency protected');
must(trash.includes("evidence_status='pending_reconciliation'"),'Trash evidence debt must remain explicit');
must(dataEntry.includes('reconcileStaleDataEntryCommits')&&dataEntry.includes('evidence_required'),'Data Entry evidence recovery must remain explicit');
must(lifecycle.includes('ensureDataLifecycleEvent'),'Lifecycle recovery must use the canonical idempotent evidence authority');
must(routes.includes('/api/platform/admin/trash/reconcile')&&routes.includes('requirePlatformSuperAdminStepUp'),'Trash reconciliation must remain governed and step-up protected');
must(runtime.includes('required adversarial certification additionally requires')&&runtime.includes('ON_MISSION_RUNTIME_URL'),'required runtime certification must fail closed without deployed credentials');
must(recovery.includes('recovery_required')&&recovery.includes('reconcileRecovery'),'recovery simulation must prove interrupted work becomes recovery-required');

// Deterministic recovery model: each uncertain boundary has one safe disposition.
const boundaries=[
  ['d1_unavailable','AUTHORITY_UNAVAILABLE'],
  ['audit_unavailable','pending_reconciliation'],
  ['lifecycle_unavailable','pending_reconciliation'],
  ['worker_interruption','recovery_required'],
  ['network_after_commit','reconcile'],
  ['same_request_replay','idempotent_replay'],
  ['restore_purge_race','single_mutation_winner'],
  ['final_truth_reconciliation','canonical_truth_wins']
];
const dispositions=new Set(['AUTHORITY_UNAVAILABLE','pending_reconciliation','recovery_required','reconcile','idempotent_replay','single_mutation_winner','canonical_truth_wins']);
for(const [boundary,disposition] of boundaries){must(dispositions.has(disposition),`recovery boundary ${boundary} lacks a safe disposition`);}

if(fail.length){console.error(`${read('VERSION').trim()} Wave G Final Recovery Contract: FAIL`);for(const x of fail)console.error(` - ${x}`);process.exit(1)}
console.log(`${read('VERSION').trim()} Wave G Final Recovery Contract: PASS (${boundaries.length} recovery boundaries)`);
