export const MISSION_FLOW_CONTRACT_VERSION="1.0";

export function buildMissionFlowContract({
  conditions={},featureState={},readiness=null,handoff=null,intervention=null,ownership=null,session={}
}={}){
  const status=String(conditions.status||"Pending");
  const perspective=conditions.perspective||{},r=conditions.responsibility||{};
  const owner=normalizeOwnership(ownership,conditions,featureState);
  const viewer=viewerProjection(session,conditions,owner);

  const currentAction=intervention?.state!=="NONE"&&intervention?.primary
    ? normalizeAction(intervention.primary.action,intervention.primary.actor,intervention.primary.reasonCode,"intervention")
    : normalizeAction(handoff?.nextAction,handoff?.nextActor,handoff?.handoffReason,"flow");

  return Object.freeze({
    version:MISSION_FLOW_CONTRACT_VERSION,
    missionId:Number(conditions.missionId||0)||null,
    status,
    terminal:["Completed","Cancelled","Canceled"].includes(status),

    ownership:owner,
    distribution:Object.freeze({
      foryou:distributionState(featureState.foryou),
      network:distributionState(featureState.network)
    }),

    readiness:Object.freeze({
      state:String(readiness?.readiness||"UNKNOWN"),
      outcome:String(readiness?.outcome?.state||"UNKNOWN"),
      blockers:Object.freeze([...(readiness?.blockers||[])]),
      warnings:Object.freeze([...(readiness?.warnings||[])])
    }),

    next:Object.freeze({
      action:currentAction,
      actor:currentAction?.actor||null,
      viewerCanExecute:Boolean(
        intervention?.primary?.executableByViewer ||
        handoff?.canViewerExecute
      ),
      waitingFor:intervention?.primary?.waitingFor||handoff?.waitingFor||null,
      reasonCode:currentAction?.reasonCode||null
    }),

    viewer,
    invariant:Object.freeze({
      singleExecutionOwner:owner.ownerCount<=1,
      noExecutionWithoutOwner:terminal(status)||owner.ownerCount===1||Boolean(featureState.assignment?.assignmentRequired),
      externalOwnershipVisible:owner.kind==="SHARED_TENANT"||owner.kind==="INDEPENDENT_EXECUTOR"
    })
  });
}

export function validateMissionFlowContract(contract){
  const problems=[];
  if(!contract?.missionId)problems.push("mission_id_missing");
  if(!contract?.invariant?.singleExecutionOwner)problems.push("multiple_execution_owners");
  if(contract?.next?.viewerCanExecute&&!contract?.next?.action)problems.push("viewer_can_execute_without_action");
  if(contract?.next?.action&&!contract?.next?.actor)problems.push("action_without_actor");
  if(contract?.terminal&&contract?.next?.viewerCanExecute)problems.push("terminal_mission_has_executable_action");
  return problems;
}

function normalizeOwnership(snapshot,conditions,featureState){
  const r=conditions.responsibility||{},a=featureState.assignment||{};
  const localDriverId=Number(snapshot?.localDriverId||0)||null;
  const sharedTenantId=Number(snapshot?.sharedTenantId||r.executingTenantId||0)||null;
  const executorId=Number(snapshot?.executorId||a.executorId||r.executorId||0)||null;
  const sharedDriverId=sharedTenantId?Number(a.driverId||r.driverId||0)||null:null;

  let kind="OWNER_UNASSIGNED",actor=null;
  if(executorId){
    kind="INDEPENDENT_EXECUTOR";
    actor={type:"executor",id:executorId,name:String(a.executorName||r.executorName||"Independent executor")};
  }else if(sharedTenantId){
    kind=sharedDriverId?"SHARED_TENANT_DRIVER":"SHARED_TENANT";
    actor={type:sharedDriverId?"driver":"tenant",id:sharedDriverId||sharedTenantId,name:String(sharedDriverId?r.driverName:r.executingTenantName||"Executing tenant")};
  }else if(localDriverId||Number(r.driverId||0)){
    const id=localDriverId||Number(r.driverId);
    kind="OWNER_DRIVER";
    actor={type:"driver",id,name:String(r.driverName||"Driver")};
  }

  const ownerCount=Number(snapshot?.ownerCount??([localDriverId,sharedTenantId,executorId].filter(Boolean).length));
  return Object.freeze({
    kind,actor,ownerCount,
    ownerCompanyId:Number(conditions.context?.identity?.ownerCompanyId||conditions.context?.raw?.company_id||0)||null,
    ownerCompanyName:String(conditions.context?.identity?.ownerCompanyName||conditions.perspective?.ownerName||"Owning tenant"),
    sharedTenantId,executorId,localDriverId,sharedDriverId
  });
}

function viewerProjection(session,conditions,ownership){
  const role=String(session.role||conditions.role||"");
  const p=conditions.perspective||{};
  let kind="UNKNOWN";
  if(role==="admin"&&p.isOwner)kind="OWNER_TENANT";
  else if(role==="admin"&&p.isExecutingTenant)kind="EXECUTING_TENANT";
  else if(role==="driver"&&conditions.accessKind==="shared-driver")kind="SHARED_DRIVER";
  else if(role==="driver")kind="OWNER_DRIVER";
  else if(role==="executor")kind="INDEPENDENT_EXECUTOR";
  return Object.freeze({
    kind,role,
    isOwner:Boolean(p.isOwner),
    isExecutingTenant:Boolean(p.isExecutingTenant),
    isPersonal:Boolean(p.isPersonal),
    seesExternalOwnership:Boolean(ownership.kind==="SHARED_TENANT"||ownership.kind==="SHARED_TENANT_DRIVER"||ownership.kind==="INDEPENDENT_EXECUTOR")
  });
}

function normalizeAction(action,actor,reasonCode,source){
  if(!action)return null;
  return Object.freeze({
    code:String(action.code||""),
    label:String(action.label||action.code||""),
    actor:actor?Object.freeze({...actor}):null,
    reasonCode:String(reasonCode||""),
    source
  });
}
function distributionState(x={}){
  if(x.revoked)return "REVOKED";
  if(x.accepted)return "ACCEPTED";
  if(x.rejected)return "REJECTED";
  if(x.pending||x.invitationPending)return "PENDING";
  if(x.unavailable)return "UNAVAILABLE";
  return "NONE";
}
function terminal(status){return ["Completed","Cancelled","Canceled"].includes(String(status||""));}
