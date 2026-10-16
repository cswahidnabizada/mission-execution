import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd(), fail=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const version=read('VERSION').trim();
if(!/^\d+\.\d+\.\d+$/.test(version))fail.push(`VERSION must be semantic, got ${version}`);

const required=[
  'public/assets/css/frontend/experience.css',
  'public/assets/js/frontend/components/ui.js',
  'public/assets/js/frontend/core/api.js',
  'public/assets/js/frontend/app/app.js',
  'public/assets/js/frontend/shell/app-shell.js',
  'public/assets/js/frontend/public/landing.js',
  'public/assets/js/frontend/public/status.js'
];
for(const f of required)if(!fs.existsSync(path.join(root,f)))fail.push(`Missing canonical frontend surface: ${f}`);

const app=read('public/assets/js/frontend/app/app.js');
const api=read('public/assets/js/frontend/core/api.js');
const shell=read('public/assets/js/frontend/shell/app-shell.js');
const experience=read('public/assets/css/frontend/experience.css');
const ui=read('public/assets/js/frontend/components/ui.js');

if(!app.includes("renderMissionWorkbench"))fail.push('App Work surface does not converge on canonical Mission Workspace');
if(!app.includes("AUTHORITY UNAVAILABLE")&&!app.includes("unavailable("))fail.push('App does not expose canonical authority-unavailable state');
if(/api\([^)]*\/api\/(network|objects|organization\/people)[^)]*\)\.catch\(\(\)=>\(\{/.test(app))fail.push('App still converts canonical workspace failures into empty data');
if(/<[^>]+\sonclick\s*=/.test(app))fail.push('App contains inline onclick mutation/navigation handlers');
if(!api.includes("Idempotency-Key")||!api.includes("crypto.randomUUID"))fail.push('Shared frontend API boundary lacks mutation idempotency');
if(!api.includes("e.code=")||!api.includes("e.details="))fail.push('Shared frontend API boundary lacks structured error contract');
if(!shell.includes('One truth. One action path.'))fail.push('App shell missing canonical boundary language');
if(!experience.includes('--onm-brand')||!experience.includes('.onm-surface')||!experience.includes('.onm-state'))fail.push('Shared frontend design system is incomplete');
if(!ui.includes('AUTHORITY UNAVAILABLE')||!ui.includes('DEGRADED'))fail.push('Canonical UI data-state components are incomplete');

const facade=read('public/assets/js/frontend/admin/oversight-panels.js');
if(Buffer.byteLength(facade)>12000)fail.push('oversight-panels.js remains oversized');
const bounded=['product-factory.js','platform-governance.js','product-studio.js','product-operations.js','privacy-verification.js'];
for(const f of bounded){const n=Buffer.byteLength(read(`public/assets/js/frontend/admin/oversight/${f}`));if(n>100000)fail.push(`${f} exceeds 100 KB (${n})`)}

const html=read('public/app/index.html');
if(!html.includes('/assets/css/frontend/experience.css'))fail.push('Canonical app HTML does not load shared experience design system');

const canonical=read('public/assets/ui/canonical-mission-workspace.js');
if(/<b>Driver<\/b>|ASSIGN DRIVER|Change Driver|receiving driver|Search drivers/.test(canonical))fail.push('Canonical Mission Workspace exposes legacy Driver terminology');
if(/targetExecutorId/.test(canonical))fail.push('Canonical Mission Workspace changed backend driverId contract');

const legacyRoutes=[
  'public/driver/dashboard.html','public/missions.html','public/role-workspace.html','public/my-driver/index.html'
];
for(const f of legacyRoutes){const s=read(f);if(!s.includes("location.replace('/app"))fail.push(`Legacy route is not a canonical redirect: ${f}`)}

const manifest=JSON.parse(read('RELEASE-MANIFEST.json'));
if(manifest.version!==version||manifest.release!=='RELEASE.md'||!['10.74.0','10.75.0','10.76.1','10.77.0','10.78.0','10.79.0','10.80.0','10.81.0','10.82.0','10.83.0','10.84.0','10.85.1','10.85.2','10.86.0','10.87.0','10.88.0','10.89.0','10.90.0','10.91.0','10.92.0','10.93.0','10.94.0','10.95.0','10.97.0','11.02.0','11.03.0','11.04.0','11.04.1','11.05.1','11.06.0','11.07.0','11.08.0','11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.1.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.3.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36'].includes(manifest.base))fail.push('Release manifest identity/base mismatch');
if(!read('RELEASE.md').includes(version))fail.push(`RELEASE.md missing current ${version} frontend convergence context`);

if(fail.length){console.error(`${version} Frontend Architecture + UX Convergence: FAIL`);for(const x of fail)console.error(` - ${x}`);process.exit(1)}
console.log(`${version} Frontend Architecture + UX Convergence: PASS`);
console.log(`Shared experience bytes: ${Buffer.byteLength(experience)}`);
console.log(`Oversight facade bytes: ${Buffer.byteLength(facade)}`);
console.log('Canonical app shell, data-state model, API mutation boundary, Mission Workspace vocabulary and legacy route retirement verified.');
