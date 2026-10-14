import * as messageRepo from "../../repositories/message.repository.js";
import {audit} from "../../security/audit.js";
import {recordTransitionEvent} from "./transition-safety.service.js";

import {MISSION_PRE_CUSTODY_STATUSES, MISSION_CUSTODY_STATUSES, MISSION_TERMINAL_STATUSES} from "../../domains/logistics/logistics-lifecycle.contract.js";
import {transitionMissionStatus} from "./mission-transition.service.js";
import {canonicalAssignmentRevokeStatements} from "../../security/mission-assignment-authority.service.js";
export const PRE_CUSTODY_STATUSES=MISSION_PRE_CUSTODY_STATUSES;
export const CUSTODY_STATUSES=MISSION_CUSTODY_STATUSES;
export const TERMINAL_STATUSES=MISSION_TERMINAL_STATUSES;

export async function prepareExecutionTransition(env,session,mission,{reason="execution_actor_change",mutationFence=null}={}){
  const status=String(mission?.status||"Pending");
  if(TERMINAL_STATUSES.includes(status))throw make("Closed missions cannot change execution responsibility",409);
  if(CUSTODY_STATUSES.includes(status))throw make("Execution ownership cannot change after pickup without custody resolution",409);
  if(!PRE_CUSTODY_STATUSES.includes(status))throw make(`Mission status ${status} cannot change execution responsibility`,409);

  const companyId=Number(mission.company_id),missionId=Number(mission.id);
  if(status!=="Arrived"){
    return Object.freeze({rebased:false,from:status,to:status,companyId,missionId});
  }

  const changed=await transitionMissionStatus(env,{companyId,missionId,expectedStatus:"Arrived",nextStatus:"Pending",lockToken:mutationFence?.lockToken});
  if(!changed.changed)throw make("Mission changed while execution transition was being prepared. Refresh and try again.",409);

  const actor=session?.displayName||session?.companyName||"Mission management";
  await messageRepo.insertMessage(env,{
    tenantId:companyId,missionId,senderRole:"system",message:
      `${actor} changed execution responsibility · previous execution phase Arrived was reset to Pending for the new execution actor`,
    messageType:"text"
  });
  await audit(env,{
    session:{...session,tenantId:companyId},
    action:"mission.execution.rebased",resourceType:"mission",resourceId:missionId,
    metadata:{from:"Arrived",to:"Pending",reason}
  });
  await recordTransitionEvent(env,session,{
    companyId,missionId,eventType:"execution_rebased",fromStatus:"Arrived",toStatus:"Pending",reasonCode:reason
  });
  return Object.freeze({rebased:true,from:"Arrived",to:"Pending",companyId,missionId});
}

export async function ensureOwnerUnassignedPending(env,{companyId,missionId}={}){
  const result=await env.DB.batch([
    ...canonicalAssignmentRevokeStatements(env,{companyId:Number(companyId),missionId:Number(missionId),reason:'ensure_owner_unassigned'}),
    env.DB.prepare(`UPDATE missions SET public_enabled=0,public_description='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='Pending'`).bind(Number(missionId),Number(companyId))
  ]);
  if(Number(result?.meta?.changes||0)!==1){
    throw make("Execution reclaim could not establish a clean Pending mission state",409);
  }

  const row=await env.DB.prepare(`
    SELECT m.id,m.status,m.public_enabled,oa.assignee_id AS owner_driver_id
    FROM missions m LEFT JOIN mission_active_assignment_projection oa ON oa.mission_id=m.id AND oa.company_id=m.company_id AND oa.assignment_type='owner_driver' AND oa.assignee_type='driver'
    WHERE m.id=? AND m.company_id=? LIMIT 1
  `).bind(Number(missionId),Number(companyId)).first();

  if(!row||String(row.status)!=="Pending"||Number(row.owner_driver_id||0)!==0||Number(row.public_enabled||0)!==0){
    throw make("Execution reclaim postcondition failed",409);
  }
  return Object.freeze({status:"Pending",assigned:false,public:false});
}

export async function atomicMissionTransition(env,{companyId,missionId,expectedStatus,nextStatus,statements=[],lockToken=null}={}){
  const result=await transitionMissionStatus(env,{companyId,missionId,expectedStatus,nextStatus,statements,lockToken});
  if(!result.changed)throw make("Mission changed before this transition could complete. Refresh and try again.",409);
  return [Object.freeze({meta:{changes:1}})];
}

function make(message,status){const e=new Error(message);e.status=status;return e;}
