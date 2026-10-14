export async function listAvailablePublicMissions(env, session=null) {
  // ForYou is private in 10.35.5. No mission is discoverable through a marketplace listing.
  // Existing callers retain the function contract but receive no public discovery rows.
  return [];
}

export async function findPublicMission(env, missionId) {
  return null;
}

export async function findMissionForPrivateRequest(env, missionId, accessCode, requesterCompanyId=null, requesterExecutorId=null){
  const {resolveMissionByAccessCode}=await import('./mission-access-code.repository.js');
  const resolved=await resolveMissionByAccessCode(env,accessCode);
  if(!resolved || Number(resolved.mission.id)!==Number(missionId))return null;
  if(requesterCompanyId && Number(resolved.mission.company_id)===Number(requesterCompanyId))return null;
  return resolved.mission;
}

export async function createTenantPublicRequest(env, mission, session, message, custodyDriverId=null) {
  if(Number(mission.company_id)===Number(session.tenantId)){
    const e=new Error("You already own this mission");e.status=409;throw e;
  }
  const active=await env.DB.prepare(`
    SELECT id FROM mission_tenant_access
    WHERE mission_id=? AND access_company_id=? AND status='active' LIMIT 1
  `).bind(mission.id,session.tenantId).first();
  if(active)return {id:Number(active.id),alreadyApproved:true};

  const existing=await env.DB.prepare(`
    SELECT id,status FROM public_mission_requests
    WHERE mission_id=? AND requester_company_id=? ORDER BY id DESC LIMIT 1
  `).bind(mission.id,session.tenantId).first();
  if(existing?.status==="Pending")return {id:Number(existing.id),alreadyPending:true};

  const busy=await env.DB.prepare(`
    SELECT id FROM public_mission_requests
    WHERE mission_id=? AND status='Pending' LIMIT 1
  `).bind(mission.id).first();
  if(busy)return {id:Number(busy.id),queueBusy:true};

  const company=await env.DB.prepare(`SELECT name FROM companies WHERE id=? LIMIT 1`).bind(session.tenantId).first();
  try{
    const result=await env.DB.prepare(`
      INSERT INTO public_mission_requests (
        company_id,mission_id,requester_name,requester_email,requester_phone,requester_message,
        status,created_at,requester_type,requester_company_id,requester_identity_id,custody_driver_id
      ) VALUES (?,?,?,?,?,?,'Pending',CURRENT_TIMESTAMP,'tenant',?,?,?)
    `).bind(
      mission.company_id,mission.id,company?.name||"Logistics tenant",session.login||"","",message||"",
      session.tenantId,session.identityId||null,Number(custodyDriverId||0)||null
    ).run();
    return {id:Number(result.meta.last_row_id)};
  }catch(error){
    if(/UNIQUE|constraint/i.test(String(error?.message||"")))return {id:0,queueBusy:true};
    throw error;
  }
}

export async function createExecutorPublicRequest(env, mission, executor, message) {
  const active=await env.DB.prepare(`
    SELECT id FROM mission_assignments WHERE mission_id=? AND assignee_type='executor' AND assignee_id=? AND assignment_type='executor' AND status='active' LIMIT 1
  `).bind(mission.id,executor.id).first();
  if(active)return {id:Number(active.id),alreadyApproved:true};

  const existing=await env.DB.prepare(`
    SELECT id,status FROM public_mission_requests
    WHERE mission_id=? AND executor_id=? ORDER BY id DESC LIMIT 1
  `).bind(mission.id,executor.id).first();
  if(existing?.status==="Pending")return {id:Number(existing.id),alreadyPending:true};

  const busy=await env.DB.prepare(`
    SELECT id FROM public_mission_requests
    WHERE mission_id=? AND status='Pending' LIMIT 1
  `).bind(mission.id).first();
  if(busy)return {id:Number(busy.id),queueBusy:true};

  try{
    const result=await env.DB.prepare(`
      INSERT INTO public_mission_requests (
        company_id,mission_id,requester_name,requester_email,requester_phone,requester_message,
        status,created_at,executor_id,requester_type
      ) VALUES (?,?,?,?,?,?,'Pending',CURRENT_TIMESTAMP,?,'executor')
    `).bind(
      mission.company_id,mission.id,executor.display_name,executor.email,executor.mobile||"",message||"",executor.id
    ).run();
    return {id:Number(result.meta.last_row_id)};
  }catch(error){
    if(/UNIQUE|constraint/i.test(String(error?.message||"")))return {id:0,queueBusy:true};
    throw error;
  }
}

export async function listPublicRequests(env, tenantId, filters = {}) {
  const result=await env.DB.prepare(`
    SELECT r.*,m.reference,m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,m.updated_at AS mission_updated_at,m.state_version AS mission_state_version,
      pei.display_name AS executor_name,pei.email AS executor_email,
      pep.registered_company_name AS executor_company,pep.company_category AS executor_category,
      pep.working_cities AS executor_cities,pep.working_zip_codes AS executor_zip_codes,
      pep.vehicle_types AS executor_vehicle_types,pep.description AS executor_description,
      rc.name AS requester_company_name,
      rai.display_name AS requester_admin_name,rai.email AS requester_admin_email
    FROM public_mission_requests r
    JOIN mission_canonical_projection m ON m.id=r.mission_id AND m.company_id=r.company_id
    LEFT JOIN public_executor_identities pei ON pei.id=r.executor_id
    LEFT JOIN public_executor_profiles pep ON pep.executor_id=r.executor_id
    LEFT JOIN companies rc ON rc.id=r.requester_company_id
    LEFT JOIN auth_identities rai ON rai.id=r.requester_identity_id
    WHERE r.company_id=?
    ORDER BY r.id DESC
    LIMIT ? OFFSET ?
  `).bind(tenantId, Math.min(Math.max(Number(filters.limit)||100,1),201), Math.min(Math.max(Number(filters.offset)||0,0),50000)).all();
  return result.results||[];
}

export async function findRequest(env, tenantId, requestId) {
  return env.DB.prepare(`
    SELECT r.*,m.reference,m.company_id AS owner_company_id,m.public_enabled,m.status AS mission_status,m.updated_at AS mission_updated_at,m.state_version AS mission_state_version
    FROM public_mission_requests r
    JOIN mission_canonical_projection m ON m.id=r.mission_id AND m.company_id=r.company_id
    WHERE r.id=? AND r.company_id=? LIMIT 1
  `).bind(requestId,tenantId).first();
}

export async function approveRequestStatus(env,tenantId,requestId){
  return env.DB.prepare(`UPDATE public_mission_requests SET status='Approved',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='Pending'`).bind(requestId,tenantId).run();
}
export async function cancelTenantPublicRequest(env,tenantId,requestId){
  return env.DB.prepare(`
    UPDATE public_mission_requests
    SET status='Cancelled',updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND requester_type='tenant' AND requester_company_id=? AND status='Pending'
  `).bind(Number(requestId),Number(tenantId)).run();
}

export async function cancelExecutorPublicRequest(env,executorId,requestId){
  return env.DB.prepare(`
    UPDATE public_mission_requests
    SET status='Cancelled',updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND requester_type='executor' AND executor_id=? AND status='Pending'
  `).bind(Number(requestId),Number(executorId)).run();
}

export async function declineRequest(env,tenantId,requestId){
  return env.DB.prepare(`UPDATE public_mission_requests SET status='Declined',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='Pending'`).bind(requestId,tenantId).run();
}

export async function deletePublicMissionData(env,tenantId,missionId){
  const {canonicalAssignmentRevokeStatements}=await import('../security/mission-assignment-authority.service.js');
  await env.DB.batch([
    ...canonicalAssignmentRevokeStatements(env,{companyId:Number(tenantId),missionId:Number(missionId),reason:'public_mission_data_deleted'}),
    env.DB.prepare(`DELETE FROM mission_tenant_access WHERE owner_company_id=? AND mission_id=?`).bind(tenantId,missionId),
    env.DB.prepare(`DELETE FROM public_mission_requests WHERE company_id=? AND mission_id=?`).bind(tenantId,missionId)
  ]);
}

export async function revokeApprovedMissionRequests(env,tenantId,missionId){
  return env.DB.prepare(`
    UPDATE public_mission_requests
    SET status='Revoked',updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND mission_id=? AND status='Approved'
  `).bind(Number(tenantId),Number(missionId)).run();
}

export async function closeOtherPendingRequests(env,tenantId,missionId,approvedRequestId){
  return env.DB.prepare(`
    UPDATE public_mission_requests
    SET status='Declined',updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND mission_id=? AND status='Pending' AND id!=?
  `).bind(Number(tenantId),Number(missionId),Number(approvedRequestId)).run();
}

export async function closePublicMarketplace(env,tenantId,missionId){
  return env.DB.batch([
    env.DB.prepare(`
      UPDATE public_mission_requests SET status='Declined',updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND mission_id=? AND status='Pending'
    `).bind(Number(tenantId),Number(missionId)),
    env.DB.prepare(`
      UPDATE public_mission_requests SET status='Revoked',updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND mission_id=? AND status='Approved'
    `).bind(Number(tenantId),Number(missionId)),
    env.DB.prepare(`UPDATE mission_access_codes SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE owner_company_id=? AND mission_id=? AND status='active'`).bind(Number(tenantId),Number(missionId))
  ]);
}

export async function findApprovedMissionRequest(env,companyId,missionId){
  return env.DB.prepare(`
    SELECT * FROM public_mission_requests
    WHERE company_id=? AND mission_id=? AND status='Approved'
    ORDER BY id DESC LIMIT 1
  `).bind(Number(companyId),Number(missionId)).first();
}
