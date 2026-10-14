import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
const root=process.cwd(); const read=p=>fs.readFileSync(path.join(root,p),"utf8"); const fail=[]; const must=(ok,msg)=>{if(!ok)fail.push(msg)};
const role=read("public/assets/js/pages/canonical-role-workspace.js");
const context=read("src/worker/extensions/operations-context/operations-context.routes.js");
const html=read("public/driver/dashboard.html");
const admin=read("public/admin.html");
for(const x of ["/api/missions?activeOnly=true&limit=100","/api/missions/${state.selected}/messages","/api/driver/me/operational","/api/executor/me/operational","/api/auth/logout"]) must(role.includes(x),`Role workspace missing ${x}`);
must(context.includes("requireSession"),"Operations Context must accept authenticated role sessions"); must(!context.includes("requireAdmin"),"Operations Context must not require admin for role mission context");
for(const x of ["profileForm","messageForm","noteForm","missionList","context"]) must(html.includes(`id="${x}"`),`Role workspace missing ${x}`);
for(const x of ["missionMessageForm","missionMessages","loadMissionChat","sendMissionMessage"]) must(role.includes(x),`Role runtime missing ${x}`);
for(const x of ["homeDecisionFlow",`data-exp-area="work"`,`data-exp-area="network"`,`data-exp-area="people"`,`data-exp-area="insights"`]) must(admin.includes(x),`Admin Home missing activated decision flow ${x}`);
for(const f of ["public/assets/ui/index.js","public/assets/ui/canonical-ui-system.css","public/assets/js/extensions/canonical-dashboard-runtime.js","public/assets/js/pages/canonical-role-workspace.js"]) must(fs.existsSync(path.join(root,f)),`Canonical asset missing: ${f}`);
for(const f of ["public/assets/js/pages/canonical-role-workspace.js","public/assets/js/extensions/canonical-dashboard-runtime.js","src/worker/extensions/operations-context/operations-context.routes.js"]) {try{execFileSync(process.execPath,["--check",f],{stdio:"ignore"});}catch{fail.push(`Syntax check failed: ${f}`)}}
if(fail.length){console.error("10.31.15 operational UX convergence: FAIL");for(const x of fail)console.error(`- ${x}`);process.exit(1)}
console.log("10.31.15 operational UX convergence: PASS");
console.log("Role context: Driver + Independent Executor session-scoped canonical mission context");
console.log("Operational activation: Home decision flow + mission communication");

const runtime=read("public/assets/js/extensions/canonical-dashboard-runtime.js");
const roleRuntime=read("public/assets/js/pages/canonical-role-workspace.js");
must(runtime.includes('state.workSelected={...x,_actionCenterCode:code};await openWork(state.workSelected)'),"Action Center must open the same Workbench path as queue selection");
must(runtime.includes('wb-object-card'),"Mission Workbench must render canonical object data");
must(runtime.includes('MANAGE EXECUTOR')&&runtime.includes('MANAGE CUSTOMER')&&runtime.includes('MANAGE RELATIONSHIP'),"People objects must expose management entry points");
must(roleRuntime.includes('renderMissionWorkbench'),"Driver/Executor must use the canonical Mission Workbench renderer");
must(roleRuntime.includes('await api("/api/auth/logout"'),"Role workspace logout must await server session destruction");
must(roleRuntime.includes('role()==="driver"'),"Role-specific communication path must remain explicit");
