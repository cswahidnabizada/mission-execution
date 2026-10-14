import * as missionRepo from "../../repositories/mission.repository.js";
import * as publicRepo from "../../repositories/public.repository.js";
import * as networkRepo from "../../repositories/network.repository.js";
import * as messageRepo from "../../repositories/message.repository.js";
import {assertSingleExecutionOwner,withdrawForYouDistribution} from "../mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {requireWorkTrust} from "../../modules/verification/verification.service.js";
import {audit} from "../../security/audit.js";
import {recordTransitionEvent} from "../../modules/transitions/transition-safety.service.js";

export async function withdrawForYou(env,session,missionId,mutationFence=null){ return withdrawForYouDistribution(env,session,missionId,mutationFence); }

export async function withdrawNetworkInvitation(env,session,missionId,mutationFence=null){
  await requireWorkTrust(env,session);
  const tenantId=Number(session.tenantId);
  const mission=await missionRepo.findMission(env,tenantId,Number(missionId));
  if(!mission)throw make("Mission not found",404);
  if(["Completed","Cancelled","Canceled"].includes(String(mission.status||"")))throw make("Closed missions cannot change distribution",409);
  const ownership=await assertSingleExecutionOwner(env,tenantId,Number(missionId));
  if(ownership.ownerCount>0)throw make("Execution is already owned. Use Take Back Execution instead of cancelling the invitation.",409);
  const invitation=await networkRepo.findPendingMissionInvitation(env,tenantId,Number(missionId));
  if(!invitation)return {missionId:Number(missionId),status:"already_withdrawn",alreadyApplied:true};
  await networkRepo.cancelPendingMissionInvitation(env,tenantId,Number(missionId));
  await messageRepo.insertMessage(env,{tenantId,missionId:Number(missionId),senderRole:"system",message:`Mission ${mission.reference} trusted-network invitation was withdrawn`,messageType:"text"});
  await recordTransitionEvent(env,session,{companyId:tenantId,missionId:Number(missionId),eventType:"network_invitation_withdrawn",fromStatus:mission.status,toStatus:mission.status,reasonCode:"owner_withdrew_distribution",metadata:{invitationId:Number(invitation.id)}});
  await audit(env,{session,action:"network.mission.withdraw",resourceType:"mission",resourceId:Number(missionId),metadata:{invitationId:Number(invitation.id)}});
  return {missionId:Number(missionId),status:"withdrawn",missionStatus:String(mission.status||"Pending"),assigned:false};
}
function make(message,status){const e=new Error(message);e.status=status;return e;}
