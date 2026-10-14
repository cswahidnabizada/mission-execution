export async function listMissions(env, tenantId, filters = {}) {
  let sql = `
    SELECT m.*, c.name AS company_name, nc.company_name AS customer_name, COALESCE(CASE WHEN ca.assignee_type='driver' AND ca.assignment_type='owner_driver' THEN cad.name END,d.name) AS driver_name, pei.display_name AS executor_name, CASE WHEN ca.assignee_type='driver' AND ca.assignment_type='owner_driver' THEN ca.assignee_id END AS owner_driver_id, CASE WHEN ca.assignee_type='executor' THEN ca.assignee_id END AS assigned_executor_id,
      (SELECT mta.access_company_id FROM mission_tenant_access mta WHERE mta.mission_id=m.id AND mta.owner_company_id=m.company_id AND mta.status='active' ORDER BY COALESCE(mta.approved_at,mta.updated_at,mta.created_at) DESC,mta.id DESC LIMIT 1) AS executing_tenant_id,
      (SELECT ec.name FROM mission_tenant_access mta JOIN companies ec ON ec.id=mta.access_company_id WHERE mta.mission_id=m.id AND mta.owner_company_id=m.company_id AND mta.status='active' ORDER BY COALESCE(mta.approved_at,mta.updated_at,mta.created_at) DESC,mta.id DESC LIMIT 1) AS executing_tenant_name,
      (SELECT mtda.assignee_id FROM mission_tenant_access mta LEFT JOIN mission_active_assignment_projection mtda ON mtda.mission_id=mta.mission_id AND mtda.company_id=mta.owner_company_id AND mtda.assignee_company_id=mta.access_company_id WHERE mta.mission_id=m.id AND mta.owner_company_id=m.company_id AND mta.status='active' ORDER BY COALESCE(mta.approved_at,mta.updated_at,mta.created_at) DESC,mta.id DESC LIMIT 1) AS executing_tenant_driver_id,
      (SELECT ed.name FROM mission_tenant_access mta LEFT JOIN mission_active_assignment_projection mtda ON mtda.mission_id=mta.mission_id AND mtda.company_id=mta.owner_company_id AND mtda.assignee_company_id=mta.access_company_id LEFT JOIN drivers ed ON ed.id=mtda.assignee_id AND ed.company_id=mta.access_company_id WHERE mta.mission_id=m.id AND mta.owner_company_id=m.company_id AND mta.status='active' ORDER BY COALESCE(mta.approved_at,mta.updated_at,mta.created_at) DESC,mta.id DESC LIMIT 1) AS executing_tenant_driver_name,
      (SELECT ni.id FROM network_mission_invitations ni WHERE ni.owner_company_id=m.company_id AND ni.mission_id=m.id AND ni.status='Pending' ORDER BY ni.id DESC LIMIT 1) AS network_pending_invitation_id,
      (SELECT ni.recipient_type FROM network_mission_invitations ni WHERE ni.owner_company_id=m.company_id AND ni.mission_id=m.id AND ni.status='Pending' ORDER BY ni.id DESC LIMIT 1) AS network_pending_recipient_type,
      (SELECT r.id FROM public_mission_requests r WHERE r.company_id=m.company_id AND r.mission_id=m.id AND r.status='Approved' AND r.requester_type='tenant' ORDER BY COALESCE(r.updated_at,r.created_at) DESC,r.id DESC LIMIT 1) AS foryou_approved_request_id,
      (SELECT r.requester_company_id FROM public_mission_requests r WHERE r.company_id=m.company_id AND r.mission_id=m.id AND r.status='Approved' AND r.requester_type='tenant' ORDER BY COALESCE(r.updated_at,r.created_at) DESC,r.id DESC LIMIT 1) AS foryou_approved_requester_company_id,
      (SELECT rc.name FROM public_mission_requests r LEFT JOIN companies rc ON rc.id=r.requester_company_id WHERE r.company_id=m.company_id AND r.mission_id=m.id AND r.status='Approved' AND r.requester_type='tenant' ORDER BY COALESCE(r.updated_at,r.created_at) DESC,r.id DESC LIMIT 1) AS foryou_approved_requester_company_name,
      (SELECT COALESCE(rc.name,pei2.display_name,'Trusted partner') FROM network_mission_invitations ni LEFT JOIN companies rc ON rc.id=ni.recipient_company_id LEFT JOIN public_executor_identities pei2 ON pei2.id=ni.recipient_executor_id WHERE ni.owner_company_id=m.company_id AND ni.mission_id=m.id AND ni.status='Pending' ORDER BY ni.id DESC LIMIT 1) AS network_pending_recipient_name,
      (SELECT mm.message FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id AND mm.sender_role='admin' ORDER BY mm.id ASC LIMIT 1) AS mission_message,
      (SELECT COUNT(*) FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id) AS message_count,
      (SELECT COUNT(*) FROM mission_files mf WHERE mf.mission_id=m.id AND mf.company_id=m.company_id) AS file_count
    FROM mission_canonical_projection m
    JOIN companies c ON c.id=m.company_id
    LEFT JOIN network_customers nc ON nc.id=m.customer_id AND nc.company_id=m.company_id
    LEFT JOIN mission_active_assignment_projection ca ON ca.mission_id=m.id AND ca.company_id=m.company_id
    LEFT JOIN drivers d ON d.id=CASE WHEN ca.assignment_type='owner_driver' AND ca.assignee_type='driver' THEN ca.assignee_id END AND d.company_id=m.company_id
    LEFT JOIN drivers cad ON cad.id=ca.assignee_id AND cad.company_id=ca.assignee_company_id AND ca.assignee_type='driver'
    LEFT JOIN public_executor_identities pei ON pei.id=ca.assignee_id AND ca.assignee_type='executor'
    WHERE m.company_id=?`;
  const binds = [tenantId];

  if (filters.driverId) { sql += " AND ca.assignee_type='driver' AND ca.assignment_type='owner_driver' AND ca.assignee_id=?"; binds.push(filters.driverId); }
  if (filters.missionId) { sql += " AND m.id=?"; binds.push(filters.missionId); }
  if (filters.status) { sql += " AND m.status=?"; binds.push(filters.status); }
  if(filters.activeOnly){sql += " AND m.status NOT IN (?, ?, ?)";binds.push("Completed","Cancelled","Canceled");}
  if (filters.date) { sql += " AND m.mission_date=?"; binds.push(filters.date); }

  if (filters.search) {
    const q = `%${String(filters.search).toLowerCase()}%`;
    sql += ` AND (
      LOWER(m.reference) LIKE ? OR
      LOWER(COALESCE(m.pickup_company,'')) LIKE ? OR
      LOWER(COALESCE(m.pickup_address,'')) LIKE ? OR
      LOWER(COALESCE(m.delivery_company,'')) LIKE ? OR
      LOWER(COALESCE(m.delivery_address,'')) LIKE ? OR
      LOWER(COALESCE(d.name,'')) LIKE ? OR
      LOWER(COALESCE(pei.display_name,'')) LIKE ? OR
      LOWER(COALESCE(c.name,'')) LIKE ? OR
      LOWER(COALESCE(nc.company_name,'')) LIKE ? OR
      LOWER(COALESCE(m.public_description,'')) LIKE ? OR
      LOWER(COALESCE(m.status,'')) LIKE ? OR
      LOWER(COALESCE(m.mission_date,'')) LIKE ? OR
      LOWER(COALESCE(m.pickup_time,'')) LIKE ? OR
      LOWER(COALESCE(m.delivery_time,'')) LIKE ? OR
      EXISTS (SELECT 1 FROM mission_messages sm WHERE sm.mission_id=m.id AND sm.company_id=m.company_id AND LOWER(COALESCE(sm.message,'')) LIKE ?)
    )`;
    binds.push(q,q,q,q,q,q,q,q,q,q,q,q,q,q,q);
  }

  const limit = Math.min(Math.max(Number(filters.limit)||100,1),201);
  const offset = Math.min(Math.max(Number(filters.offset)||0,0),50000);
  sql += " ORDER BY m.updated_at DESC, m.id DESC LIMIT ? OFFSET ?";
  binds.push(limit, offset);
  const result = await env.DB.prepare(sql).bind(...binds).all();
  return result.results || [];
}

export async function findMission(env, tenantId, missionId) {
  return env.DB.prepare(`
    SELECT m.*, c.name AS company_name, nc.company_name AS customer_name, COALESCE(CASE WHEN ca.assignee_type='driver' AND ca.assignment_type='owner_driver' THEN cad.name END,d.name) AS driver_name, pei.display_name AS executor_name, CASE WHEN ca.assignee_type='driver' AND ca.assignment_type='owner_driver' THEN ca.assignee_id END AS owner_driver_id, CASE WHEN ca.assignee_type='executor' THEN ca.assignee_id END AS assigned_executor_id,
      (SELECT mta.access_company_id FROM mission_tenant_access mta WHERE mta.mission_id=m.id AND mta.owner_company_id=m.company_id AND mta.status='active' ORDER BY COALESCE(mta.approved_at,mta.updated_at,mta.created_at) DESC,mta.id DESC LIMIT 1) AS executing_tenant_id,
      (SELECT ec.name FROM mission_tenant_access mta JOIN companies ec ON ec.id=mta.access_company_id WHERE mta.mission_id=m.id AND mta.owner_company_id=m.company_id AND mta.status='active' ORDER BY COALESCE(mta.approved_at,mta.updated_at,mta.created_at) DESC,mta.id DESC LIMIT 1) AS executing_tenant_name,
      (SELECT mtda.assignee_id FROM mission_tenant_access mta LEFT JOIN mission_active_assignment_projection mtda ON mtda.mission_id=mta.mission_id AND mtda.company_id=mta.owner_company_id AND mtda.assignee_company_id=mta.access_company_id WHERE mta.mission_id=m.id AND mta.owner_company_id=m.company_id AND mta.status='active' ORDER BY COALESCE(mta.approved_at,mta.updated_at,mta.created_at) DESC,mta.id DESC LIMIT 1) AS executing_tenant_driver_id,
      (SELECT ed.name FROM mission_tenant_access mta LEFT JOIN mission_active_assignment_projection mtda ON mtda.mission_id=mta.mission_id AND mtda.company_id=mta.owner_company_id AND mtda.assignee_company_id=mta.access_company_id LEFT JOIN drivers ed ON ed.id=mtda.assignee_id AND ed.company_id=mta.access_company_id WHERE mta.mission_id=m.id AND mta.owner_company_id=m.company_id AND mta.status='active' ORDER BY COALESCE(mta.approved_at,mta.updated_at,mta.created_at) DESC,mta.id DESC LIMIT 1) AS executing_tenant_driver_name,
      (SELECT ni.id FROM network_mission_invitations ni WHERE ni.owner_company_id=m.company_id AND ni.mission_id=m.id AND ni.status='Pending' ORDER BY ni.id DESC LIMIT 1) AS network_pending_invitation_id,
      (SELECT ni.recipient_type FROM network_mission_invitations ni WHERE ni.owner_company_id=m.company_id AND ni.mission_id=m.id AND ni.status='Pending' ORDER BY ni.id DESC LIMIT 1) AS network_pending_recipient_type,
      (SELECT r.id FROM public_mission_requests r WHERE r.company_id=m.company_id AND r.mission_id=m.id AND r.status='Approved' AND r.requester_type='tenant' ORDER BY COALESCE(r.updated_at,r.created_at) DESC,r.id DESC LIMIT 1) AS foryou_approved_request_id,
      (SELECT r.requester_company_id FROM public_mission_requests r WHERE r.company_id=m.company_id AND r.mission_id=m.id AND r.status='Approved' AND r.requester_type='tenant' ORDER BY COALESCE(r.updated_at,r.created_at) DESC,r.id DESC LIMIT 1) AS foryou_approved_requester_company_id,
      (SELECT rc.name FROM public_mission_requests r LEFT JOIN companies rc ON rc.id=r.requester_company_id WHERE r.company_id=m.company_id AND r.mission_id=m.id AND r.status='Approved' AND r.requester_type='tenant' ORDER BY COALESCE(r.updated_at,r.created_at) DESC,r.id DESC LIMIT 1) AS foryou_approved_requester_company_name,
      (SELECT COALESCE(rc.name,pei2.display_name,'Trusted partner') FROM network_mission_invitations ni LEFT JOIN companies rc ON rc.id=ni.recipient_company_id LEFT JOIN public_executor_identities pei2 ON pei2.id=ni.recipient_executor_id WHERE ni.owner_company_id=m.company_id AND ni.mission_id=m.id AND ni.status='Pending' ORDER BY ni.id DESC LIMIT 1) AS network_pending_recipient_name,
      (SELECT mm.message FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id AND mm.sender_role='admin' ORDER BY mm.id ASC LIMIT 1) AS mission_message,
      (SELECT COUNT(*) FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id) AS message_count,
      (SELECT COUNT(*) FROM mission_files mf WHERE mf.mission_id=m.id AND mf.company_id=m.company_id) AS file_count
    FROM mission_canonical_projection m
    JOIN companies c ON c.id=m.company_id
    LEFT JOIN network_customers nc ON nc.id=m.customer_id AND nc.company_id=m.company_id
    LEFT JOIN mission_active_assignment_projection ca ON ca.mission_id=m.id AND ca.company_id=m.company_id
    LEFT JOIN drivers d ON d.id=CASE WHEN ca.assignment_type='owner_driver' AND ca.assignee_type='driver' THEN ca.assignee_id END AND d.company_id=m.company_id
    LEFT JOIN drivers cad ON cad.id=ca.assignee_id AND cad.company_id=ca.assignee_company_id AND ca.assignee_type='driver'
    LEFT JOIN public_executor_identities pei ON pei.id=ca.assignee_id AND ca.assignee_type='executor'
    WHERE m.id=? AND m.company_id=? LIMIT 1
  `).bind(missionId, tenantId).first();
}

export async function findMissionByReference(env, tenantId, reference, excludeId = 0) {
  let sql = "SELECT id FROM missions WHERE company_id=? AND reference=?";
  const binds = [tenantId, reference];
  if (excludeId) { sql += " AND id != ?"; binds.push(excludeId); }
  sql += " LIMIT 1";
  return env.DB.prepare(sql).bind(...binds).first();
}

export async function peekNextMissionReference(env, tenantId) {
  const counter = await env.DB.prepare(`
    SELECT next_value FROM mission_reference_counters WHERE company_id=? LIMIT 1
  `).bind(tenantId).first();

  if (counter?.next_value) return `SN:${Number(counter.next_value)}`;

  const existing = await env.DB.prepare(`
    SELECT MAX(CAST(SUBSTR(reference,4) AS INTEGER)) AS max_ref
    FROM missions
    WHERE company_id=? AND reference GLOB 'SN:[0-9]*'
  `).bind(tenantId).first();

  return `SN:${Number(existing?.max_ref || 100000) + 1}`;
}

export async function allocateMissionReference(env, tenantId) {
  const row = await env.DB.prepare(`
    INSERT INTO mission_reference_counters (company_id,next_value,updated_at)
    VALUES (?,100002,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id) DO UPDATE SET
      next_value=mission_reference_counters.next_value+1,
      updated_at=CURRENT_TIMESTAMP
    RETURNING next_value-1 AS reference_number
  `).bind(tenantId).first();

  return `SN:${Number(row.reference_number)}`;
}

export async function insertMission(env, tenantId, data) {
  const result = await env.DB.prepare(`
    INSERT INTO missions (
      company_id, reference, mission_date, mission_end_time,
      pickup_time, delivery_time, deadline_at, pickup_at_utc, delivery_at_utc, deadline_at_utc, schedule_timezone,
      status, status_changed_at, public_enabled, public_description, customer_id,
      capability_code, objective, responsibility_mode, country_code, sector_code, product_definition_id, lifecycle_definition_id, mission_context_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    tenantId, data.reference, data.missionDate, data.missionEndTime || null,
    data.pickupTime || null, data.deliveryTime || null, data.deadlineAt || null,
    data.pickupAtUtc || null, data.deliveryAtUtc || null, data.deadlineAtUtc || null, data.scheduleTimezone || null,
    data.publicEnabled ? 1 : 0, data.publicDescription || "", data.customerId||null,
    data.capabilityCode||null, data.objective||null, data.responsibilityMode||null, data.countryCode||null, data.sectorCode||null, data.productDefinitionId||null, data.lifecycleDefinitionId||null, JSON.stringify(data.missionContext||{})
  ).run();
  const missionId=Number(result.meta.last_row_id);
  const {canonicalLogisticsStatements}=await import('./mission-logistics.repository.js');
  await env.DB.batch(canonicalLogisticsStatements(env,{companyId:Number(tenantId),missionId,data}));
  if(data.driverId){
    const {canonicalAssignmentStatements}=await import('../security/mission-assignment-authority.service.js');
    await env.DB.batch(canonicalAssignmentStatements(env,{companyId:Number(tenantId),missionId,assignmentType:'owner_driver',assigneeType:'driver',assigneeId:Number(data.driverId),assigneeCompanyId:Number(tenantId),sourceType:'mission_create'}));
  }
  return missionId;
}

export async function updateMissionDetails(env, tenantId, missionId, data, lockToken=null) {
  const result=await env.DB.prepare(`
    UPDATE missions
    SET mission_date=?, mission_end_time=?, pickup_time=?, delivery_time=?, deadline_at=?,
        pickup_at_utc=?, delivery_at_utc=?, deadline_at_utc=?, schedule_timezone=?,
        public_description=?, customer_id=?, capability_code=?, objective=?, responsibility_mode=?, country_code=?, sector_code=?, product_definition_id=?, lifecycle_definition_id=?, mission_context_json=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=? AND (? IS NULL OR state_lock_token=?)
  `).bind(
    data.missionDate, data.missionEndTime || null,
    data.pickupTime || null, data.deliveryTime || null, data.deadlineAt || null,
    data.pickupAtUtc || null, data.deliveryAtUtc || null, data.deadlineAtUtc || null, data.scheduleTimezone || null,
    data.publicDescription || "",data.customerId||null,data.capabilityCode||null,data.objective||null,data.responsibilityMode||null,data.countryCode||null,data.sectorCode||null,data.productDefinitionId||null,data.lifecycleDefinitionId||null,JSON.stringify(data.missionContext||{}),
    missionId, tenantId, lockToken, lockToken
  ).run();
  if(lockToken!==null&&Number(result?.meta?.changes||0)!==1)throw makeLeaseLost();
  const {canonicalLogisticsStatements}=await import('./mission-logistics.repository.js');
  await env.DB.batch(canonicalLogisticsStatements(env,{companyId:Number(tenantId),missionId,data}));
}

export async function deleteMissionRow(env, tenantId, missionId, lockToken=null) {
  await env.DB.prepare(`DELETE FROM missions WHERE id=? AND company_id=? AND (? IS NULL OR state_lock_token=?)`)
    .bind(missionId, tenantId, lockToken, lockToken).run();
}

export async function updateMissionAssignment(env,tenantId,missionId,{driverId,publicEnabled,publicDescription},lockToken=null){
  const {canonicalAssignmentStatements,canonicalAssignmentRevokeStatements}=await import('../security/mission-assignment-authority.service.js');
  const canonical=driverId==null
    ? canonicalAssignmentRevokeStatements(env,{companyId:Number(tenantId),missionId:Number(missionId),assignmentType:'owner_driver',reason:'mission_assignment_cleared'})
    : canonicalAssignmentStatements(env,{companyId:Number(tenantId),missionId:Number(missionId),assignmentType:'owner_driver',assigneeType:'driver',assigneeId:Number(driverId),assigneeCompanyId:Number(tenantId),sourceType:'mission_assignment'});
  return env.DB.batch([
    ...canonical,
    env.DB.prepare(`UPDATE missions SET public_enabled=?,public_description=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND (? IS NULL OR state_lock_token=?)`).bind(publicEnabled?1:0,publicDescription||"",missionId,tenantId,lockToken,lockToken)
  ]);
}

export async function listStatusHistory(env,missionId){
  const r=await env.DB.prepare(`
    SELECT id,status,created_at
    FROM mission_status_history
    WHERE mission_id=?
    ORDER BY id DESC
  `).bind(missionId).all();
  return r.results||[];
}


export async function listOpenExceptions(env,tenantId,missionIds=[]){
  const ids=[...new Set((missionIds||[]).map(Number).filter(Boolean))];
  if(!ids.length)return [];
  const q=ids.map(()=>"?").join(",");
  const r=await env.DB.prepare(`
    SELECT id,company_id,mission_id,driver_id,executor_id,exception_type,severity,note,status,
      created_by_role,created_at,resolved_at,resolved_by_role,updated_at
    FROM mission_exceptions
    WHERE company_id=? AND mission_id IN (${q}) AND status='open'
    ORDER BY created_at DESC,id DESC
  `).bind(Number(tenantId),...ids).all();
  return r.results||[];
}

export async function listOpenAttentionMessages(env,tenantId,missionIds=[]){
  const ids=[...new Set((missionIds||[]).map(Number).filter(Boolean))];
  if(!ids.length)return [];
  const q=ids.map(()=>"?").join(",");
  const r=await env.DB.prepare(`
    SELECT id,mission_id,sender_role,message,created_at
    FROM mission_messages
    WHERE company_id=? AND mission_id IN (${q})
      AND attention_required=1 AND attention_resolved_at IS NULL
    ORDER BY created_at DESC,id DESC
  `).bind(Number(tenantId),...ids).all();
  return r.results||[];
}

export async function listExceptionsForMission(env,tenantId,missionId){
  const r=await env.DB.prepare(`
    SELECT id,company_id,mission_id,driver_id,executor_id,exception_type,severity,note,status,
      created_by_role,created_at,resolved_at,resolved_by_role,updated_at
    FROM mission_exceptions WHERE company_id=? AND mission_id=?
    ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,id DESC
  `).bind(Number(tenantId),Number(missionId)).all();
  return r.results||[];
}

export async function insertException(env,data){
  const r=await env.DB.prepare(`
    INSERT INTO mission_exceptions(
      company_id,mission_id,driver_id,executor_id,exception_type,severity,note,status,created_by_role
    ) VALUES (?,?,?,?,?,?,?,'open',?)
  `).bind(
    Number(data.tenantId),Number(data.missionId),data.driverId||null,data.executorId||null,
    data.exceptionType,data.severity,data.note||"",data.createdByRole
  ).run();
  return Number(r.meta.last_row_id);
}

export async function findOpenException(env,tenantId,missionId,exceptionId){
  return env.DB.prepare(`
    SELECT id,company_id,mission_id,driver_id,executor_id,exception_type,severity,status,created_by_role
    FROM mission_exceptions
    WHERE company_id=? AND mission_id=? AND id=? AND status='open'
    LIMIT 1
  `).bind(Number(tenantId),Number(missionId),Number(exceptionId)).first();
}

export async function resolveException(env,tenantId,missionId,exceptionId,role,lockToken=null){
  return env.DB.prepare(`
    UPDATE mission_exceptions
    SET status='resolved',resolved_at=COALESCE(resolved_at,CURRENT_TIMESTAMP),
      resolved_by_role=?,updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND mission_id=? AND id=? AND status='open'
      AND (? IS NULL OR EXISTS(SELECT 1 FROM missions m WHERE m.id=? AND m.company_id=? AND m.state_lock_token=?))
  `).bind(role,Number(tenantId),Number(missionId),Number(exceptionId),lockToken,Number(missionId),Number(tenantId),lockToken).run();
}

export async function touchMission(env,tenantId,missionId,lockToken=null){
  const r=await env.DB.prepare(`UPDATE missions SET updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=? AND (? IS NULL OR state_lock_token=?)`)
    .bind(Number(tenantId),Number(missionId),lockToken,lockToken).run();
  if(lockToken!==null&&Number(r?.meta?.changes||0)!==1)throw makeLeaseLost();
}


export async function resolveAllExceptions(env,tenantId,missionId,role="system"){
  await env.DB.prepare(`
    UPDATE mission_exceptions
    SET status='resolved',resolved_at=COALESCE(resolved_at,CURRENT_TIMESTAMP),
      resolved_by_role=COALESCE(resolved_by_role,?),updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND mission_id=? AND status='open'
  `).bind(role,Number(tenantId),Number(missionId)).run();
}

function makeLeaseLost(){const e=new Error("MUTATION_LEASE_LOST");e.status=409;return e;}
