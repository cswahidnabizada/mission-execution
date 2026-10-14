export async function listOpenRequirements(env,companyId,missionId){
  const r=await env.DB.prepare(`
    SELECT * FROM mission_management_requirements
    WHERE company_id=? AND mission_id=? AND status='open'
    ORDER BY created_at ASC,id ASC
  `).bind(Number(companyId),Number(missionId)).all();
  return r.results||[];
}
export async function findOpenRequirement(env,companyId,missionId,code,actorType,actorId){
  return env.DB.prepare(`
    SELECT * FROM mission_management_requirements
    WHERE company_id=? AND mission_id=? AND code=? AND requested_actor_type=?
      AND COALESCE(requested_actor_id,0)=COALESCE(?,0) AND status='open'
    ORDER BY id DESC LIMIT 1
  `).bind(Number(companyId),Number(missionId),String(code),String(actorType),actorId?Number(actorId):null).first();
}
export async function createRequirement(env,d){
  const r=await env.DB.prepare(`
    INSERT INTO mission_management_requirements(
      company_id,mission_id,code,requested_actor_type,requested_actor_id,
      requested_by_role,requested_by_identity_id,payload_json
    ) VALUES(?,?,?,?,?,?,?,?)
  `).bind(
    Number(d.companyId),Number(d.missionId),String(d.code),String(d.actorType),d.actorId?Number(d.actorId):null,
    String(d.requestedByRole),d.requestedByIdentityId?Number(d.requestedByIdentityId):null,
    d.payload?JSON.stringify(d.payload):null
  ).run();
  return Number(r.meta.last_row_id);
}
export async function resolveRequirement(env,companyId,missionId,id,{role,identityId,actorType=null,actorId=null}={}){
  const normalizedActorType=actorType?String(actorType):null;
  const normalizedActorId=actorId?Number(actorId):null;
  const result=await env.DB.prepare(`
    UPDATE mission_management_requirements
    SET status='resolved',resolved_at=CURRENT_TIMESTAMP,resolved_by_role=?,resolved_by_identity_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND mission_id=? AND id=? AND status='open'
      AND (
        requested_actor_type IS NULL
        OR (requested_actor_type=? AND COALESCE(requested_actor_id,0)=COALESCE(?,0))
      )
  `).bind(
    String(role),identityId?Number(identityId):null,Number(companyId),Number(missionId),Number(id),
    normalizedActorType,normalizedActorId
  ).run();
  if(Number(result.meta?.changes||0)!==1)throw requirementResolutionDenied();
  return result;
}

function requirementResolutionDenied(){
  const error=new Error('Requirement resolution is not authorized for this actor');
  error.status=403;
  error.code='REQUIREMENT_ACTOR_MISMATCH';
  return error;
}
export async function cancelOpenRequirements(env,companyId,missionId){
  return env.DB.prepare(`
    UPDATE mission_management_requirements
    SET status='cancelled',updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND mission_id=? AND status='open'
  `).bind(Number(companyId),Number(missionId)).run();
}
