export const EXECUTION_TRANSITION_VERSION="1.0";

export const EXECUTION_TRANSITION=Object.freeze({
  ASSIGN_DRIVER:"ASSIGN_DRIVER",
  ACCEPT_NETWORK:"ACCEPT_NETWORK",
  APPROVE_FORYOU:"APPROVE_FORYOU",
  RECLAIM_EXECUTION:"RECLAIM_EXECUTION",
  REASSIGN_DRIVER:"REASSIGN_DRIVER",
  CUSTODY_TRANSFER:"CUSTODY_TRANSFER",
  COMPLETE_EXECUTION:"COMPLETE_EXECUTION"
});

export function buildExecutionTransition({
  missionId,type,fromMode,toMode,fromState,toState,
  source="NONE",actor=null,requiresCustody=false,securedService=null,
  expectedStatus=null,resultStatus=null,reasonCode=null
}={}){
  return Object.freeze({
    version:EXECUTION_TRANSITION_VERSION,
    missionId:Number(missionId)||null,
    type:String(type||""),
    from:Object.freeze({mode:String(fromMode||"UNASSIGNED"),state:String(fromState||"UNASSIGNED")}),
    to:Object.freeze({mode:String(toMode||fromMode||"UNASSIGNED"),state:String(toState||fromState||"UNASSIGNED")}),
    source:String(source||"NONE"),
    actor:actor?Object.freeze({...actor}):null,
    requiresCustody:Boolean(requiresCustody),
    securedService:String(securedService||""),
    expectedStatus:expectedStatus||null,
    resultStatus:resultStatus||expectedStatus||null,
    reasonCode:reasonCode||null
  });
}

export function transitionForIntent({execution={},intent,target={}}={}){
  const base={
    missionId:execution.missionId,
    fromMode:execution.mode,
    fromState:execution.state,
    expectedStatus:execution.status,
    resultStatus:execution.status
  };

  if(intent==="assign_driver"){
    return buildExecutionTransition({...base,type:execution.mode==="OWNER_DRIVER"?"REASSIGN_DRIVER":"ASSIGN_DRIVER",
      toMode:"OWNER_DRIVER",toState:"READY",source:"DIRECT_ASSIGNMENT",
      actor:{type:"driver",id:Number(target.driverId||0)||null},securedService:"AssignmentService",
      resultStatus:"Pending",reasonCode:"owner_driver_selected"});
  }
  if(intent==="accept_network_tenant"){
    return buildExecutionTransition({...base,type:"ACCEPT_NETWORK",toMode:"SHARED_TENANT",toState:"AWAITING_DRIVER",
      source:"TRUSTED_NETWORK",actor:{type:"tenant",id:Number(target.tenantId||0)||null},securedService:"NetworkService",
      resultStatus:"Pending",reasonCode:"trusted_tenant_accepted"});
  }
  if(intent==="accept_network_executor"){
    return buildExecutionTransition({...base,type:"ACCEPT_NETWORK",toMode:"INDEPENDENT_EXECUTOR",toState:"READY",
      source:"TRUSTED_NETWORK",actor:{type:"executor",id:Number(target.executorId||0)||null},securedService:"NetworkService",
      resultStatus:"Pending",reasonCode:"trusted_executor_accepted"});
  }
  if(intent==="approve_foryou_tenant"){
    return buildExecutionTransition({...base,type:"APPROVE_FORYOU",toMode:"SHARED_TENANT",toState:"AWAITING_DRIVER",
      source:"FORYOU",actor:{type:"tenant",id:Number(target.tenantId||0)||null},securedService:"ForYouService",
      resultStatus:"Pending",reasonCode:"foryou_tenant_approved"});
  }
  if(intent==="approve_foryou_executor"){
    return buildExecutionTransition({...base,type:"APPROVE_FORYOU",toMode:"INDEPENDENT_EXECUTOR",toState:"READY",
      source:"FORYOU",actor:{type:"executor",id:Number(target.executorId||0)||null},securedService:"ForYouService",
      resultStatus:"Pending",reasonCode:"foryou_executor_approved"});
  }
  if(intent==="reclaim_execution"){
    return buildExecutionTransition({...base,type:"RECLAIM_EXECUTION",toMode:"UNASSIGNED",toState:"UNASSIGNED",
      source:"NONE",actor:null,securedService:"AssignmentService",
      requiresCustody:Boolean(execution.custody?.active),resultStatus:"Pending",reasonCode:"owner_reclaims_execution"});
  }
  if(intent==="custody_transfer"){
    return buildExecutionTransition({...base,type:"CUSTODY_TRANSFER",toMode:"OWNER_DRIVER",toState:"BLOCKED",
      source:"DIRECT_ASSIGNMENT",actor:{type:"driver",id:Number(target.driverId||0)||null},securedService:"CustodyService",
      requiresCustody:true,resultStatus:execution.status,reasonCode:"physical_handover"});
  }
  if(intent==="complete_execution"){
    return buildExecutionTransition({...base,type:"COMPLETE_EXECUTION",toMode:execution.mode,toState:"FINISHED",
      source:execution.source,actor:execution.actor,securedService:"MissionStatusService",
      resultStatus:"Completed",reasonCode:"completion_gate_passed"});
  }
  return null;
}

export function validateExecutionTransition(t){
  const problems=[];
  if(!t?.missionId)problems.push("mission_id_missing");
  if(!Object.values(EXECUTION_TRANSITION).includes(t?.type))problems.push("invalid_transition_type");
  if(!t?.securedService)problems.push("secured_service_missing");
  if(t?.requiresCustody===false&&["PickedUp","InTransit"].includes(String(t?.expectedStatus||""))&&
     ["RECLAIM_EXECUTION","REASSIGN_DRIVER"].includes(t?.type))problems.push("post_pickup_transition_without_custody");
  return problems;
}
