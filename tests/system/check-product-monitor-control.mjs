import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const failures=[];
const service=fs.readFileSync(path.join(root,'src/worker/modules/admin-control/product-monitor-control.service.js'),'utf8');
const routes=fs.readFileSync(path.join(root,'src/worker/modules/admin-control/admin-control.routes.js'),'utf8')+fs.readdirSync(path.join(root,'src/worker/modules/admin-control')).filter(f=>/^admin-.*\.routes\.js$/.test(f)).map(f=>fs.readFileSync(path.join(root,'src/worker/modules/admin-control',f),'utf8')).join('\n');
const admin=fs.readFileSync(path.join(root,'public/assets/js/frontend/admin/admin.js'),'utf8');
const legacyPanels=fs.readFileSync(path.join(root,'public/assets/js/frontend/admin/oversight-panels.js'),'utf8');
const operateSurface=fs.readFileSync(path.join(root,'public/assets/js/frontend/admin/surfaces/monitor.js'),'utf8');
const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
const monitor=fs.readFileSync(path.join(root,'public/assets/js/frontend/admin/monitor.js'),'utf8');
for(const needle of ['getProductMonitor','PRODUCT_MONITOR_VERSION','getProductHealth','productVerificationSummary','getAssignmentAuthorityHealth']) if(!service.includes(needle)) failures.push(`Monitor service missing ${needle}`);
if(!routes.includes('/api/platform/admin/product-monitor')) failures.push('Monitor route missing');
if(!admin.includes('panel-registry.js')) failures.push('Admin bootstrap does not load the canonical Admin panel registry');
if(!operateSurface.includes(`../monitor.js?v=${version}`)) failures.push('OPERATE surface does not load canonical Monitor module at the canonical release version');
if(!legacyPanels.includes(`./surfaces/monitor.js?v=${version}`)) failures.push('Control Plane facade does not compose the OPERATE surface');
for(const needle of ['BUILD','MONITOR','CONTROL','Health → Evidence → Issue → Recovery','data-monitor-product']) if(!monitor.includes(needle)) failures.push(`Monitor UI missing ${needle}`);
if(failures.length){console.error('Product Monitor control gate: FAIL');for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Product Monitor control gate: PASS');
