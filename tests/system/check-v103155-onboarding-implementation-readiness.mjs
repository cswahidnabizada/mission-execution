import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd(), pub=path.join(root,'public');
const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
const fail=[]; const must=(ok,msg)=>{if(!ok)fail.push(msg)};
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const files=['public/admin.html','public/driver/dashboard.html','public/foryou/index.html','public/my-driver/index.html','public/register.html','public/driver/index.html','public/index.html','public/support/index.html','public/subscription.html','public/verification.html','public/forgot-password.html','public/reset-password.html'];
for(const f of files)must(fs.existsSync(path.join(root,f)),`missing active onboarding surface: ${f}`);
const activeHtml=files.map(read).join('\n');
for(const ref of [
 `/assets/ui/canonical-ui-system.css?v=${version}&build=${version}`,
 `/assets/js/extensions/canonical-dashboard-runtime.js?v=${version}&build=${version}`,
 `/assets/js/pages/admin.js?v=${version}&rc=${version}`,
 `/assets/js/pages/canonical-role-workspace.js?v=${version}&build=${version}`,
 `/assets/css/extensions/driver-executor-operational-desk-103048.css?v=${version}&build=${version}`
]) must(activeHtml.includes(ref),`active asset cache is not on ${version}: ${ref}`);
for(const f of ['public/assets/ui/index.js','public/assets/ui/components.js','public/assets/ui/domains.js','public/assets/ui/canonical-mission-workspace.js','public/assets/ui/canonical-ui-system.css','public/assets/js/extensions/canonical-dashboard-runtime.js','public/assets/js/pages/canonical-role-workspace.js'])must(fs.existsSync(path.join(root,f)),`canonical runtime asset missing: ${f}`);
for(const f of ['public/assets/js/extensions/canonical-dashboard-runtime.js','public/assets/js/pages/canonical-role-workspace.js','public/assets/ui/index.js','public/assets/ui/canonical-mission-workspace.js']){try{execFileSync(process.execPath,['--check',f],{stdio:'ignore'});}catch{fail.push(`syntax failure: ${f}`)}}
const admin=read('public/admin.html'), runtime=read('public/assets/js/extensions/canonical-dashboard-runtime.js'), role=read('public/assets/js/pages/canonical-role-workspace.js');
for(const x of ['data-exp-area="home"','data-exp-area="work"','data-exp-area="network"','data-exp-area="people"','data-exp-area="insights"','id="workQueueHost"','id="workbench"','id="networkBody"','id="peopleBody"','id="insightsBody"','id="globalFindInput"'])must(admin.includes(x),`missing canonical surface control: ${x}`);
for(const x of ['/api/operations/command','/api/missions?limit=100','/api/network/summary','/api/drivers','/api/network/customers?all=1','/api/network/execution-partners','/api/public/requests','/api/analytics/overview'])must(runtime.includes(x),`missing canonical read path: ${x}`);
for(const x of ['renderMissionWorkbench','openWork','loadNetwork','loadPeople','createMission','createDriver','createCustomer'])must(runtime.includes(x),`missing canonical interaction: ${x}`);
for(const x of ['/api/missions?limit=100','/api/driver/me/operational','/api/executor/me/operational','renderMissionWorkbench'])must(role.includes(x),`missing executor/driver runtime path: ${x}`);
// Current active UI must not expose obsolete cache versions in executable HTML.
for(const x of ['10.31.16','10.31.40','10.31.44','10.31.48','10.31.49','10.31.51'])must(!activeHtml.includes(x),`obsolete active HTML cache/version marker remains: ${x}`);
if(fail.length){console.error(`FAIL Onboarding Implementation Readiness\n - ${fail.join('\n - ')}`);process.exit(1)}
console.log('PASS Onboarding Implementation Readiness');
