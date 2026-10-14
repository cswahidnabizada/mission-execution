import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
const root=process.cwd(),fail=[];const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const ui=read("public/assets/ui/canonical-mission-workspace.js"),html=read("public/admin.html");
for(const v of ["situation","execution","evidence","history","actions","mission-tv"])if(!ui.includes(`data-cmw-pane="${v}"`))fail.push(`missing canonical pane: ${v}`);
for(const x of ["PEOPLE & RESPONSIBILITY","ROUTE","OBJECT & REQUIREMENTS","MISSION INTELLIGENCE","EXECUTION READINESS","Mission proof, files & exceptions","Immutable operational record","Change intelligence"])if(!ui.includes(x))fail.push(`missing workspace information surface: ${x}`);
for(const x of ["api(`/api/missions/${id}/details?history=1`)","/api/missions/${id}/truth","/api/actions-intelligence/missions/${id}"])if(!ui.includes(x))fail.push(`missing canonical data source: ${x}`);
if(ui.includes("fetchMissionManagement")||ui.includes("missionActionCardHtml")||ui.includes("missionActionListItemHtml"))fail.push("legacy mission presentation inventory remains");
for(const f of ["public/assets/ui/mission.js","public/assets/js/pages/my-mission.js","public/assets/js/pages/mission-workspace-native.js","public/assets/js/pages/mission-workspace-template.js","public/assets/js/extensions/mission-management.js","public/assets/js/core/mission-action.js","public/assets/css/extensions/mission-management.css","public/assets/js/extensions/operations-context-runtime.js"])if(fs.existsSync(path.join(root,f)))fail.push(`legacy workspace file remains: ${f}`);
if(!html.includes("canonical-mission-workspace.css?v=10.31.28&build=10.31.28"))fail.push("canonical workspace CSS cache version is stale");
const cp=spawnSync(process.execPath,["--check",path.join(root,"public/assets/ui/canonical-mission-workspace.js")],{encoding:"utf8"});if(cp.status!==0)fail.push(`syntax\n${cp.stderr}`);
if(fail.length){console.error("FAIL 10.31.28 Canonical Mission Workspace Completeness");for(const x of fail)console.error(" - "+x);process.exit(1)}
console.log("PASS 10.31.28 Canonical Mission Workspace Completeness");
