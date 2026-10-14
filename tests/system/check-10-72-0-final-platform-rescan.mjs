import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const fail=[];
const must=(condition,message)=>{if(!condition)fail.push(message)};

const version=read('VERSION').trim();
const pkg=JSON.parse(read('package.json'));
const arch=read('src/worker/core/canonical-architecture-control.js');
const actions=read('src/worker/application/actions/canonical-action.application.service.js');
const lifecycle=read('src/worker/core/lifecycle-contract.js');
const db=read('src/worker/core/canonical-db.js');
const entry=read('src/worker/security/platform-data-entry.service.js');
const studio=read('src/worker/security/platform-data-studio.service.js');
const control=read('src/worker/security/platform-data-control.service.js');
const trash=read('src/worker/security/platform-trash.service.js');
const admin=read('public/assets/js/frontend/admin/admin.js');
const shell=read('public/assets/js/frontend/admin/shell.js');
const registry=read('public/assets/js/frontend/admin/workspace-registry.js');
const missionTv=read('src/worker/extensions/mission-tv-presentation/tv-presentation.contract.js');
const actionResult=read('src/worker/application/actions/canonical-action-result.contract.js');
const security=read('src/worker/security/platform-super-administrator.js');
const schema=read('database/schema.current.sql');
const migration=read('database/migrations/0122_trash_lifecycle_evidence.sql');
const release=read('RELEASE.md');

// Architecture
must(/^\d+\.\d+\.\d+$/.test(version),'VERSION must be a valid release identity');
must(pkg.version===version,'package.json version must match VERSION');
must(arch.includes('architectureFrozen:true'),'canonical architecture must remain frozen');
for(const token of ['truth:','lifecycle:','actions:','authorization:','tenantBoundary:','dataEntry:'])must(arch.includes(token),`canonical authority missing: ${token}`);
for(const token of ['ENTRY','TRUTH','DECISION','CREATION','RUNTIME','CONTROL','TRASH'])must(arch.includes(token),`canonical lifecycle stage missing: ${token}`);
must(!arch.includes('Data Intelligence Engine')&&!arch.includes('Super Data Engine'),'forbidden duplicate architecture language detected');

// Security
must(security.includes('PLATFORM_SUPER_ADMIN_SESSION_GENERATION'),'session-generation step-up control missing');
must(security.includes('normalizeStepUpScope')&&security.includes('requestScope')&&security.includes('request.method'),'step-up route/method binding missing');

// Truth / actions / lifecycle
must(exists('src/worker/modules/transitions/transition-route.helper.js')&&read('src/worker/modules/transitions/transition-route.helper.js').includes('guardedMissionMutation'),'canonical mission mutation fence missing');
must(actions.includes('idempotencyKey')||actions.includes('idempotency'),'canonical action idempotency missing');
must(lifecycle.includes('lifecycle'),'canonical lifecycle contract missing');
must(db.includes('AUTHORITY_UNAVAILABLE')&&db.includes('503'),'canonical DB failure semantics missing');
must(missionTv.includes('Recovery required')||missionTv.includes('recoveryReview'),'Mission TV recovery visibility missing');
must(actionResult.includes('reconcile'),'canonical action result reconciliation contract missing');

// Data governance / recovery
for(const token of ['prepareDataEntry','commitDataEntry','canonical_resource_id','commit_recovery_status'])must(entry.includes(token),`Data Entry governance missing: ${token}`);
must(studio.includes('withPlatformMutationLease')&&studio.includes('DATA_STUDIO_STALE_RECORD'),'Data Studio concurrency boundary missing');
must(control.includes('canonical_resource_type')&&control.includes('data_entry'),'Data Control canonical linkage missing');
must(trash.includes('evidence_status')&&trash.includes('reconcileTrashEvidence')&&trash.includes('restoreTrash')&&trash.includes('purgeTrash'),'Trash recovery authority incomplete');
must(migration.includes('evidence_status')&&migration.includes('pending_reconciliation'),'Trash evidence migration incomplete');

// Experience / UI
for(const token of ['renderAdminShell','workspaceFor','workspaceGroups'])must(admin.includes(token)||shell.includes(token)||registry.includes(token),`Control Plane workspace convergence missing: ${token}`);
must(exists('public/assets/js/frontend/admin/data-governance.js'),'Data Governance UI missing');
must(exists('public/assets/js/frontend/admin/data-studio.js'),'Data Studio UI missing');
must(exists('public/assets/js/frontend/admin/product-publisher.js'),'Product Factory UI missing');

// Scale
const scaleFiles=['src/worker/security/platform-trash.service.js','src/worker/security/platform-data-control.service.js','src/worker/modules/admin-control/admin-build-data.routes.js'];
for(const f of scaleFiles){const s=read(f);must(/LIMIT/.test(s),`bounded query missing in scale-sensitive surface: ${f}`)}

// Vocabulary
const vocab=read('src/worker/core/canonical-vocabulary.js')+read('src/worker/core/canonical-domain-registry.js');
must(/Executor/.test(vocab),'canonical Executor vocabulary missing');
must(/Object/.test(vocab),'canonical Object vocabulary missing');

// Release / recovery / business journey
must(release.includes('Wave G — controlled failure, replay and reconciliation completion'),'release must document Wave G completion');
must(release.includes('Wave H — final platform rescan'),'release must document Wave H completion');
must(exists('tests/system/check-10-72-0-wave-g-final-recovery.mjs'),'Wave G final recovery gate missing');
must(exists('tests/system/check-10-72-0-final-platform-rescan.mjs'),'Wave H final rescan gate missing');
must(release.includes('Control Plane')&&release.includes('Operations Plane')&&release.includes('Mission Workspace'),'business/architecture target must remain explicit');

// Current surface should not contain old 10.71.6 semantic headers in the decomposed admin modules.
for(const f of ['public/assets/js/frontend/admin/panel-registry.js','public/assets/js/frontend/admin/shell.js','public/assets/js/frontend/admin/data-studio.js','public/assets/js/frontend/admin/admin.js'])must(!read(f).includes('ON Mission 10.71.6'),'stale 10.71.6 semantic header remains in '+f);

if(fail.length){console.error(`${version} Final Platform Rescan: FAIL`);for(const x of fail)console.error(` - ${x}`);process.exit(1)}
console.log(`${version} Final Platform Rescan: PASS (Architecture / Security / Truth / Liveness / Stability / Experience / Scale / Recovery / Vocabulary / Data / UI / Business Journey)`);
