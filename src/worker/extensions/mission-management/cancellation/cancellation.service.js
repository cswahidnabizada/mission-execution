import * as missionRepo from "../../../repositories/mission.repository.js";
import * as messageRepo from "../../../repositories/message.repository.js";
import {resolveMissionAccess} from "../../../security/mission-access.js";
import {audit} from "../../../security/audit.js";
import {requireWorkTrust} from "../../../modules/verification/verification.service.js";
import {closeExternalExecutionForOwner,closeInactiveDistributionSources} from "../custody-responsibility/canonical-custody-responsibility.service.js";
import {cancelOpenRequirements} from "../requirements/management-requirement.repository.js";
import {CANCELLATION_REASONS} from "./cancellation.policy.js";
import {managementEvent} from "../events/management-event.builder.js";
import {insertLifecycleEvent} from "../lifecycle/mission-lifecycle.repository.js";
import {recordTransitionEvent} from "../../../modules/transitions/transition-safety.service.js";
import {transitionMissionStatus} from "../../../modules/transitions/mission-transition.service.js";
import {canonicalAssignmentRevokeStatements} from "../../../security/mission-assignment-authority.service.js";

export async function cancelMissionManaged(env,session,missionId,{reasonCode,note="",mutationFence=null}={}){
  await requireWorkTrust(env,session);
  if(session.role!=="admin")throw make("Only a tenant administrator can cancel this mission",403);
  const access=await resolveMissionAccess(env,session,Number(missionId));
  if(!access||access.accessKind!=="owner")throw make("Only the owning tenant can cancel this mission",403);
  const mission=access.mission,status=String(mission.status||"Pending");
  if(["Completed","Cancelled","Canceled"].includes(status))throw make("Mission is already closed",409);
  if(["PickedUp","InTransit"].includes(status))throw make("Cancellation while physical custody is active requires custody resolution",409);
  if(status==="Delivered")throw make("Delivered missions cannot be cancelled because delivery is already confirmed. Resolve any completion blocker or take back completion responsibility instead.",409);
  if(!CANCELLATION_REASONS.includes(String(reasonCode||"")))throw make("Choose a valid cancellation reason",400);
  if(String(reasonCode)==="other"&&!String(note||"").trim())throw make("Add a short cancellation note",400);

  const tenantId=Number(access.tenantId),actorName=session.displayName||session.companyName||"Tenant admin";
  await closeExternalExecutionForOwner(env,{ownerCompanyId:tenantId,missionId:Number(missionId)});
  await closeInactiveDistributionSources(env,{ownerCompanyId:tenantId,missionId:Number(missionId)});
  await cancelOpenRequirements(env,tenantId,missionId);

  const changed=await transitionMissionStatus(env,{
    companyId:tenantId,missionId:Number(missionId),expectedStatus:status,nextStatus:"Cancelled",lockToken:mutationFence?.lockToken,
    statements:[
      ...canonicalAssignmentRevokeStatements(env,{companyId:tenantId,missionId:Number(missionId),reason:'mission_cancelled'}),
      env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='Cancelled'`).bind(Number(missionId),tenantId),
      env.DB.prepare(`INSERT OR IGNORE INTO mission_cancellations(company_id,mission_id,reason_code,note,cancelled_by_role,cancelled_by_identity_id,cancelled_by_name,mission_status_before) VALUES(?,?,?,?,?,?,?,?)`).bind(tenantId,Number(missionId),String(reasonCode),String(note||"").slice(0,500),session.role,Number(session.authIdentityId||session.userId||0)||null,actorName,status)
    ]
  });
  if(!changed.changed)throw make("Mission changed while cancellation was being prepared. Refresh and try again.",409);

  await insertLifecycleEvent(env,{
    companyId:tenantId,missionId,eventType:"cancelled",reasonCode:String(reasonCode),
    note:String(note||"").slice(0,500),actorRole:session.role,
    actorIdentityId:Number(session.authIdentityId||session.userId||0)||null,
    actorName,previousStatus:status,nextStatus:"Cancelled"
  });

  await recordTransitionEvent(env,session,{companyId:tenantId,missionId:Number(missionId),eventType:"mission_cancelled",fromStatus:status,toStatus:"Cancelled",reasonCode:String(reasonCode),metadata:{note:String(note||"").slice(0,500)}});

  const text=managementEvent("cancelled",{actorName,reference:mission.reference,missionId,reasonCode,note:String(note||"").slice(0,160)});
  await messageRepo.insertMessage(env,{tenantId,missionId:Number(missionId),senderRole:"system",message:text,messageType:"text"});
  await audit(env,{session:{...session,tenantId},action:"mission.management.cancel",resourceType:"mission",resourceId:Number(missionId),metadata:{reasonCode,statusBefore:status}});
  return {missionId:Number(missionId),status:"Cancelled",message:text};
}
function make(message,status){const e=new Error(message);e.status=status;return e;}
