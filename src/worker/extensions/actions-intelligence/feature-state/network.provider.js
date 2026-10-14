import {networkInvitationMeaning} from "../../../modules/network/network-status.contract.js";
export async function networkState(env,session,mission){
  const missionId=Number(mission.id),ownerId=Number(mission.company_id||0);
  let row=null,relation="none";
  try{
    if(session.role==="admin"&&Number(session.tenantId)===ownerId){
      row=await env.DB.prepare(`
        SELECT id,status,recipient_type,recipient_company_id,recipient_executor_id,updated_at,created_at
        FROM network_mission_invitations
        WHERE mission_id=? AND owner_company_id=?
        ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT 1
      `).bind(missionId,ownerId).first();
      relation="owner";
    }else if(session.role==="admin"){
      row=await env.DB.prepare(`
        SELECT id,status,recipient_type,recipient_company_id,recipient_executor_id,updated_at,created_at
        FROM network_mission_invitations
        WHERE mission_id=? AND recipient_type='tenant' AND recipient_company_id=?
        ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT 1
      `).bind(missionId,Number(session.tenantId)).first();
      relation="recipient";
    }else if(session.role==="executor"){
      row=await env.DB.prepare(`
        SELECT id,status,recipient_type,recipient_company_id,recipient_executor_id,updated_at,created_at
        FROM network_mission_invitations
        WHERE mission_id=? AND recipient_type='executor' AND recipient_executor_id=?
        ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT 1
      `).bind(missionId,Number(session.executorId)).first();
      relation="recipient";
    }
  }catch(error){
    console.warn("ACTION_STATE_NETWORK",{missionId,error:String(error?.message||error)});
  }
  const status=String(row?.status||"none");
  const meaning=networkInvitationMeaning(status);
  return Object.freeze({
    feature:"network",relation,id:Number(row?.id||0)||null,status,
    invitationPending:meaning.pending&&relation==="recipient",
    pending:meaning.pending,accepted:meaning.accepted,
    rejected:meaning.rejected,revoked:meaning.revoked,unavailable:meaning.unavailable
  });
}
