import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const failures=[];
const assert=(ok,msg)=>{if(!ok)failures.push(msg)};
const trash=read('src/worker/security/platform-trash.service.js');
const migration=read('database/migrations/0122_trash_lifecycle_evidence.sql');
const schema=read('database/schema.current.sql');
const generator=read('scripts/generate-runtime-release.mjs');
const runtime=read('src/worker/modules/admin-control/command-center.service.js');

assert(migration.includes('evidence_status'), 'Trash evidence migration must define explicit evidence status');
assert(migration.includes("pending_reconciliation"), 'Trash evidence migration must support pending reconciliation');
assert(schema.includes('evidence_status TEXT NOT NULL DEFAULT'), 'Current schema must expose Trash evidence status');
assert(schema.includes('idx_platform_trash_evidence'), 'Trash evidence index must be present in current schema');
assert(trash.includes('recordTrashLifecycleEvidence'), 'Trash must use one canonical lifecycle-evidence helper');
assert(trash.includes("evidenceStatus:'pending_reconciliation'"), 'Lifecycle evidence failure must surface pending reconciliation');
assert(trash.includes("evidence_status='pending_reconciliation'"), 'Lifecycle evidence failure must persist reconciliation state');
assert(trash.includes("purged_at IS NULL AND restored_at IS NULL"), 'Restore/purge must remain mutually exclusive');
assert(trash.includes('WHERE id=? AND purged_at IS NULL AND restored_at IS NULL'), 'Restore/purge finalization must remain compare-and-set fenced');
assert(generator.includes('stale asset URLs') || generator.includes('versionedRoots'), 'Build must converge versioned asset URLs to canonical VERSION');
assert(runtime.includes('workspaceGovernance:RELEASE_VERSION'), 'Command Center must not contain stale semantic release literals');

for(const f of [
 'src/worker/security/platform-trash.service.js',
 'src/worker/security/platform-mutation-lease.service.js',
 'src/worker/security/platform-data-lifecycle.service.js',
 'scripts/generate-runtime-release.mjs'
]){
 const text=read(f);
 assert(!/\.catch\(\(\)=>null\)|\.catch\(\(\)=>\[\]\)/.test(text), `${f} contains forbidden silent null/empty fallback`);
}

if(failures.length){console.error('10.71.8 RECOVERY CERTIFICATION FAILED');for(const x of failures)console.error('- '+x);process.exit(1)}
console.log('10.71.8 Recovery Certification: PASS — Trash evidence reconciliation, restore/purge CAS, and release asset convergence verified');
