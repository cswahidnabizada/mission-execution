export const EXECUTION_ENGINE_VERSION="1.0";

export function buildExecutionContract({mission={},flow={},ownership={},featureState={},availability=null}={}){
  const status=String(mission.status||flow.status||"Pending");
  const mode=executionMode(ownership,featureState);
  const actor=executionActor(ownership,featureState);
  const state=executionState({status,mode,actor,flow,featureState,availability});
  const source=executionSource(featureState,ownership);
  const custodyActive=["PickedUp","InTransit"].includes(status);

  return Object.freeze({
    version:EXECUTION_ENGINE_VERSION,
    missionId:Number(mission.id||flow.missionId||0)||null,
    status,mode,state,source,actor,
    ownerCompanyId:Number(ownership.ownerCompanyId||mission.company_id||0)||null,
    custody:Object.freeze({
      active:custodyActive,
      transferRequired:Boolean(custodyActive&&state==="BLOCKED"&&executionUnavailable(availability))
    }),
    assignment:Object.freeze({
      required:mode==="UNASSIGNED"||mode==="SHARED_TENANT",
      driverId:Number(ownership.localDriverId||ownership.sharedDriverId||featureState.assignment?.driverId||0)||null
    }),
    canProgress:Boolean(["READY","ACTIVE"].includes(state)),
    waitingFor:waitingFor({state,actor,flow}),
    invariant:Object.freeze({
      oneExecutionOwner:Number(ownership.ownerCount||0)<=1,
      noDistributionCompetition:!Boolean(ownership.marketplace&&Number(ownership.ownerCount||0)>0)
    })
  });
}

export function validateExecutionContract(c){
  const problems=[];
  if(!c?.missionId)problems.push("mission_id_missing");
  if(!c?.invariant?.oneExecutionOwner)problems.push("multiple_execution_owners");
  if(!c?.invariant?.noDistributionCompetition)problems.push("distribution_execution_conflict");
  if(c?.state==="ACTIVE"&&!c?.actor)problems.push("active_without_actor");
  if(c?.mode==="UNASSIGNED"&&c?.actor)problems.push("unassigned_with_actor");
  return problems;
}

function executionMode(o,f){
  if(Number(o.executorId||f.assignment?.executorId||0))return "INDEPENDENT_EXECUTOR";
  if(Number(o.sharedTenantId||f.assignment?.executingTenantId||0)){
    return Number(o.sharedDriverId||f.assignment?.driverId||0)?"SHARED_DRIVER":"SHARED_TENANT";
  }
  if(Number(o.localDriverId||f.assignment?.driverId||0))return "OWNER_DRIVER";
  return "UNASSIGNED";
}
function executionActor(o,f){
  const executorId=Number(o.executorId||f.assignment?.executorId||0)||null;
  if(executorId)return Object.freeze({type:"executor",id:executorId,name:f.assignment?.executorName||"Independent executor"});
  const sharedDriverId=Number(o.sharedDriverId||0)||null;
  if(sharedDriverId)return Object.freeze({type:"driver",id:sharedDriverId,name:f.assignment?.driverName||"Shared driver"});
  const localDriverId=Number(o.localDriverId||f.assignment?.driverId||0)||null;
  if(localDriverId)return Object.freeze({type:"driver",id:localDriverId,name:f.assignment?.driverName||"Driver"});
  const sharedTenantId=Number(o.sharedTenantId||f.assignment?.executingTenantId||0)||null;
  if(sharedTenantId)return Object.freeze({type:"tenant",id:sharedTenantId,name:f.assignment?.executingTenantName||"Executing tenant"});
  return null;
}
function executionState({status,mode,actor,flow,availability}){
  if(["Completed","Cancelled","Canceled"].includes(status))return "FINISHED";
  if(flow.readiness?.state==="BLOCKED"||executionUnavailable(availability))return "BLOCKED";
  if(mode==="UNASSIGNED")return "UNASSIGNED";
  if(mode==="SHARED_TENANT"&&actor?.type==="tenant")return "AWAITING_DRIVER";
  if(status==="Pending")return "READY";
  return "ACTIVE";
}
function executionUnavailable(a){
  const s=String(a?.state||a?.availability||"").toUpperCase();
  return ["UNAVAILABLE","BLOCKED"].includes(s)||a?.available===false;
}
function executionSource(f,o){
  if((Number(o.executorId||0)||Number(o.sharedTenantId||0))&&f.foryou?.accepted)return "FORYOU";
  if((Number(o.executorId||0)||Number(o.sharedTenantId||0))&&f.network?.accepted)return "TRUSTED_NETWORK";
  if(Number(o.localDriverId||0))return "DIRECT_ASSIGNMENT";
  return "NONE";
}
function waitingFor({state,actor,flow}){
  if(state==="AWAITING_DRIVER")return Object.freeze({type:"tenant",id:actor?.id||null,name:actor?.name||null,reason:"driver_assignment_required"});
  if(state==="BLOCKED"&&flow.next?.waitingFor)return Object.freeze({type:"actor",name:flow.next.waitingFor,reason:flow.next.reasonCode||"blocked"});
  return null;
}
