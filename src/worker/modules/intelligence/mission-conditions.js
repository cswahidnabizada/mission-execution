import {buildAssignmentState} from "../assignments/assignment.engine.js";
import {buildMissionContext,isMissionContext} from "./mission-context.js";
import {deriveExecutionPerspective} from "./execution-perspective.engine.js";

import {MISSION_STATUS_FLOW} from "../../domains/logistics/logistics-lifecycle.contract.js";
export const STATUS_FLOW=MISSION_STATUS_FLOW;

export function buildMissionConditions(input,{role="",accessKind="owner",now=Date.now()}={}){
  const context=isMissionContext(input)?input:buildMissionContext(input,{role,accessKind,now});
  // Keep Mission Context read-only and normalized. Do not depend on a hidden raw mission object.
  // Assignment Intelligence still receives the exact fields it needs, reconstructed from
  // the canonical normalized context without creating a second source of truth.
  const mission=missionFromContext(context);
  const effectiveRole=context.role||role;
  const effectiveAccess=context.accessKind||accessKind;
  const effectiveNow=Number(context.now||now);

  const status=context.lifecycle.status;
  const statusIndex=context.lifecycle.statusIndex;
  const completed=context.lifecycle.completed;
  const terminal=context.lifecycle.terminal===true;
  const assignment=buildAssignmentState(mission,{accessKind:effectiveAccess});

  const deadlineAt=context.schedule.deadlineAt;
  const pickupAt=context.schedule.pickupAt;
  const statusSince=context.timestamps.statusChangedAt;
  const updatedAt=context.timestamps.updatedAt;

  const deadlineRemainingMs=deadlineAt===null?null:deadlineAt-effectiveNow;
  const statusAgeMs=statusSince===null?0:Math.max(0,effectiveNow-statusSince);
  const updateAgeMs=updatedAt===null?0:Math.max(0,effectiveNow-updatedAt);

  const deadline=deadlineCondition(deadlineRemainingMs,terminal);
  const pickup=pickupCondition({status,pickupAt,now:effectiveNow,completed:terminal,statusAgeMs});
  const progress=progressCondition({status,completed:terminal,statusAgeMs,updateAgeMs});
  const canAdvance=["admin","driver","executor"].includes(effectiveRole)&&!terminal;
  const canAssign=effectiveRole==="admin"&&(assignment.canAssign||assignment.canReassign);

  const result={
    context,
    missionId:context.identity.missionId,
    reference:context.identity.reference,
    role:effectiveRole,
    accessKind:effectiveAccess,
    status,
    statusIndex,
    completed,
    terminal,
    source:{
      shared:assignment.shared,
      marketplace:assignment.marketplace,
      publicEnabled:context.distribution.publicEnabled,
      owned:context.distribution.owned
    },
    route:context.route,
    responsibility:{
      status:assignment.status,
      resolved:!assignment.requiresAction&&!assignment.marketplace,
      assignmentRequired:assignment.requiresAction,
      marketplaceWaiting:assignment.marketplace,
      networkWaiting:Boolean(assignment.networkPending),
      assignee:assignment.assignee,
      driverId:assignment.driverId||null,
      driverName:assignment.driverName||null,
      executorId:assignment.executorId||null,
      executorName:assignment.executorName||null,
      assignmentSource:assignment.assignmentSource||null,
      responsibilityOwner:assignment.responsibilityOwner||null,
      responsibilityCompanyId:assignment.responsibilityCompanyId||null,
      responsibilityCompanyName:assignment.responsibilityCompanyName||null,
      executingTenantId:assignment.executingTenantId||null,
      executingTenantName:assignment.executingTenantName||null,
      partnerAssignmentMissing:Boolean(assignment.partnerAssignmentMissing),
      viewerMustAssign:Boolean(assignment.viewerMustAssign),
      executionResolved:Boolean(assignment.executionResolved),
      canAssign,
      canReassign:effectiveRole==="admin"&&assignment.canReassign,
      assignmentMutable:Boolean(assignment.assignmentMutable),
      assignmentLockReason:assignment.assignmentLockReason||null,
      assignmentWindow:assignment.assignmentWindow||null
    },
    time:{
      deadline,
      deadlineAt,
      deadlineRemainingMs,
      pickup,
      // compatibility alias for downstream engines during staged migration
      actionOne:pickup,
      pickupAt,
      statusAgeMs,
      statusAgeMinutes:Math.floor(statusAgeMs/60000),
      updateAgeMs,
      updateAgeMinutes:Math.floor(updateAgeMs/60000)
    },
    progress:{
      ...progress,
      nextStatus:context.lifecycle.nextStatus,
      canAdvance
    },
    dataQuality:{
      ...context.dataQuality,
      missingRequired:[
        !context.dataQuality.hasReference&&"reference",
        !context.dataQuality.hasPickupAddress&&"pickup_address",
        !context.dataQuality.hasDeliveryAddress&&"delivery_address"
      ].filter(Boolean)
    },
    proof:context.proof,
    capability:{
      canAssign,
      canAdvance,
      canView:true,
      canResolve:["admin","driver","executor"].includes(effectiveRole)
    }
  };
  result.perspective=deriveExecutionPerspective(result,{role:effectiveRole});
  return result;
}

function deadlineCondition(remaining,completed){
  if(completed||remaining===null)return "none";
  if(remaining<=0)return "overdue";
  if(remaining<=15*60*1000)return "critical";
  if(remaining<=30*60*1000)return "soon";
  if(remaining<=60*60*1000)return "watch";
  return "safe";
}

function pickupCondition({status,pickupAt,now,completed,statusAgeMs}){
  if(completed||["PickedUp","InTransit","Delivered","Completed"].includes(status))return "complete";
  if(status==="Arrived"&&statusAgeMs>20*60*1000)return "waiting";
  if(pickupAt===null)return status==="Arrived"?"active":"unscheduled";
  if(now>pickupAt+15*60*1000&&["Pending","Arrived"].includes(status))return "late";
  if(now>=pickupAt)return "due";
  return "upcoming";
}

function progressCondition({status,completed,statusAgeMs,updateAgeMs}){
  if(completed)return {state:"complete",stalled:false};
  if(status==="Delivered"&&statusAgeMs>15*60*1000)return {state:"incomplete",stalled:true,reason:"delivered_not_completed"};
  if(status==="Arrived"&&statusAgeMs>20*60*1000)return {state:"waiting",stalled:true,reason:"arrival_wait"};
  if(status!=="Pending"&&updateAgeMs>45*60*1000)return {state:"stale",stalled:true,reason:"no_recent_update"};
  return {state:"progressing",stalled:false,reason:null};
}

function missionFromContext(context){
  const e=context.execution||{},d=context.distribution||{},i=context.identity||{};
  return {
    id:i.missionId,
    reference:i.reference,
    company_id:i.ownerCompanyId,
    owner_company_name:i.ownerCompanyName,
    status:context.lifecycle?.status,
    driver_id:e.ownerDriverId||e.driverId||null,
    owner_driver_name:e.ownerDriverName||e.driverName||"",
    driver_name:e.driverName||"",
    shared_driver_id:e.sharedDriverId||null,
    shared_driver_name:e.driverName||"",
    assigned_executor_id:e.ownerExecutorId||e.executorId||null,
    owner_assigned_executor_id:e.ownerExecutorId||null,
    executor_name:e.executorName||"",
    owner_executor_name:e.ownerExecutorName||"",
    executing_tenant_id:e.executingTenantId||null,
    executing_tenant_name:e.executingTenantName||"",
    executing_tenant_driver_id:e.executingTenantDriverId||null,
    executing_tenant_driver_name:e.executingTenantDriverName||"",
    shared_access:d.shared?1:0,
    public_enabled:d.publicEnabled?1:0
  };
}
