import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(), pub=path.join(root,'public'), role=path.join(pub,'driver/dashboard.html'), js=path.join(pub,'assets/js/pages/canonical-role-workspace.js'), mission=path.join(pub,'assets/ui/mission.js'), css=path.join(pub,'assets/ui/canonical-ui-system.css'), runtime=path.join(pub,'assets/js/extensions/canonical-dashboard-runtime.js');
function read(p){return fs.readFileSync(p,'utf8')}
const checks=[];const assert=(ok,msg)=>{checks.push([ok,msg]);if(!ok)throw new Error(`FAIL: ${msg}`)};
assert(fs.existsSync(role),'executor-cockpit exists');assert(fs.existsSync(js),'canonical role runtime exists');assert(fs.existsSync(mission),'canonical mission workbench renderer exists');assert(fs.existsSync(css),'canonical UI stylesheet exists');
const h=read(role),j=read(js),m=read(mission),r=read(runtime),pkg=read(path.join(root,'package.json'));
for(const x of ['EXECUTOR','executor-cockpit','SIGN OUT','OPEN DEVICE MAP','data-category="all"','data-category="today"','data-category="arrival"','data-category="pickup"','data-category="transit"','data-category="delivery"','data-category="waiting"','data-category="done"','missionWorkbench'])assert(h.includes(x),`cockpit exposes ${x}`);
for(const x of ['renderMissionWorkbench','/api/missions?limit=100','/api/driver/me/operational','/api/executor/me/operational','mission:completed','maps.apple.com','google.com/maps/dir'])assert(j.includes(x),`role runtime supports ${x}`);
for(const x of ['renderDeliveryProofCapture','delivery-proof','capture="environment"','UPLOAD PROOF','MISSION WORKBENCH'])assert(m.includes(x),`canonical workbench supports ${x}`);
assert(!j.includes('openDashboardMissionContext'),'role runtime has no Mission Context renderer dependency');assert(!r.includes('openDashboardMissionContext'),'tenant runtime has no Mission Context renderer dependency');
assert(!fs.readdirSync(path.join(pub,'assets/js/extensions')).some(x=>x.startsWith('dashboard-mission-context-')),'legacy mission context renderer files removed');
assert(pkg.includes('10.31.16'),'package version is 10.31.16');
console.log(`PASS — ${checks.length} executor-cockpit / workbench convergence checks`);
