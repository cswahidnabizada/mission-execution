export async function hasTenantAccess(env, missionId, companyId) {
  return env.DB.prepare(`
    SELECT mta.*, m.company_id AS owner_company_id
    FROM mission_tenant_access mta
    JOIN mission_canonical_projection m ON m.id=mta.mission_id AND m.company_id=mta.owner_company_id
    WHERE mta.mission_id=? AND mta.access_company_id=? AND mta.status='active'
    LIMIT 1
  `).bind(missionId,companyId).first();
}

export async function grantTenantAccess(env,{missionId,ownerCompanyId,accessCompanyId,requestId}) {
  return env.DB.prepare(`
    INSERT INTO mission_tenant_access (
      mission_id,owner_company_id,access_company_id,request_id,status,approved_at,created_at,updated_at
    ) VALUES (?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(mission_id,access_company_id) DO UPDATE SET
      request_id=excluded.request_id,status='active',approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
  `).bind(missionId,ownerCompanyId,accessCompanyId,requestId||null).run();
}

export async function listSharedMissionsForTenant(env, companyId, filters={}) {
  let sql=`
    SELECT m.*, c.name AS owner_company_name,nc.company_name AS customer_name,
      sd.assignee_id AS shared_driver_id, d.name AS shared_driver_name,
      oa.assignee_id AS owner_driver_id, od.name AS owner_driver_name, mea.assignee_id AS owner_assigned_executor_id, pei.display_name AS owner_executor_name,
      mta.access_company_id AS executing_tenant_id, (SELECT ec.name FROM companies ec WHERE ec.id=mta.access_company_id) AS executing_tenant_name,
      sd.assignee_id AS executing_tenant_driver_id, d.name AS executing_tenant_driver_name,
      1 AS shared_access,
      (SELECT mm.message FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id AND mm.sender_role='admin' ORDER BY mm.id ASC LIMIT 1) AS mission_message,
      (SELECT COUNT(*) FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id) AS message_count,
      (SELECT COUNT(*) FROM mission_files mf WHERE mf.mission_id=m.id AND mf.company_id=m.company_id) AS file_count
    FROM mission_tenant_access mta
    JOIN mission_canonical_projection m ON m.id=mta.mission_id AND m.company_id=mta.owner_company_id
    JOIN companies c ON c.id=m.company_id
    LEFT JOIN mission_active_assignment_projection oa ON oa.mission_id=m.id AND oa.company_id=m.company_id AND oa.assignment_type='owner_driver' AND oa.assignee_type='driver'
    LEFT JOIN drivers od ON od.id=oa.assignee_id AND od.company_id=m.company_id
    LEFT JOIN mission_active_assignment_projection mea ON mea.mission_id=m.id AND mea.company_id=m.company_id AND mea.assignment_type='executor' AND mea.assignee_type='executor' AND mea.status='active'
    LEFT JOIN public_executor_identities pei ON pei.id=mea.assignee_id
    LEFT JOIN network_customers nc ON nc.id=m.customer_id AND nc.company_id=m.company_id
    LEFT JOIN mission_active_assignment_projection sd
      ON sd.mission_id=m.id AND sd.company_id=m.company_id AND sd.assignee_company_id=mta.access_company_id AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver'
    LEFT JOIN drivers d ON d.id=sd.assignee_id AND d.company_id=sd.assignee_company_id
    WHERE mta.access_company_id=? AND mta.status='active'`;
  const binds=[companyId];
  if(filters.missionId){sql+=" AND m.id=?";binds.push(filters.missionId);}
  if(filters.status){sql+=" AND m.status=?";binds.push(filters.status);}
  if(filters.activeOnly){sql += " AND m.status NOT IN (?, ?, ?)";binds.push("Completed","Cancelled","Canceled");}
  if(filters.date){sql+=" AND m.mission_date=?";binds.push(filters.date);}
  if(filters.search){
    const q=`%${String(filters.search).toLowerCase()}%`;
    sql+=` AND (
      LOWER(m.reference) LIKE ? OR LOWER(COALESCE(m.pickup_company,'')) LIKE ? OR
      LOWER(COALESCE(m.pickup_address,'')) LIKE ? OR LOWER(COALESCE(m.delivery_company,'')) LIKE ? OR
      LOWER(COALESCE(m.delivery_address,'')) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ? OR
      LOWER(COALESCE(nc.company_name,'')) LIKE ? OR LOWER(COALESCE(d.name,'')) LIKE ? OR LOWER(COALESCE(m.public_description,'')) LIKE ? OR
      LOWER(COALESCE(m.status,'')) LIKE ? OR LOWER(COALESCE(m.mission_date,'')) LIKE ? OR
      LOWER(COALESCE(m.pickup_time,'')) LIKE ? OR LOWER(COALESCE(m.delivery_time,'')) LIKE ? OR
      EXISTS (SELECT 1 FROM mission_messages sm WHERE sm.mission_id=m.id AND sm.company_id=m.company_id AND LOWER(COALESCE(sm.message,'')) LIKE ?)
    )`;
    binds.push(q,q,q,q,q,q,q,q,q,q,q,q,q,q);
  }
  const limit=Math.min(Math.max(Number(filters.limit)||100,1),201);
  const offset=Math.min(Math.max(Number(filters.offset)||0,0),50000);
  sql+=" ORDER BY m.updated_at DESC,m.id DESC LIMIT ? OFFSET ?";
  binds.push(limit,offset);
  const r=await env.DB.prepare(sql).bind(...binds).all();
  return r.results||[];
}

export async function findSharedMissionForTenant(env, companyId, missionId) {
  return env.DB.prepare(`
    SELECT m.*, c.name AS owner_company_name,nc.company_name AS customer_name,
      sd.assignee_id AS shared_driver_id,d.name AS shared_driver_name,
      oa.assignee_id AS owner_driver_id, od.name AS owner_driver_name, mea.assignee_id AS owner_assigned_executor_id, pei.display_name AS owner_executor_name,
      mta.access_company_id AS executing_tenant_id, (SELECT ec.name FROM companies ec WHERE ec.id=mta.access_company_id) AS executing_tenant_name,
      sd.assignee_id AS executing_tenant_driver_id, d.name AS executing_tenant_driver_name,
      1 AS shared_access,
      (SELECT mm.message FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id AND mm.sender_role='admin' ORDER BY mm.id ASC LIMIT 1) AS mission_message,
      (SELECT COUNT(*) FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id) AS message_count,
      (SELECT COUNT(*) FROM mission_files mf WHERE mf.mission_id=m.id AND mf.company_id=m.company_id) AS file_count
    FROM mission_tenant_access mta
    JOIN mission_canonical_projection m ON m.id=mta.mission_id AND m.company_id=mta.owner_company_id
    JOIN companies c ON c.id=m.company_id
    LEFT JOIN mission_active_assignment_projection oa ON oa.mission_id=m.id AND oa.company_id=m.company_id AND oa.assignment_type='owner_driver' AND oa.assignee_type='driver'
    LEFT JOIN drivers od ON od.id=oa.assignee_id AND od.company_id=m.company_id
    LEFT JOIN mission_active_assignment_projection mea ON mea.mission_id=m.id AND mea.company_id=m.company_id AND mea.assignment_type='executor' AND mea.assignee_type='executor' AND mea.status='active'
    LEFT JOIN public_executor_identities pei ON pei.id=mea.assignee_id
    LEFT JOIN network_customers nc ON nc.id=m.customer_id AND nc.company_id=m.company_id
    LEFT JOIN mission_active_assignment_projection sd
      ON sd.mission_id=m.id AND sd.company_id=m.company_id AND sd.assignee_company_id=mta.access_company_id AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver'
    LEFT JOIN drivers d ON d.id=sd.assignee_id AND d.company_id=sd.assignee_company_id
    WHERE mta.access_company_id=? AND mta.mission_id=? AND mta.status='active'
    LIMIT 1
  `).bind(companyId,missionId).first();
}



export async function findSharedMissionForDriver(env, companyId, driverId, missionId) {
  return env.DB.prepare(`
    SELECT m.*, c.name AS owner_company_name,nc.company_name AS customer_name,
      sd.assignee_id AS shared_driver_id,d.name AS shared_driver_name,
      oa.assignee_id AS owner_driver_id, od.name AS owner_driver_name, mea.assignee_id AS owner_assigned_executor_id, pei.display_name AS owner_executor_name,
      mta.access_company_id AS executing_tenant_id, (SELECT ec.name FROM companies ec WHERE ec.id=mta.access_company_id) AS executing_tenant_name,
      sd.assignee_id AS executing_tenant_driver_id, d.name AS executing_tenant_driver_name,
      1 AS shared_access,
      (SELECT mm.message FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id AND mm.sender_role='admin' ORDER BY mm.id ASC LIMIT 1) AS mission_message,
      (SELECT COUNT(*) FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id) AS message_count,
      (SELECT COUNT(*) FROM mission_files mf WHERE mf.mission_id=m.id AND mf.company_id=m.company_id) AS file_count
    FROM mission_active_assignment_projection sd
    JOIN mission_tenant_access mta
      ON mta.mission_id=sd.mission_id AND mta.owner_company_id=sd.company_id
      AND mta.access_company_id=sd.assignee_company_id AND mta.status='active' AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver'
    JOIN mission_canonical_projection m ON m.id=sd.mission_id AND m.company_id=sd.company_id
    JOIN companies c ON c.id=m.company_id
    LEFT JOIN mission_active_assignment_projection oa ON oa.mission_id=m.id AND oa.company_id=m.company_id AND oa.assignment_type='owner_driver' AND oa.assignee_type='driver'
    LEFT JOIN drivers od ON od.id=oa.assignee_id AND od.company_id=m.company_id
    LEFT JOIN mission_active_assignment_projection mea ON mea.mission_id=m.id AND mea.company_id=m.company_id AND mea.assignment_type='executor' AND mea.assignee_type='executor' AND mea.status='active'
    LEFT JOIN public_executor_identities pei ON pei.id=mea.assignee_id
    LEFT JOIN network_customers nc ON nc.id=m.customer_id AND nc.company_id=m.company_id
    JOIN drivers d ON d.id=sd.assignee_id AND d.company_id=sd.assignee_company_id
    WHERE sd.assignee_company_id=? AND sd.assignee_id=? AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver' AND sd.mission_id=?
    LIMIT 1
  `).bind(companyId,driverId,missionId).first();
}

export async function listSharedMissionsForDriver(env, companyId, driverId, filters={}) {
  let sql=`
    SELECT m.*, c.name AS owner_company_name,nc.company_name AS customer_name,
      sd.assignee_id AS shared_driver_id,d.name AS shared_driver_name,
      oa.assignee_id AS owner_driver_id, od.name AS owner_driver_name, mea.assignee_id AS owner_assigned_executor_id, pei.display_name AS owner_executor_name,
      mta.access_company_id AS executing_tenant_id, (SELECT ec.name FROM companies ec WHERE ec.id=mta.access_company_id) AS executing_tenant_name,
      sd.assignee_id AS executing_tenant_driver_id, d.name AS executing_tenant_driver_name,
      1 AS shared_access,
      (SELECT mm.message FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id AND mm.sender_role='admin' ORDER BY mm.id ASC LIMIT 1) AS mission_message,
      (SELECT COUNT(*) FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id) AS message_count,
      (SELECT COUNT(*) FROM mission_files mf WHERE mf.mission_id=m.id AND mf.company_id=m.company_id) AS file_count
    FROM mission_active_assignment_projection sd
    JOIN mission_tenant_access mta
      ON mta.mission_id=sd.mission_id AND mta.owner_company_id=sd.company_id
      AND mta.access_company_id=sd.assignee_company_id AND mta.status='active' AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver'
    JOIN mission_canonical_projection m ON m.id=sd.mission_id AND m.company_id=sd.company_id
    JOIN companies c ON c.id=m.company_id
    LEFT JOIN mission_active_assignment_projection oa ON oa.mission_id=m.id AND oa.company_id=m.company_id AND oa.assignment_type='owner_driver' AND oa.assignee_type='driver'
    LEFT JOIN drivers od ON od.id=oa.assignee_id AND od.company_id=m.company_id
    LEFT JOIN mission_active_assignment_projection mea ON mea.mission_id=m.id AND mea.company_id=m.company_id AND mea.assignment_type='executor' AND mea.assignee_type='executor' AND mea.status='active'
    LEFT JOIN public_executor_identities pei ON pei.id=mea.assignee_id
    LEFT JOIN network_customers nc ON nc.id=m.customer_id AND nc.company_id=m.company_id
    JOIN drivers d ON d.id=sd.assignee_id AND d.company_id=sd.assignee_company_id
    WHERE sd.assignee_company_id=? AND sd.assignee_id=? AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver'`;
  const binds=[companyId,driverId];
  if(filters.missionId){sql+=" AND m.id=?";binds.push(filters.missionId);}
  if(filters.status){sql+=" AND m.status=?";binds.push(filters.status);}
  if(filters.activeOnly){sql += " AND m.status NOT IN (?, ?, ?)";binds.push("Completed","Cancelled","Canceled");}
  if(filters.date){sql+=" AND m.mission_date=?";binds.push(filters.date);}
  if(filters.search){
    const q=`%${String(filters.search).toLowerCase()}%`;
    sql+=` AND (
      LOWER(m.reference) LIKE ? OR LOWER(COALESCE(m.pickup_company,'')) LIKE ? OR
      LOWER(COALESCE(m.pickup_address,'')) LIKE ? OR LOWER(COALESCE(m.delivery_company,'')) LIKE ? OR
      LOWER(COALESCE(m.delivery_address,'')) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ? OR
      LOWER(COALESCE(nc.company_name,'')) LIKE ? OR LOWER(COALESCE(d.name,'')) LIKE ? OR LOWER(COALESCE(m.public_description,'')) LIKE ? OR
      LOWER(COALESCE(m.status,'')) LIKE ? OR LOWER(COALESCE(m.mission_date,'')) LIKE ? OR
      LOWER(COALESCE(m.pickup_time,'')) LIKE ? OR LOWER(COALESCE(m.delivery_time,'')) LIKE ? OR
      EXISTS (SELECT 1 FROM mission_messages sm WHERE sm.mission_id=m.id AND sm.company_id=m.company_id AND LOWER(COALESCE(sm.message,'')) LIKE ?)
    )`;
    binds.push(q,q,q,q,q,q,q,q,q,q,q,q,q,q);
  }
  const limit=Math.min(Math.max(Number(filters.limit)||100,1),201);
  const offset=Math.min(Math.max(Number(filters.offset)||0,0),50000);
  sql+=" ORDER BY m.updated_at DESC,m.id DESC LIMIT ? OFFSET ?";
  binds.push(limit,offset);
  const r=await env.DB.prepare(sql).bind(...binds).all();
  return r.results||[];
}

export async function deleteSharedAccessForMission(env, ownerCompanyId, missionId) {
  const {canonicalAssignmentRevokeStatements}=await import('../security/mission-assignment-authority.service.js');
  await env.DB.batch(canonicalAssignmentRevokeStatements(env,{companyId:Number(ownerCompanyId),missionId:Number(missionId),assignmentType:'tenant_driver',reason:'shared_access_removed'}));
  await env.DB.prepare(`DELETE FROM mission_tenant_access WHERE owner_company_id=? AND mission_id=?`).bind(ownerCompanyId,missionId).run();
}
