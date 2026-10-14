import * as messageRepo from "../../../repositories/message.repository.js";
import {resolveMissionAccess} from "../../../security/mission-access.js";
import {audit} from "../../../security/audit.js";
import {requireWorkTrust} from "../../../modules/verification/verification.service.js";
import {insertLifecycleEvent} from "./mission-lifecycle.repository.js";
import {managementEvent} from "../events/management-event.builder.js";
import {recordTransitionEvent} from "../../../modules/transitions/transition-safety.service.js";
import {transitionMissionStatus} from "../../../modules/transitions/mission-transition.service.js";
import {revokeMissionExecutorAssignment} from "../custody-responsibility/canonical-custody-responsibility.service.js";
import {canonicalAssignmentRevokeStatements} from "../../../security/mission-assignment-authority.service.js";

export async function reactivateMissionManaged(env,session,missionId,mutationFence=null){
  await requireWorkTrust(env,session);
  if(session.role!=="admin")throw make("Only a tenant administrator can reactivate this mission",403);
  const access=await resolveMissionAccess(env,session,Number(missionId));
  if(!access||access.accessKind!=="owner")throw make("Only the owning tenant can reactivate this mission",403);
  const mission=access.mission,current=String(mission.status||"");
  if(!["Cancelled","Canceled"].includes(current))throw make("Only a cancelled mission can be reactivated",409);

  const tenantId=Number(access.tenantId),actorName=session.displayName||session.companyName||"Tenant admin";
  const previousExecutor=await env.DB.prepare(`
    SELECT assignee_id AS executor_id,request_id,assigned_at
    FROM mission_assignments
    WHERE company_id=? AND mission_id=? AND status='active'
    ORDER BY id DESC LIMIT 1
  `).bind(tenantId,Number(missionId)).first();

  // Reactivation intentionally restores NO execution/distribution relationship.
  // The normal Assignment / ForYou / Network flow must decide what happens next.
  if(previousExecutor){
    await revokeMissionExecutorAssignment(env,tenantId,Number(missionId),Number(previousExecutor.executor_id));
  }

  const changed=await transitionMissionStatus(env,{
    companyId:tenantId,missionId:Number(missionId),expectedStatus:current,nextStatus:"Pending",lockToken:mutationFence?.lockToken,
    statements:[
      ...canonicalAssignmentRevokeStatements(env,{companyId:tenantId,missionId:Number(missionId),reason:'mission_reactivated'}),
      env.DB.prepare(`UPDATE missions SET public_enabled=0,public_description='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status=?`).bind(Number(missionId),tenantId,current),
      env.DB.prepare(`UPDATE mission_tenant_access SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE owner_company_id=? AND mission_id=? AND status='active'`).bind(tenantId,Number(missionId)),
      env.DB.prepare(`UPDATE public_mission_requests SET status=CASE WHEN status='Pending' THEN 'Declined' WHEN status='Approved' THEN 'Revoked' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND mission_id=? AND status IN ('Pending','Approved')`).bind(tenantId,Number(missionId)),
      env.DB.prepare(`UPDATE network_mission_invitations SET status='Cancelled',responded_at=COALESCE(responded_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE owner_company_id=? AND mission_id=? AND status IN ('Pending','Accepted')`).bind(tenantId,Number(missionId))
    ]
  });
  if(!changed.changed)throw make("Mission changed while reactivation was being prepared. Refresh and try again.",409);

  await insertLifecycleEvent(env,{
    companyId:tenantId,missionId,eventType:"reactivated",actorRole:session.role,
    actorIdentityId:identityId(session),actorName,previousStatus:current,nextStatus:"Pending"
  });

  await recordTransitionEvent(env,session,{
    companyId:tenantId,missionId:Number(missionId),eventType:"mission_reactivated",
    fromStatus:current,toStatus:"Pending",reasonCode:"owner_reactivated",
    metadata:{
      previousExecutorId:Number(previousExecutor?.executor_id||0)||null,
      previousExecutorRequestId:Number(previousExecutor?.request_id||0)||null,
      previousExecutorAssignedAt:previousExecutor?.assigned_at||null,
      previousExecutorState:previousExecutor?"revoked":null
    }
  });

  const text=managementEvent("reactivated",{actorName,reference:mission.reference,missionId});
  await messageRepo.insertMessage(env,{tenantId,missionId:Number(missionId),senderRole:"system",message:text,messageType:"text"});
  await audit(env,{session:{...session,tenantId},action:"mission.management.reactivate",resourceType:"mission",resourceId:Number(missionId),metadata:{statusBefore:current,statusAfter:"Pending"}});

  return {missionId:Number(missionId),status:"Pending",message:text};
}
function identityId(s){return Number(s.authIdentityId||s.userId||s.tenantId||0)||null;}
function make(message,status){const e=new Error(message);e.status=status;return e;}
