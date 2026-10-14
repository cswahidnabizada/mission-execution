import {canonicalFirst} from "../../../core/canonical-db.js";
export async function forYouState(env,session,mission){
  const missionId=Number(mission.id),ownerId=Number(mission.company_id||0);
  let row=null,relation="none";
  let privateShare=null;
    privateShare=await canonicalFirst(env,`SELECT id,status,code_version,expires_at,created_at,last_used_at,use_count FROM mission_access_codes WHERE mission_id=? AND owner_company_id=? AND status='active' ORDER BY id DESC LIMIT 1`,[missionId,ownerId],'mission_access_code_authority');
    if(session.role==="admin"&&Number(session.tenantId)===ownerId){
      row=await canonicalFirst(env,`
        SELECT r.id,r.status,r.requester_type,r.requester_company_id,r.executor_id,r.updated_at,r.created_at,c.name AS requester_company_name
        FROM public_mission_requests r
        LEFT JOIN companies c ON c.id=r.requester_company_id
        WHERE r.company_id=? AND r.mission_id=?
        ORDER BY CASE WHEN r.status='Pending' THEN 0 ELSE 1 END,
                 COALESCE(r.updated_at,r.created_at) DESC,r.id DESC LIMIT 1
      `,[ownerId,missionId],'mission_request_authority');
      relation="owner";
    }else if(session.role==="admin"){
      row=await canonicalFirst(env,`
        SELECT r.id,r.status,r.requester_type,r.requester_company_id,r.executor_id,r.updated_at,r.created_at,c.name AS requester_company_name
        FROM public_mission_requests r
        LEFT JOIN companies c ON c.id=r.requester_company_id
        WHERE r.mission_id=? AND r.requester_company_id=?
        ORDER BY COALESCE(r.updated_at,r.created_at) DESC,r.id DESC LIMIT 1
      `,[missionId,Number(session.tenantId)],'mission_request_authority');
      relation="requester";
    }else if(session.role==="executor"){
      row=await canonicalFirst(env,`
        SELECT id,status,requester_type,requester_company_id,executor_id,updated_at,created_at
        FROM public_mission_requests
        WHERE mission_id=? AND executor_id=?
        ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT 1
      `,[missionId,Number(session.executorId)],'mission_request_authority');
      relation="requester";
    }
  // A pending request is an active owner decision regardless of older request history.
  // Keep the projection stable even when several historical request rows exist.
  const status=String(row?.status||"none");
  const requesterType=String(row?.requester_type||((session?.role==="executor")?"executor":session?.role==="admin"?"tenant":"")||"");
  return Object.freeze({
    feature:"foryou",relation,id:Number(row?.id||0)||null,status,requesterCompanyId:Number(row?.requester_company_id||0)||null,requesterCompanyName:String(row?.requester_company_name||""),requesterType,
    pending:status==="Pending",accepted:status==="Approved",rejected:status==="Declined",revoked:status==="Revoked",
    private:Boolean(privateShare),privateShare:privateShare?{version:Number(privateShare.code_version||1),expiresAt:privateShare.expires_at||null,useCount:Number(privateShare.use_count||0)}:null
  });
}
