import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const fail=[];

const ui=read("public/assets/ui/canonical-mission-workspace.js");
const index=read("public/assets/ui/index.js");
const dashboard=read("public/assets/js/extensions/canonical-dashboard-runtime.js");
const html=read("public/admin.html");
const registry=read("src/worker/application/actions/action-registry.js");
const capability=read("src/worker/extensions/actions-intelligence/action-capability.engine.js");
const contract=read("src/worker/extensions/actions-intelligence/action-contract.engine.js");

if(!index.includes('export * from "./canonical-mission-workspace.js";')) fail.push("canonical workspace is not the UI package export");
if(fs.existsSync(path.join(root,"public/assets/ui/mission.js"))) fail.push("legacy mission.js still exists");
for(const f of [
  "public/assets/css/extensions/canonical-mission-workspace-103122.css",
  "public/assets/css/extensions/dashboard-mission-context-103040.css",
  "public/assets/css/extensions/dashboard-mission-context-103034.css",
  "public/assets/css/extensions/dashboard-mission-context-103035.css",
  "public/assets/css/extensions/dashboard-mission-context-103056.css",
  "public/assets/css/extensions/dashboard-mission-context-103039.css"
]) if(fs.existsSync(path.join(root,f))) fail.push(`legacy mission workspace CSS still exists:${f}`);

if(!ui.includes('const VIEWS=Object.freeze(["situation","execution","evidence","history","actions","mission-tv"])')) fail.push("canonical six-view navigation contract missing");
if(!ui.includes('/api/actions-intelligence/missions/${id}')) fail.push("Actions view is not reading canonical Actions Intelligence");
if(!ui.includes('state.actionIntelligence?.actions?.all')) fail.push("complete canonical action inventory is not consumed");
if(ui.includes("fetchMissionManagement(id)")) fail.push("UI still fetches a second Mission Management action inventory");
for(const x of ["EXECUTION","ASSIGNMENT","SHARING","COMMUNICATION","EVIDENCE","ATTENTION","NAVIGATION","MANAGEMENT"])
  if(!ui.includes(`"${x}"`)) fail.push(`missing canonical Actions group:${x}`);

for(const x of ["assign_driver","share_foryou","share_network","message","edit_mission","cancel_mission","delete_mission","capture_delivery_proof"])
  if(!ui.includes(x)) fail.push(`missing capability wiring:${x}`);

if(!ui.includes("Mission TV presents operational change only. Actions are owned exclusively by the Actions view."))
  fail.push("Mission TV still contains a competing action surface");

if(dashboard.includes("function missionActionApplicable(")||dashboard.includes("async function runMissionAction(")||dashboard.includes("async function executeMissionAction("))
  fail.push("legacy mission action/workspace orchestration remains in dashboard runtime");
if(dashboard.includes("Every action opens the same Mission Context experience"))
  fail.push("legacy Mission Context action wording remains");

if(!html.includes("canonical-mission-workspace-103125.css?v=10.31.25&build=10.31.25"))
  fail.push("10.31.25 canonical workspace CSS is not active");
if(!html.includes("canonical-dashboard-runtime.js?v=10.31.25&build=10.31.25"))
  fail.push("10.31.25 dashboard runtime cache version is not active");

if(!capability.includes('add(candidates,A.ASSIGN_DRIVER')) fail.push("server assignment capability unavailable");
if(!capability.includes('add(candidates,A.SHARE_FORYOU')) fail.push("server ForYou capability unavailable");
if(!capability.includes('add(candidates,A.SHARE_NETWORK')) fail.push("server Trusted Network capability unavailable");
const service=read("src/worker/extensions/actions-intelligence/actions-intelligence.service.js");
const routes=read("src/worker/extensions/actions-intelligence/actions-intelligence.routes.js");
if(!service.includes("managementActions=[]")) fail.push("Action Intelligence service does not accept management capabilities");
if(!service.includes("managementActions")) fail.push("Action Intelligence service does not forward management capabilities");
if(!routes.includes("missionManagement")) fail.push("canonical Actions endpoint does not project management capabilities");
if(!contract.includes('all:Object.freeze(all)')) fail.push("canonical Action Contract all inventory missing");
if(!contract.includes("context.managementActions")) fail.push("management capabilities are not converged into canonical Action Contract");
if(!registry.includes('[A.ASSIGN_DRIVER]:def("Assign Executor"')) fail.push("Executor vocabulary missing");

for(const f of [
  "public/assets/ui/canonical-mission-workspace.js",
  "public/assets/js/extensions/canonical-dashboard-runtime.js",
  "src/worker/extensions/actions-intelligence/action-capability.engine.js",
  "src/worker/extensions/actions-intelligence/action-contract.engine.js"
]){
  const cp=spawnSync(process.execPath,["--check",path.join(root,f)],{encoding:"utf8"});
  if(cp.status!==0) fail.push(`syntax:${f}\n${cp.stderr}`);
}

if(fail.length){
  console.error("FAIL 10.31.25 Canonical Mission Workspace Replacement");
  for(const x of fail) console.error(" - "+x);
  process.exit(1);
}
console.log("PASS 10.31.25 Canonical Mission Workspace Replacement: one mission workspace, one navigation model, canonical Actions Intelligence inventory, no legacy mission UI/workspace orchestration");
