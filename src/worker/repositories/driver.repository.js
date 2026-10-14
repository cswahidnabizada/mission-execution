export async function listDrivers(env, tenantId, filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit)||100,1),201);
  const offset = Math.min(Math.max(Number(filters.offset)||0,0),50000);
  const result = await env.DB.prepare(`
    SELECT d.id,d.company_id,d.name,d.active,d.removed_at,d.created_at,
           CASE WHEN ai.id IS NULL THEN 0 ELSE 1 END AS has_login,
           ai.login AS login, ai.last_login_at,
           p.vehicle_type,p.current_location,p.situation,p.situation_note,p.location_updated_at,p.situation_updated_at,
           (
             SELECT COUNT(*) FROM mission_canonical_projection m
             WHERE m.company_id=d.company_id AND EXISTS (SELECT 1 FROM mission_active_assignment_projection ca WHERE ca.mission_id=m.id AND ca.company_id=m.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.assignee_id=d.id) AND m.status NOT IN ('Completed','Cancelled','Canceled')
           ) + (
             SELECT COUNT(*) FROM mission_active_assignment_projection sd
             JOIN mission_canonical_projection sm ON sm.id=sd.mission_id AND sm.company_id=sd.company_id
             WHERE sd.assignee_company_id=d.company_id AND sd.assignee_id=d.id AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver' AND sm.status NOT IN ('Completed','Cancelled','Canceled')
           ) AS active_mission_count,
           COALESCE(
             (SELECT m.reference FROM mission_canonical_projection m WHERE m.company_id=d.company_id AND EXISTS (SELECT 1 FROM mission_active_assignment_projection ca WHERE ca.mission_id=m.id AND ca.company_id=m.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.assignee_id=d.id) AND m.status NOT IN ('Completed','Cancelled','Canceled') ORDER BY datetime(m.updated_at) DESC,m.id DESC LIMIT 1),
             (SELECT sm.reference FROM mission_active_assignment_projection sd JOIN mission_canonical_projection sm ON sm.id=sd.mission_id AND sm.company_id=sd.company_id WHERE sd.assignee_company_id=d.company_id AND sd.assignee_id=d.id AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver' AND sm.status NOT IN ('Completed','Cancelled','Canceled') ORDER BY datetime(sm.updated_at) DESC,sm.id DESC LIMIT 1)
           ) AS current_mission_reference
    FROM drivers d
    LEFT JOIN auth_identities ai
      ON ai.company_id=d.company_id AND ai.driver_id=d.id AND ai.role='driver'
    LEFT JOIN driver_operational_profiles p
      ON p.company_id=d.company_id AND p.driver_id=d.id
    WHERE d.company_id=? AND d.removed_at IS NULL
    ORDER BY d.active DESC,d.name ASC,d.id ASC
    LIMIT ? OFFSET ?
  `).bind(tenantId,limit,offset).all();
  return result.results || [];
}
export const listActiveDrivers = async (env,tenantId)=>(await listDrivers(env,tenantId,{limit:200})).filter(d=>Number(d.active)===1);
export async function findDriver(env, tenantId, driverId) { return env.DB.prepare(`SELECT id,company_id,name,active,removed_at,removed_by_identity_id,removal_reason,created_at FROM drivers WHERE id=? AND company_id=? LIMIT 1`).bind(driverId,tenantId).first(); }
export async function findActiveDriver(env, tenantId, driverId) { return env.DB.prepare(`SELECT id,company_id,name,active FROM drivers WHERE id=? AND company_id=? AND active=1 LIMIT 1`).bind(driverId,tenantId).first(); }
export async function createDriver(env, tenantId, name) { const r=await env.DB.prepare(`INSERT INTO drivers (company_id,name,active) VALUES (?,?,1)`).bind(tenantId,name).run(); return Number(r.meta.last_row_id); }
export async function updateDriverName(env, tenantId, driverId, name) { return env.DB.prepare(`UPDATE drivers SET name=? WHERE id=? AND company_id=?`).bind(name,driverId,tenantId).run(); }
export async function setDriverActive(env, tenantId, driverId, active) { return env.DB.prepare(`UPDATE drivers SET active=? WHERE id=? AND company_id=?`).bind(active?1:0,driverId,tenantId).run(); }
export async function countActiveDrivers(env, tenantId){ const r=await env.DB.prepare(`SELECT COUNT(*) AS count FROM drivers WHERE company_id=? AND active=1`).bind(tenantId).first(); return Number(r?.count||0); }
// Frozen historical assignment archive covered by the driver deletion policy: mission_tenant_driver_assignments.

export async function getDriverDeleteImpact(env,tenantId,driverId){
  const queries={
    missions:`SELECT COUNT(*) AS c FROM mission_active_assignment_projection WHERE company_id=? AND assignee_id=? AND assignee_company_id=? AND assignee_type='driver' AND assignment_type='owner_driver' AND status='active'`,
    legacyMissionReferences:`SELECT COUNT(*) AS c FROM missions WHERE company_id=? AND driver_id=? AND driver_id IS NOT NULL`,
    missionMessages:`SELECT COUNT(*) AS c FROM mission_messages WHERE company_id=? AND driver_id=?`,
    missionFiles:`SELECT COUNT(*) AS c FROM mission_files WHERE company_id=? AND driver_id=?`,
    sharedAssignments:`SELECT COUNT(*) AS c FROM mission_active_assignment_projection WHERE access_company_id=? AND driver_id=?`,
    directMessages:`SELECT COUNT(*) AS c FROM driver_direct_messages WHERE company_id=? AND driver_id=?`,
    notes:`SELECT COUNT(*) AS c FROM driver_daily_notes WHERE company_id=? AND driver_id=?`,
    preferences:`SELECT COUNT(*) AS c FROM driver_content_preferences WHERE company_id=? AND driver_id=?`,
    exceptions:`SELECT COUNT(*) AS c FROM mission_exceptions WHERE company_id=? AND driver_id=?`,
    deliveryProofs:`SELECT COUNT(*) AS c FROM mission_delivery_proofs WHERE company_id=? AND driver_id=?`,
    notifications:`SELECT COUNT(*) AS c FROM notifications WHERE recipient_role='driver' AND recipient_tenant_id=? AND recipient_driver_id=?`,
    awareness:`SELECT COUNT(*) AS c FROM mission_recipient_state WHERE recipient_role='driver' AND recipient_tenant_id=? AND recipient_driver_id=?`
  };
  const result={};
  for(const [name,sql] of Object.entries(queries)){
    try{const binds=name==='missions'?[tenantId,driverId,tenantId]:[tenantId,driverId]; const row=await env.DB.prepare(sql).bind(...binds).first();result[name]=Number(row?.c||0);}catch(error){if(/no such table/i.test(String(error?.message||'')))result[name]=0;else throw error;}
  }
  return result;
}

export async function removeDriverWithPolicy(env,tenantId,driverId,identityId=null,reason="tenant_requested_removal"){
  const impact=await getDriverDeleteImpact(env,tenantId,driverId);
  const {canonicalAssignmentRevokeStatements}=await import('../security/mission-assignment-authority.service.js');
  const assignments=(await env.DB.prepare(`SELECT mission_id,company_id,assignment_type FROM mission_active_assignment_projection WHERE assignee_id=? AND assignee_company_id=? AND assignee_type='driver' AND status='active'`).bind(Number(driverId),Number(tenantId)).all()).results||[];
  const revoke=[];
  for(const row of assignments){revoke.push(...canonicalAssignmentRevokeStatements(env,{companyId:Number(row.company_id),missionId:Number(row.mission_id),assignmentType:String(row.assignment_type),reason:'driver_removed'}));}
  await env.DB.batch([
        env.DB.prepare(`INSERT INTO mission_assignment_events(mission_id,company_id,assignment_type,actor_type,actor_id,driver_id,event_code,metadata_json) SELECT mission_id,company_id,assignment_type,'identity',?,assignee_id,'driver_removed',? FROM mission_active_assignment_projection WHERE assignee_company_id=? AND assignee_id=? AND assignee_type='driver' AND status='active'`).bind(identityId||null,JSON.stringify({reason}),tenantId,driverId),
    ...revoke,
        env.DB.prepare(`DELETE FROM driver_content_preferences WHERE company_id=? AND driver_id=?`).bind(tenantId,driverId),
    env.DB.prepare(`DELETE FROM driver_daily_notes WHERE company_id=? AND driver_id=?`).bind(tenantId,driverId),
    env.DB.prepare(`UPDATE drivers SET active=0,removed_at=CURRENT_TIMESTAMP,removed_by_identity_id=?,removal_reason=? WHERE id=? AND company_id=? AND removed_at IS NULL`).bind(identityId,reason,driverId,tenantId)
  ]);
  return {impact,removed:true};
}
