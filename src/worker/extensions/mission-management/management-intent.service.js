import * as messageRepo from "../../repositories/message.repository.js";
import {resolveMissionAccess} from "../../security/mission-access.js";
import {audit} from "../../security/audit.js";
import {requireWorkTrust} from "../../modules/verification/verification.service.js";
import {findOpenRequirement,createRequirement,resolveRequirement} from "./requirements/management-requirement.repository.js";
import {managementEvent} from "./events/management-event.builder.js";
import {cancelMissionManaged} from "./cancellation/cancellation.service.js";
import {reactivateMissionManaged} from "./lifecycle/reactivation.service.js";
import {openCustodyTransfer,confirmCustodyRelease,finalizeCustodyTransfer,acceptCustody,abortCustodyTransfer,reassignReceivingDriver} from "./custody-responsibility/canonical-custody-responsibility.service.js";
import {getCanonicalMissionAssignment} from "../../security/mission-assignment-authority.service.js";

export async function executeManagementIntent(env,session,missionId,intent,input={},mutationFence=null){
  await requireWorkTrust(env,session);
  const access=await resolveMissionAccess(env,session,Number(missionId));
  if(!access)throw make("Mission not found or access denied",404);
  const mission=access.mission,tenantId=Number(access.tenantId);

  if(intent==="cancel_mission"){
    return cancelMissionManaged(env,session,missionId,{reasonCode:input.reasonCode,note:input.note,mutationFence});
  }
  if(intent==="reactivate_mission"){
    return reactivateMissionManaged(env,session,missionId,mutationFence);
  }
  if(intent==="start_custody_resolution"){
    return openCustodyTransfer(env,session,missionId,{
      channel:input.channel,targetDriverId:input.targetDriverId,
      recipientType:input.recipientType,recipientId:input.recipientId,note:input.note,recovery:Boolean(input.recovery)
    });
  }
  if(intent==="confirm_custody_release"){
    return confirmCustodyRelease(env,session,missionId,{requirementId:input.requirementId});
  }
  if(intent==="finalize_custody_transfer"){
    return finalizeCustodyTransfer(env,session,missionId);
  }
  if(intent==="accept_custody"){
    return acceptCustody(env,session,missionId,{requirementId:input.requirementId});
  }
  if(intent==="reassign_custody_receiver"){
    return reassignReceivingDriver(env,session,missionId,{targetDriverId:input.targetDriverId});
  }
  if(intent==="start_custody_recovery"){
    return openCustodyTransfer(env,session,missionId,{
      channel:input.channel||"driver",targetDriverId:input.targetDriverId,
      recipientType:input.recipientType,recipientId:input.recipientId,note:input.note,recovery:true
    });
  }
  if(intent==="abort_custody_transfer"){
    return abortCustodyTransfer(env,session,missionId);
  }

  if(intent==="request_current_location"){
    if(session.role!=="admin"||access.accessKind!=="owner")throw make("Only the owning tenant can request execution location",403);
    const actor=await executionActor(env,tenantId,missionId);
    if(!actor)throw make("No active driver or executor is available for a location request",409);
    const existing=await findOpenRequirement(env,tenantId,missionId,"current_location",actor.type,actor.id);
    if(existing)return {requirementId:Number(existing.id),status:"already_open"};

    const id=await createRequirement(env,{
      companyId:tenantId,missionId,code:"current_location",actorType:actor.type,actorId:actor.id,
      requestedByRole:session.role,requestedByIdentityId:identityId(session),
      payload:{requestedByName:actorName(session)}
    });
    const text=managementEvent("location_requested",{actorName:actorName(session),reference:mission.reference,missionId});
    await messageRepo.insertMessage(env,{tenantId,missionId:Number(missionId),senderRole:"system",message:text,messageType:"text",attentionRequired:true});
    await audit(env,{session:{...session,tenantId},action:"mission.management.location_requested",resourceType:"mission",resourceId:Number(missionId),metadata:{requirementId:id,actorType:actor.type,actorId:actor.id}});
    return {requirementId:id,status:"open",message:text};
  }

  if(["share_current_location","resolve_traffic","resolve_waiting","start_navigation"].includes(intent)){
    // The physical action is performed by the secured operational surface first.
    // This endpoint records completion only for the exact actor that the canonical
    // requirement targeted. Discovery/shared-read access can never resolve it.
    const actor=managementActor(session);
    if(!actor)throw make("Only the assigned executor or driver can complete this operational requirement",403);
    const reqId=Number(input.requirementId||0)||null;
    if(!reqId)throw make("A canonical operational requirement is required",400);
    await resolveRequirement(env,tenantId,missionId,reqId,{
      role:session.role,identityId:identityId(session),actorType:actor.type,actorId:actor.id
    });
    const eventType={
      share_current_location:"location_shared",
      resolve_traffic:"traffic_resolved",
      resolve_waiting:"waiting_resolved",
      start_navigation:"navigation_started"
    }[intent];
    const text=managementEvent(eventType,{actorName:actorName(session),reference:mission.reference,missionId});
    await messageRepo.insertMessage(env,{tenantId,missionId:Number(missionId),senderRole:"system",driverId:session.role==="driver"?Number(session.driverId):null,message:text,messageType:"text"});
    await audit(env,{session:{...session,tenantId},action:`mission.management.${intent}`,resourceType:"mission",resourceId:Number(missionId),metadata:{requirementId:reqId}});
    return {status:"recorded",message:text};
  }

  throw make("Unsupported mission management intent",400);
}

function managementActor(session){
  if(session?.role==="driver")return Number(session.driverId||0)>0?{type:"driver",id:Number(session.driverId)}:null;
  if(session?.role==="executor")return Number(session.executorId||0)>0?{type:"executor",id:Number(session.executorId)}:null;
  return null;
}

async function executionActor(env,companyId,missionId){
  const assignment=await getCanonicalMissionAssignment(env,Number(companyId),Number(missionId));
  if(!assignment)return null;
  const type=String(assignment.assignee_type||"").toLowerCase();
  if(type!=="driver"&&type!=="executor")return null;
  return {type,id:Number(assignment.assignee_id||0)||null};
}
function identityId(s){return Number(s.authIdentityId||s.userId||s.driverId||s.executorId||s.tenantId||0)||null;}
function actorName(s){return s.displayName||s.driverName||s.companyName||(s.role==="executor"?"Executor":s.role==="driver"?"Driver":"Tenant admin");}
function make(message,status){const e=new Error(message);e.status=status;return e;}
