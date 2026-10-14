import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {buildMissionContext} from "../../src/worker/modules/intelligence/mission-context.js";
import {buildMissionConditions} from "../../src/worker/modules/intelligence/mission-conditions.js";
import {deriveActionCapabilities} from "../../src/worker/extensions/actions-intelligence/action-capability.engine.js";
import {buildActionContract} from "../../src/worker/extensions/actions-intelligence/action-contract.engine.js";

const root=process.cwd(), fail=[];
const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const ui=read("public/assets/ui/canonical-mission-workspace.js");
const capability=read("src/worker/extensions/actions-intelligence/action-capability.engine.js");
const contract=read("src/worker/extensions/actions-intelligence/action-contract.engine.js");
const legacyFiles=["public/assets/js/core/mission-action.js","public/assets/js/extensions/mission-management.js","public/assets/css/extensions/mission-management.css","public/assets/ui/custody.js","public/assets/js/extensions/operations-context-runtime.js","public/assets/js/extensions/operations-controller.js"];
for(const f of legacyFiles)if(fs.existsSync(path.join(root,f)))fail.push(`legacy mission workspace file remains: ${f}`);
if(ui.includes("fetchMissionManagement")||ui.includes("missionActionCardHtml")||ui.includes("missionActionListItemHtml"))fail.push("canonical workspace contains legacy mission action/management presentation code");

if(ui.includes("fetchMissionManagement(id)")) fail.push("canonical workspace still consumes a second management action inventory");
if(!ui.includes('api(`/api/actions-intelligence/missions/${id}`,{cache:"no-store"})')) fail.push("canonical Actions Intelligence read is not cache protected");
if(!capability.includes("assignmentFeature.assignmentRequired")) fail.push("existing Assignment Intelligence is not consumed by capability derivation");
if(!capability.includes("ctx.perspective?.isOwner && ctx.responsibility?.responsibilityOwner===\"owner\"")) fail.push("owner assignment decision is not tied to existing execution perspective");
if(!capability.includes("ctx.source?.owned")) fail.push("sharing decision is not tied to existing distribution ownership intelligence");
if(!contract.includes("context.managementActions")) fail.push("existing management capabilities are not projected into canonical action contract");

const mission={id:244,reference:"SN:100139",status:"Pending",company_id:1,shared_access:0,public_enabled:0,driver_id:null,assigned_executor_id:null,executing_tenant_id:null,pickup_address:"Pickup",delivery_address:"Delivery"};
const conditions=buildMissionConditions(buildMissionContext(mission,{role:"admin",accessKind:"owner"}));
const featureState={assignment:{assignmentRequired:true,acquisitionWaiting:false,assignmentMutable:true,canAssign:true,canReassign:false},exceptions:{},missionData:{missingRequired:[]},foryou:{},network:{}};
const caps=deriveActionCapabilities({conditions,featureState});
const codes=new Set(caps.capabilities.map(x=>x.code));
for(const code of ["assign_driver","share_foryou","share_network","message"]){if(!codes.has(code))fail.push(`SN:100139 owner scenario missing ${code}`);}
const contractResult=buildActionContract(caps,{conditions,featureState,missionId:244,stateToken:"v:1"});
if(contractResult.primary?.code!=="assign_driver") fail.push(`expected assign_driver primary, got ${contractResult.primary?.code||"none"}`);
for(const code of ["assign_driver","share_foryou","share_network","message"]){if(!contractResult.all.some(x=>x.code===code))fail.push(`canonical contract missing ${code}`);}

for(const f of [
  "public/assets/ui/canonical-mission-workspace.js",
  "public/assets/js/extensions/canonical-dashboard-runtime.js",
  "src/worker/extensions/actions-intelligence/action-capability.engine.js",
  "src/worker/extensions/actions-intelligence/action-contract.engine.js",
  "src/worker/extensions/actions-intelligence/actions-intelligence.routes.js",
  "src/worker/modules/intelligence/mission-context.js",
  "src/worker/modules/intelligence/mission-conditions.js"
]){
  const cp=spawnSync(process.execPath,["--check",path.join(root,f)],{encoding:"utf8"});
  if(cp.status!==0)fail.push(`syntax:${f}\n${cp.stderr}`);
}
if(fail.length){console.error("FAIL 10.31.26 Existing Intelligence Alignment");for(const x of fail)console.error(" - "+x);process.exit(1);}
console.log("PASS 10.31.26 Existing Intelligence Alignment: existing Mission Context + Conditions + Execution Perspective + Assignment Intelligence + Actions Intelligence converge into one canonical action contract");
