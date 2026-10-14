import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const version=readFileSync('VERSION','utf8').trim();

const root=process.cwd(),fail=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const chain=[
  ['Control Plane','src/worker/modules/admin-control/admin-control.routes.js'],
  ['Command / Query','src/worker/modules/admin-control/admin-route-context.js'],
  ['Canonical Core','src/worker/core/canonical-db.js'],
  ['Product Contract','src/worker/modules/admin-control/product-contract.service.js'],
  ['Sector Lifecycle','src/worker/security/sector-lifecycle.service.js'],
  ['Mission Transition','src/worker/modules/transitions/mission-transition.service.js'],
  ['Action Service Map','src/worker/application/actions/action-service-map.js'],
  ['Mission Workspace','public/assets/ui/canonical-mission-workspace.js']
];
for(const [label,file] of chain)if(!fs.existsSync(path.join(root,file)))fail.push(`Missing architecture layer: ${label}`);

const adminFiles=[];
function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(e.name.endsWith('.js'))adminFiles.push(rel);}}
walk('src/worker/modules/admin-control');
for(const file of adminFiles){
  const s=read(file);
  if(/from ['"][^'"]*repositories\/(mission|assignment|executor)\.repository\.js['"]/.test(s))fail.push(`Control Plane imports operational repository directly: ${file}`);
  if(/\b(?:FROM|UPDATE|INSERT INTO|DELETE FROM)\s+(?:missions|assignments|mission_status_history|custody)/i.test(s))fail.push(`Control Plane contains operational mission/custody SQL: ${file}`);
}

const actionMap=read('src/worker/application/actions/action-service-map.js');
if(!actionMap.includes('advance_execution')||!actionMap.includes('capture_delivery_proof')||!actionMap.includes('finalize_custody_transfer'))fail.push('Action Service Map does not cover canonical mission execution chain');

const lifecycle=read('src/worker/modules/transitions/mission-transition.service.js');
if(!lifecycle.includes('UPDATE missions SET status=?')||!lifecycle.includes('mission_status_history'))fail.push('Mission lifecycle writer is missing canonical compare-and-set/history behavior');

const contract=read('src/worker/modules/admin-control/product-contract.service.js');
if(!contract.includes('immutable:true')||!contract.includes("authority:'canonical-composition'"))fail.push('Product Contract is not explicitly marked immutable canonical composition');

const uiFiles=[...fs.readdirSync(path.join(root,'public/assets/js/frontend'),{withFileTypes:true})];
const uiRoots=[];
function collect(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())collect(rel);else if(e.name.endsWith('.js'))uiRoots.push(rel);}}
collect('public/assets/js/frontend');collect('public/assets/ui');
for(const file of uiRoots){
  const s=read(file);
  if(file.includes('/public/landing.js')||file.includes('/admin-runtime.js')||file.includes('/core/api.js'))continue;
  if(/\bfetch\s*\(/.test(s))fail.push(`Frontend bypasses shared API boundary with fetch(): ${file}`);
}
const api=read('public/assets/js/frontend/core/api.js');
if(!api.includes("headers['Idempotency-Key']"))fail.push('Shared mutation API boundary lacks idempotency');
if(!api.includes('AUTHORITY_UNAVAILABLE')&&!api.includes('e.code='))fail.push('Shared API boundary lacks canonical error identity');

const app=read('public/assets/js/frontend/app/app.js');
if(/\.catch\(\(\)=>\(\{(missions|partners|invitations|objects|people)/.test(app))fail.push('Canonical app surfaces still fabricate empty results on failure');
if(!app.includes('Mission Workspace owns mission truth'))fail.push('App does not state Mission Workspace canonical ownership');

const releaseScript=read('package.json');
for(const gate of ['check-10-71-3-adversarial-idempotency.mjs','check-10-71-7-concurrency-certification.mjs','check-10-71-8-recovery-certification.mjs','check-10-71-9-recovery-reconciliation.mjs','check-10-72-0-final-platform-rescan.mjs','check-schema-current.mjs']){
  if(!releaseScript.includes(gate))fail.push(`Production hardening gate missing from release certification: ${gate}`);
}
const governance=read('src/worker/modules/admin-control/governance.service.js');
const evidence=read('src/worker/modules/admin-control/compliance-evidence.service.js');
if(/privacy_requests[\s\S]*\.catch/.test(governance)||/privacy_requests[\s\S]*\.catch/.test(evidence))fail.push('Privacy/evidence authority still has silent fallback semantics');

const legacy=['public/driver/dashboard.html','public/missions.html','public/role-workspace.html','public/my-driver/index.html'];
for(const f of legacy)if(!read(f).includes("location.replace('/app"))fail.push(`Legacy operational surface remains routable: ${f}`);

if(fail.length){console.error(`${version} Final Architecture Reconciliation: FAIL`);for(const x of fail)console.error(` - ${x}`);process.exit(1)}
console.log(`${version} Final Architecture Reconciliation: PASS`);
console.log(`Control Plane files audited: ${adminFiles.length}`);
console.log(`Frontend JS/UI modules audited: ${uiRoots.length}`);
console.log('Canonical chain, plane separation, lifecycle writer, Product Contract immutability, shared API authority and legacy route retirement verified.');
