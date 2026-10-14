import * as driverWorkspaceRepo from "../../../repositories/driver-workspace.repository.js";

export async function assignmentState(env,session,mission,conditions){
  const r=conditions?.responsibility||{},p=conditions?.perspective||{};
  const acquisitionWaiting=Boolean(r.marketplaceWaiting||r.networkWaiting);
  const assigned=Boolean(r.executionResolved||r.driverId||r.executorId);
  const driverId=Number(r.driverId||0)||null;
  const status=String(conditions?.status||mission?.status||"Pending");
  const physicalCustody=["PickedUp","InTransit"].includes(status);
  const assignmentMutable=r.assignmentMutable!==false && !physicalCustody;
  let driverAvailable=null,driverSituation=null;

  if(driverId){
    try{
      const companyId=p.isExecutingTenant?Number(session.tenantId):Number(mission.company_id||session.tenantId);
      const profile=await driverWorkspaceRepo.getProfile(env,companyId,driverId);
      driverSituation=profile?String(profile.situation||"Available"):"Available";
      driverAvailable=profile?driverSituation!=="Unavailable":null;
    }catch(error){
      console.warn("ACTION_STATE_ASSIGNMENT_PROFILE",{missionId:Number(mission.id),error:String(error?.message||error)});
    }
  }

  return Object.freeze({
    feature:"assignment",
    assigned,
    unassigned:!assigned&&!acquisitionWaiting,
    driverId,
    driverAvailable,
    driverSituation,
    assignmentMutable:Boolean(assignmentMutable),
    assignmentLockReason:r.assignmentLockReason||null,
    assignmentWindow:r.assignmentWindow||null,
    assignmentRequired:Boolean(r.assignmentRequired||r.viewerMustAssign),
    acquisitionWaiting,
    partnerAssignmentMissing:Boolean(r.partnerAssignmentMissing),
    canAssign:Boolean(conditions?.capability?.canAssign),
    canReassign:Boolean(
      conditions?.responsibility?.canReassign ??
      (session?.role==="admin" && (p.isOwner || p.isExecutingTenant) && driverId && assignmentMutable)
    ),
    canReclaimExecution:Boolean(
      session?.role==="admin"&&conditions?.perspective?.isOwner&&
      (Number(r.executorId||0)>0||Number(r.executingTenantId||0)>0)&&!conditions?.completed&&
      !["PickedUp","InTransit"].includes(String(conditions?.status||mission?.status||"Pending"))
    ),
    transitionRequired:Boolean(
      conditions?.perspective?.isOwner&&
      (Number(r.executorId||0)>0||Number(r.executingTenantId||0)>0)&&!conditions?.completed
    ),
    transitionType:conditions?.perspective?.isOwner&&Number(r.executorId||0)>0?"executor_to_owner":
      conditions?.perspective?.isOwner&&Number(r.executingTenantId||0)>0?"tenant_to_owner":null,
    executionPaths:Object.freeze(
      session?.role==="admin"&&conditions?.perspective?.isOwner&&!conditions?.completed
        ?["driver","network","foryou"]
        :session?.role==="admin"&&conditions?.perspective?.isExecutingTenant&&!conditions?.completed
          ?["driver"]:[]
    ),
    executorId:Number(r.executorId||0)||null,
    executorName:r.executorName||null,
    executingTenantId:Number(r.executingTenantId||0)||null,
    executingTenantName:r.executingTenantName||null
  });
}
