import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const fail=[];
const version=read('VERSION').trim();
if(!/^\d+\.\d+\.\d+$/.test(version))fail.push(`VERSION must be a current 10.74–10.76 baseline, got ${version}`);

const facade=read('public/assets/js/frontend/admin/oversight-panels.js');
if(Buffer.byteLength(facade)>12000)fail.push('oversight-panels.js must remain a small composition facade');
for(const f of ['context.js','data.js','product-factory.js','platform-governance.js','product-studio.js','product-operations.js','privacy-verification.js']){
  const p=`public/assets/js/frontend/admin/oversight/${f}`;
  if(!fs.existsSync(path.join(root,p)))fail.push(`Missing bounded oversight module: ${f}`);
}
const bounded=['product-factory.js','platform-governance.js','product-studio.js','product-operations.js','privacy-verification.js'].map(f=>[f,Buffer.byteLength(read(`public/assets/js/frontend/admin/oversight/${f}`))]);
if(bounded.some(([,n])=>n>100000))fail.push(`A bounded oversight module exceeds 100 KB: ${bounded.filter(([,n])=>n>100000).map(([f,n])=>`${f}=${n}`).join(', ')}`);

const workerFiles=[];
function walk(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=path.join(dir,entry.name);if(entry.isDirectory())walk(rel);else if(/\.(js|mjs)$/.test(entry.name))workerFiles.push(rel);}}
walk('src/worker');
for(const file of workerFiles){
  const s=read(file);
  if(/\.catch\s*\(\s*\(?[^)]*\)?\s*=>\s*\{\s*\}\s*\)/.test(s))fail.push(`Silent catch remains in ${file}`);
  if(/\.catch\s*\(\s*\(?[^)]*\)?\s*=>\s*(null|\[\]|\{\}|undefined)\s*\)/.test(s))fail.push(`Empty-value catch remains in ${file}`);
}

const critical=['src/worker/security/platform-data-entry.service.js','src/worker/security/platform-data-control.service.js','src/worker/security/platform-trash.service.js','src/worker/security/platform-reusable-data.service.js','src/worker/security/platform-admin-operation.service.js','src/worker/modules/admin-control/product-release-lifecycle.service.js','src/worker/modules/verification/verification.service.js'];
for(const file of critical){if(!read(file).includes('authorityUnavailable'))fail.push(`Canonical failure boundary not wired in ${file}`);}

const currentUi=['public/assets/js/extensions/operational-contexts.js','public/assets/js/extensions/operations-decision-coordinator.js','public/assets/js/core/mission-presentation.js','public/assets/js/core/attention-panel.js'];
for(const file of currentUi){const s=read(file);if(/Driver status|CHANGE DRIVER|label:"Drivers"/.test(s))fail.push(`Legacy Driver user-facing term remains in ${file}`);}
if(/Cargo remains an Object/.test(read('public/assets/js/extensions/canonical-universalization.js')))fail.push('Current universal Object UI still exposes legacy Cargo wording');

const manifest=JSON.parse(read('RELEASE-MANIFEST.json'));
if(manifest.version!==version||manifest.release!=='RELEASE.md'||!['10.73.0','10.74.0','10.75.0','10.76.1','10.77.0','10.78.0','10.79.0','10.80.0','10.81.0','10.82.0','10.83.0','10.84.0','10.85.1','10.85.2','10.86.0','10.87.0','10.88.0','10.89.0','10.90.0','10.91.0','10.92.0','10.93.0','10.94.0','10.95.0','10.97.0','11.02.0','11.03.0','11.04.0','11.04.1','11.05.1','11.06.0','11.07.0','11.08.0','11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.1.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.3.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.58','16.10.60','16.10.65','16.10.66','16.10.67','16.10.68','16.10.69','16.10.70','16.10.71','16.10.72','16.10.73','16.10.74','16.10.75','16.10.76','16.10.77','16.10.78'].includes(manifest.base))fail.push('Release manifest identity/base mismatch');
if(!read('RELEASE.md').includes('Canonical Failure Semantics + Control Plane Decomposition'))fail.push('RELEASE.md missing 10.74.0 hardening section');
if(!read('tests/system/check-10-74-0-runtime-adversarial.mjs').includes('Projection degradation'))fail.push('Runtime adversarial gate missing projection-degradation coverage');

if(fail.length){console.error('10.74.0 Architecture Debt: FAIL');for(const x of fail)console.error(` - ${x}`);process.exit(1)}
console.log('10.74.0 Architecture Debt: PASS');
console.log(`Worker JS/MJS scanned: ${workerFiles.length}`);
console.log(`Oversight facade bytes: ${Buffer.byteLength(facade)}; bounded modules: ${bounded.map(([f,n])=>`${f}=${n}`).join(', ')}`);
console.log('Canonical failure boundaries, vocabulary convergence and release identity verified.');
