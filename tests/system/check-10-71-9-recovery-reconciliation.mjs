import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');const failures=[];const assert=(x,m)=>{if(!x)failures.push(m)};
const trash=read('src/worker/security/platform-trash.service.js');
const routes=read('src/worker/modules/admin-control/admin-build-data.routes.js');
const ctx=read('src/worker/modules/admin-control/admin-route-context.js');
const ui=read('public/assets/js/frontend/admin/data-governance.js');
const migration=read('database/migrations/0122_trash_lifecycle_evidence.sql');
assert(migration.includes("DEFAULT '1970-01-01T00:00:00.000Z'"),'0122 must use a SQLite/D1 constant ADD COLUMN default');
assert(migration.includes('UPDATE platform_trash_items SET evidence_updated_at=CURRENT_TIMESTAMP'),'0122 must backfill existing evidence timestamps');
assert(trash.includes('export async function reconcileTrashEvidence'),'Trash must expose canonical evidence reconciliation');
assert(trash.includes('ensureDataLifecycleEvent'),'Reconciliation must be idempotent through the lifecycle authority');
assert(trash.includes("evidence_status='pending_reconciliation'"),'Pending evidence must remain explicitly queryable');
assert(routes.includes("/api/platform/admin/trash/reconcile"),'Admin must expose a governed reconciliation command');
assert(routes.includes('requirePlatformSuperAdminStepUp'),'Evidence reconciliation must be step-up protected');
assert(ctx.includes('reconcileTrashEvidence'),'Route context must expose the canonical reconciliation service');
assert(ui.includes('reconcileTrashEvidence'),'Trash UI must expose evidence reconciliation');
assert(ui.includes("evidence_status==='pending_reconciliation'"),'Trash UI must show pending evidence state');
if(failures.length){console.error('10.71.9 RECOVERY RECONCILIATION FAILED');failures.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('10.71.9 Recovery Reconciliation Certification: PASS');
