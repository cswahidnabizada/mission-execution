/* ON Mission 10.30.42 — Unified Operational Execution.
 * Read-only convergence contract. It brings every canonical execution inventory
 * into one viewer-scoped execution surface without creating a new authority.
 */
import {ACTION_REGISTRY,actionDefinition} from "../../application/actions/action-registry.js";
import {ACTION_SERVICE_MAP,resolveActionTarget} from "../../application/actions/action-service-map.js";
import {MISSION_LIVENESS_STATES,canonicalLivenessState} from "../../core/canonical-liveness-registry.js";
import {canonicalMissionStatus,lifecycleDefinition} from "../../domains/logistics/logistics-lifecycle.contract.js";

export const UNIFIED_OPERATIONAL_EXECUTION_VERSION="1.0";

export function buildUnifiedOperationalExecution({mission={},session={},truth=null,liveness=null,readiness=null,responsibility=null,capability=null,operatorIntent=null,operatorActionInventory=null,decisionActionConsistency=null,operationalFlow=null,actionExecutionBridge=null,actions=[]}={}){
  const missionId=id(mission?.id);
  const status=canonicalMissionStatus(truth?.lifecycle?.status||mission?.status||"Pending");
  const lifecycle=lifecycleDefinition(status);
  const liveState=canonicalLivenessState(liveness?.state)||"BREACH";
  const inventory=operatorActionInventory||{};
  const all=dedup([...(inventory.all||[]),...(Array.isArray(actions)?actions:[])]);
  const executable=all.filter(a=>Boolean(a?.code)&&Boolean(actionDefinition(a.code))&&Boolean(resolveActionTarget(a.code,{missionId,role:String(session?.role||""),stateToken:token(mission)})));
  const primaryCode=String(actionExecutionBridge?.code||operationalFlow?.action?.code||operatorIntent?.action?.code||capability?.code||"").toLowerCase()||null;
  const primary=primaryCode?executable.find(a=>String(a.code).toLowerCase()===primaryCode)||null:null;
  const routeCoverage=all.reduce((n,a)=>n+(ACTION_SERVICE_MAP[a.code]?1:0),0);
  const registryCoverage=all.reduce((n,a)=>n+(ACTION_REGISTRY[a.code]?1:0),0);
  const executableState=actionExecutionBridge?.state||"NOT_ESTABLISHED";
  return Object.freeze({
    version:UNIFIED_OPERATIONAL_EXECUTION_VERSION,advisory:true,authoritative:false,missionId,
    lifecycle:Object.freeze({status,stage:lifecycle?.stage||null,terminal:Boolean(lifecycle?.terminal),next:lifecycle?.allowedSuccessors?.[0]||null}),
    liveness:Object.freeze({state:liveState,reasonCode:liveness?.reasonCode||null,nextActionCode:liveness?.nextActionCode||null,responsibleActor:liveness?.responsibleActor||null}),
    responsibility:responsibility?.responsible||null,
    decision:Object.freeze({state:String(operatorIntent?.state||decisionActionConsistency?.state||"OBSERVE"),code:primaryCode,label:String(operatorIntent?.action?.label||primary?.label||actionExecutionBridge?.label||"")||null}),
    primary:Object.freeze({code:primaryCode,label:String(actionExecutionBridge?.label||primary?.label||capability?.label||primaryCode||"")||null,state:String(executableState),target:actionExecutionBridge?.target||primary?.target||null,viewerCanExecute:Boolean(actionExecutionBridge?.viewerCanExecute||operationalFlow?.action?.executable)}),
    inventories:Object.freeze({
      canonicalActions:Object.freeze({count:Object.keys(ACTION_REGISTRY).length}),
      serviceRoutes:Object.freeze({count:Object.keys(ACTION_SERVICE_MAP).length}),
      operator:Object.freeze({all:Number(inventory.counts?.all||all.length),execution:Number(inventory.counts?.execution||0),support:Number(inventory.counts?.support||0),management:Number(inventory.counts?.management||0)}),
      viewer:Object.freeze({available:all.length,registered:registryCoverage,routed:routeCoverage,unregistered:Math.max(0,all.length-registryCoverage),unrouted:Math.max(0,all.length-routeCoverage)})
    }),
    readiness:Object.freeze({state:String(readiness?.readiness?.state||readiness?.state||"UNKNOWN"),execution:String(readiness?.execution?.state||"NOT_ESTABLISHED"),ready:Boolean(readiness?.ready||actionExecutionBridge?.state==="EXECUTABLE")}),
    execution:Object.freeze({state:String(executableState),primary:primary||null,available:Object.freeze(executable),count:executable.length}),
    consistency:Object.freeze({state:String(decisionActionConsistency?.state||"UNKNOWN"),valid:Boolean(!decisionActionConsistency?.problems?.length),problems:Object.freeze(Array.isArray(decisionActionConsistency?.problems)?decisionActionConsistency.problems:[])}),
    safety:Object.freeze({createsTruth:false,createsAuthorization:false,changesCustody:false,changesResponsibility:false,executesAction:false})
  });
}

export function validateUnifiedOperationalExecution(c){
  const p=[];
  if(c?.advisory!==true||c?.authoritative!==false)p.push("authority_boundary_violation");
  if(!c?.missionId)p.push("mission_id_missing");
  if(!MISSION_LIVENESS_STATES.includes(String(c?.liveness?.state||"")))p.push("invalid_canonical_liveness_state");
  if(Number(c?.inventories?.viewer?.registered||0)>Number(c?.inventories?.viewer?.available||0))p.push("inventory_registration_count_invalid");
  if(Number(c?.inventories?.viewer?.routed||0)>Number(c?.inventories?.viewer?.registered||0))p.push("service_route_count_invalid");
  if(c?.primary?.state==="EXECUTABLE"&&(!c?.primary?.code||!c?.primary?.target))p.push("executable_primary_missing_route");
  if(c?.safety?.createsTruth!==false||c?.safety?.createsAuthorization!==false||c?.safety?.executesAction!==false)p.push("execution_contract_mutation_boundary_violation");
  return [...new Set(p)];
}
function dedup(items){const m=new Map();for(const a of items||[]){const c=String(a?.code||"").trim();if(c&&!m.has(c))m.set(c,a);}return [...m.values()];}
function id(v){const n=Number(v||0);return Number.isFinite(n)&&n>0?n:null;}
function token(m){const n=Number(m?.state_version||0);return n>0?`v:${n}`:null;}
