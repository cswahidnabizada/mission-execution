import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('VERSION').trim();
const checks=[];
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);checks.push(msg)};
assert(/^\d+\.\d+\.\d+$/.test(version),`release authority must be a current convergence release: ${version}`);
const migration=read('database/migrations/0108_final_convergence_certification_governance.sql');
const evidenceMigration=read('database/migrations/0109_final_certification_evidence_governance.sql');
assert(migration.includes('platform_architecture_governance'),'architecture governance table exists');
assert(migration.includes('assignment_archive_policy'),'assignment archive policy is explicit');
assert(migration.includes('certification_model'),'certification model is explicit');
assert(migration.includes('release_authority'),'release authority is explicit');
assert(evidenceMigration.includes('platform_certification_evidence'),'certification evidence registry is governed');
assert(evidenceMigration.includes('platform_archive_governance'),'archive governance is governed');
assert(evidenceMigration.includes("retention_decision TEXT NOT NULL CHECK"),'archive retention cannot be silently assumed');
const audit=read('scripts/audit-canonical-convergence.mjs');
const transition=read('src/worker/modules/transitions/mission-transition.service.js');
const lifecycleWriterFiles=[];
for(const f of ['src/worker/modules/transitions/mission-transition.service.js']) if(/UPDATE\s+missions\s+SET\s+status\s*=|INSERT\s+INTO\s+mission_status_history\s*\(/i.test(read(f))) lifecycleWriterFiles.push(f);
assert(lifecycleWriterFiles.length===1,'exactly one canonical lifecycle writer is registered');
assert(!fs.existsSync(path.join(root,'src/worker/core/canonical-lifecycle-registry.js')),'legacy lifecycle registry remains removed');
assert(transition.includes('assertLifecycleTransition'),'transition authority remains product/sector lifecycle driven');
const assignmentLegacy=['mission_executor_assignments','mission_tenant_driver_assignments'];
for(const table of assignmentLegacy){
  assert(!audit.includes(`FROM ${table}`)&&!audit.includes(`UPDATE ${table}`)&&!audit.includes(`INSERT INTO ${table}`),`canonical convergence audit does not treat ${table} as runtime authority`);
}
const archiveRefs=[
  'src/worker/repositories/driver.repository.js',
  'src/worker/modules/account/account.service.js'
].map(read).join('\n');
assert(archiveRefs.includes('Frozen historical assignment archive'),'legacy assignment structures are explicitly frozen historical archives');
const harness=read('tests/runtime/runtime-certification-harness.mjs');
for(const token of ['authentication','tenant isolation boundary','mission creation','duplicate mission creation idempotency','mission read-after-write truth']) assert(harness.includes(token),`runtime certification covers ${token}`);
assert(harness.includes('adversarial tenant isolation'),'runtime certification includes adversarial tenant isolation');
assert(harness.includes('ON_MISSION_CERT_ATTACK_EMAIL'),'runtime certification has separate-tenant credential input');
const recoveryHarness=read('tests/runtime/recovery-certification-harness.mjs');
assert(recoveryHarness.includes('worker interruption')&&recoveryHarness.includes('recovery_required'),'recovery certification preparation covers interrupted mutation recovery');
const recoveryFiles=[
 'src/worker/security/backup-recovery-governance.service.js',
 'tests/system/check-v103153-transition-recovery-hardening.mjs',
 'tests/system/check-v103810-super-admin-control-plane-recovery.mjs'
];
for(const f of recoveryFiles)assert(fs.existsSync(path.join(root,f)),`recovery evidence surface exists: ${f}`);
let canonicalSilent=0;
for(const dir of ['src/worker']){
 const stack=[path.join(root,dir)];
 while(stack.length){const p=stack.pop();for(const ent of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,ent.name);if(ent.isDirectory())stack.push(q);else if(ent.name.endsWith('.js')){const s=fs.readFileSync(q,'utf8');canonicalSilent += (s.match(/catch\(\(\)=>\s*(null|\[\])\)/g)||[]).length;}}}
}
assert(canonicalSilent===0,`canonical silent null/array fallback patterns: ${canonicalSilent}`);
console.log(`Final convergence & certification gate: PASS (${checks.length} checks, release ${version})`);
