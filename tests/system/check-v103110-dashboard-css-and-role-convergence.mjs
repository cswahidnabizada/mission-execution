import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const fail=[];const read=p=>{try{return fs.readFileSync(path.join(root,p),'utf8')}catch{return null}};const exists=p=>fs.existsSync(path.join(root,p));
const admin=read('public/admin.html')||'',dash=read('public/assets/js/extensions/canonical-dashboard-runtime.js')||'',role=read('public/assets/js/pages/canonical-role-workspace.js')||'',driver=read('public/driver/dashboard.html')||'',mission=read('public/assets/ui/mission.js')||'';
for(const x of ['data-exp-area="home"','data-exp-area="work"','data-exp-area="network"','data-exp-area="people"','data-exp-area="insights"','id="workbench"','canonical-mission-workspace-103122.css'])if(!admin.includes(x))fail.push(`admin missing ${x}`);
for(const x of ['loadHome','loadWork','loadNetwork','loadPeople','loadRequests','loadInsights','openWork','renderMissionWorkbench','executeSecuredAction'])if(!dash.includes(x))fail.push(`dashboard missing ${x}`);
for(const x of ['renderMissionWorkbench','/api/auth/session','/api/missions?limit=100','/api/driver/me/operational','/api/executor/me/operational'])if(!role.includes(x))fail.push(`role runtime missing ${x}`);
for(const x of ['const VIEWS=Object.freeze(["situation","execution","evidence","history","actions","mission-tv"])','Actions are capabilities, not navigation','jsonOptions','X-Mission-State-Token'])if(!mission.includes(x))fail.push(`canonical mission workspace missing ${x}`);
for(const f of ['public/assets/ui/mission.js','public/assets/ui/index.js','public/assets/js/extensions/canonical-dashboard-runtime.js','public/assets/js/pages/canonical-role-workspace.js','public/assets/css/extensions/canonical-mission-workspace-103122.css'])if(!exists(f))fail.push(`missing canonical asset ${f}`);
for(const f of ['public/my-mission.html','public/assets/js/pages/my-mission.js','public/assets/js/pages/mission-workspace-native.js','public/assets/js/pages/mission-workspace-template.js'])if(exists(f))fail.push(`legacy mission workspace remains ${f}`);
if(dash.includes('async function missionWorkbench(x,token)'))fail.push('competing mission renderer remains');
if(admin.includes('dashboard-experience-103110.js')||admin.includes('product-ui-103110.css'))fail.push('obsolete 10.31.10 assets are still registered as active runtime');
if(fail.length){console.error('FAIL current dashboard CSS and role convergence');for(const x of fail)console.error(' - '+x);process.exit(1)}
console.log('PASS current dashboard CSS and role convergence: Workbench + role cockpit resolve missions through the 10.31.22 canonical Mission Workspace');
