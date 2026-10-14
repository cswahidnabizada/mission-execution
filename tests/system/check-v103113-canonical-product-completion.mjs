import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/driver/dashboard.html');
const role=read('public/assets/js/pages/canonical-role-workspace.js');
const dash=read('public/assets/js/extensions/canonical-dashboard-runtime.js');
const fail=[];
const must=(ok,msg)=>{if(!ok)fail.push(msg)};
for(const x of ['Home','Work','Network','People','Insights']) must(read('public/admin.html').includes(`data-exp-area="${x.toLowerCase()}"`),`Admin navigation missing ${x}`);
for(const x of ['statActive','statCompleted','statSituation','statLocation','profileForm','profileSituation','profileLocation','profileNote','quickMessageForm','quickMessage','missionQueue','missionWorkbench']) must(html.includes(`id="${x}"`),`Driver workspace missing ${x}`);
for(const x of ['/api/auth/session','/api/missions?limit=100','/api/driver/me/operational','/api/executor/me/operational']) must(role.includes(x),`Role runtime missing canonical connection ${x}`);
for(const x of ['renderMissionWorkbench','onmission:stale-mission']) must(role.includes(x),`Role runtime missing protected action behavior ${x}`);
const missionUi=read('public/assets/ui/mission.js');for(const x of ['jsonOptions','expectedUpdatedAt','X-Mission-State-Token']) must(missionUi.includes(x),`Canonical mission workspace missing protected action behavior ${x}`);
for(const x of ['loadHome','loadWork','loadNetwork','loadPeople','loadRequests','loadInsights','renderFind','createMission','openWork']) must(dash.includes(`function ${x}(`)||dash.includes(`async function ${x}(`),`Dashboard runtime missing ${x}`);
const names=[...dash.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
for(const [name,count] of Object.entries(names.reduce((a,n)=>(a[n]=(a[n]||0)+1,a),{}))) must(count===1,`Duplicate dashboard function: ${name} (${count})`);
for(const f of ['public/assets/ui/index.js','public/assets/ui/canonical-ui-system.css','public/assets/js/extensions/canonical-dashboard-runtime.js','public/assets/js/pages/canonical-role-workspace.js']) must(fs.existsSync(path.join(root,f)),`Canonical asset missing: ${f}`);
try{execFileSync(process.execPath,['--check','public/assets/js/pages/canonical-role-workspace.js'],{stdio:'ignore'});}catch{fail.push('Driver role runtime syntax check failed');}
try{execFileSync(process.execPath,['--check','public/assets/js/extensions/canonical-dashboard-runtime.js'],{stdio:'ignore'});}catch{fail.push('Dashboard runtime syntax check failed');}
if(fail.length){console.error('10.31.13 canonical product completion: FAIL');for(const x of fail)console.error(`- ${x}`);process.exit(1)}
console.log('10.31.13 canonical product completion: PASS (superseded compatibility gate; 10.31.22 canonical mission workspace is enforced separately)');
console.log('Canonical Admin surfaces: Home · Work · Network · People · Insights · Find · Create');
console.log('Canonical role workspace: Driver + Independent Executor shared shell with role-authorized presentation');
console.log('Driver completion: work · mission context · next action · profile · communication · notes · stale-action recovery');
