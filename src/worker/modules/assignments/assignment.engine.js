import {missionAssignmentWindow} from "./driver-assignment.policy.js";
export function buildAssignmentState(mission,{accessKind="owner"}={}){
  const missionStatus=String(mission?.status||"Pending");
  const completed=missionStatus==="Completed";
  const assignmentWindow=missionAssignmentWindow(missionStatus);
  const shared=accessKind==="shared-tenant"||Number(mission?.shared_access||0)===1;
  const readOnlyRequest=["pending-network","pending-foryou"].includes(String(accessKind||""));

  const ownerLocalDriverId=Number(mission?.owner_driver_id||0);
  const ownerLocalDriverName=String(mission?.driver_name||mission?.owner_driver_name||"");
  const directExecutorId=Number(mission?.assigned_executor_id||mission?.owner_assigned_executor_id||0);
  const directExecutorName=String(mission?.executor_name||mission?.owner_executor_name||"");

  const executingTenantId=Number(mission?.executing_tenant_id||0);
  const executingTenantName=String(mission?.executing_tenant_name||"");
  const executingTenantDriverId=Number(mission?.executing_tenant_driver_id||mission?.shared_driver_id||0);
  const executingTenantDriverName=String(mission?.executing_tenant_driver_name||mission?.shared_driver_name||"");

  const viewerIsExecutingTenant=shared;
  const partnerExecution=Boolean(executingTenantId)||viewerIsExecutingTenant;
  const directExecutorExecution=Boolean(directExecutorId||directExecutorName)&&!viewerIsExecutingTenant;
  const ownerExecution=!partnerExecution&&!directExecutorExecution;

  let responsibilityOwner=partnerExecution?"tenant":directExecutorExecution?"executor":"owner";
  let responsibilityCompanyId=partnerExecution?(executingTenantId||null):Number(mission?.company_id||0);
  let responsibilityCompanyName=partnerExecution?(executingTenantName||"Executing tenant"):String(mission?.company_name||mission?.owner_company_name||"");

  const validDriverId=partnerExecution?executingTenantDriverId:(ownerExecution?ownerLocalDriverId:0);
  const validDriverName=partnerExecution?executingTenantDriverName:(ownerExecution?ownerLocalDriverName:"");
  const executionResolved=directExecutorExecution||Boolean(validDriverId);

  const marketplace=!shared&&!partnerExecution&&!directExecutorExecution&&Number(mission?.public_enabled||0)===1&&!ownerLocalDriverId;
  const networkPending=!shared&&!partnerExecution&&!directExecutorExecution&&!marketplace&&!ownerLocalDriverId&&Number(mission?.network_pending_invitation_id||0)>0;

  let status="unassigned",label="Driver assignment required",reason="Execution responsibility has no valid assignee.",assignee="Unassigned",assignmentSource=null,requiresAction=false;

  if(completed){
    status="completed";label="Assignment closed";reason="The mission is completed.";
    assignee=validDriverName||directExecutorName||"Completed";
  }else if(directExecutorExecution){
    status="external_executor";label="Independent executor assigned";reason="Execution is owned by an approved independent executor.";
    assignee=directExecutorName||"Independent executor";assignmentSource="executor";
  }else if(partnerExecution&&executingTenantDriverId){
    status=viewerIsExecutingTenant?"assigned":"partner_assigned";label=viewerIsExecutingTenant?"Driver assigned":"Execution partner assigned driver";
    reason=`${executingTenantName||"Executing tenant"} assigned ${executingTenantDriverName||"a driver"} for execution.`;
    assignee=executingTenantDriverName||"Assigned driver";assignmentSource="executing_tenant";
  }else if(partnerExecution){
    status=viewerIsExecutingTenant&&!executingTenantId?"assignment_required":"partner_assignment_pending";
    label="Execution partner driver pending";
    reason=`${executingTenantName||"Executing tenant"} has not assigned a driver for this mission yet.`;
    assignee=executingTenantName||"Executing tenant";assignmentSource="executing_tenant";
    requiresAction=viewerIsExecutingTenant;
  }else if(ownerLocalDriverId){
    status="assigned";label="Driver assigned";reason="The owning tenant assigned its driver for execution.";
    assignee=ownerLocalDriverName||"Assigned driver";assignmentSource="owner";
  }else if(marketplace){
    status="marketplace";label="Available on ForYou";reason="The mission is waiting for an approved execution request.";
    assignee="ForYou";assignmentSource="foryou";
  }else if(networkPending){
    status="network_waiting";label="Waiting for Trusted Network";reason="A trusted partner invitation is pending. Execution selection is already in progress.";
    assignee=String(mission?.network_pending_recipient_name||"Trusted Network");assignmentSource="network";
  }else{
    status="assignment_required";label="Assign a driver";reason="No active driver currently owns execution of this mission.";
    requiresAction=true;
  }

  return {
    status,label,reason,assignee,shared,completed,marketplace,networkPending,
    responsibilityOwner,responsibilityCompanyId:responsibilityCompanyId||null,responsibilityCompanyName:responsibilityCompanyName||null,
    executingTenantId:executingTenantId||null,executingTenantName:executingTenantName||null,
    driverId:validDriverId||null,driverName:validDriverName||null,
    executorId:directExecutorId||null,executorName:directExecutorName||null,
    assignmentSource,
    executionResolved,
    partnerAssignmentMissing:status==="partner_assignment_pending",
    viewerMustAssign:requiresAction,
    requiresAction,
    canAssign:!readOnlyRequest&&assignmentWindow.mutable&&requiresAction&&!marketplace&&!networkPending&&!directExecutorExecution,
    canReassign:!readOnlyRequest&&assignmentWindow.mutable&&Boolean(validDriverId)&&(viewerIsExecutingTenant||ownerExecution),
    assignmentMutable:!readOnlyRequest&&assignmentWindow.mutable,
    assignmentLockReason:assignmentWindow.reason,
    assignmentWindow:assignmentWindow.mode,
    authority:"mission_assignments",
    readModel:"mission_active_assignment_projection",
    actionLabel:validDriverId?"CHANGE DRIVER":"ASSIGN DRIVER"
  };
}
