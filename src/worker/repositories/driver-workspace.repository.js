export async function ensureProfile(env,companyId,driverId){
  await env.DB.prepare(`
    INSERT INTO driver_operational_profiles(driver_id,company_id,situation)
    VALUES (?,?,'Available') ON CONFLICT(driver_id) DO NOTHING
  `).bind(driverId,companyId).run();
  return getProfile(env,companyId,driverId);
}

export async function getProfile(env,companyId,driverId){
  return env.DB.prepare(`
    SELECT driver_id,company_id,vehicle_type,current_location,situation,situation_note,
      location_updated_at,situation_updated_at,created_at,updated_at
    FROM driver_operational_profiles
    WHERE company_id=? AND driver_id=? LIMIT 1
  `).bind(companyId,driverId).first();
}

export async function updateProfile(env,companyId,driverId,data){
  await ensureProfile(env,companyId,driverId);
  await env.DB.prepare(`
    UPDATE driver_operational_profiles
    SET vehicle_type=COALESCE(?,vehicle_type),
        current_location=COALESCE(?,current_location),
        situation=COALESCE(?,situation),
        situation_note=COALESCE(?,situation_note),
        location_updated_at=CASE WHEN ? IS NULL THEN location_updated_at ELSE CURRENT_TIMESTAMP END,
        situation_updated_at=CASE WHEN ? IS NULL AND ? IS NULL THEN situation_updated_at ELSE CURRENT_TIMESTAMP END,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND driver_id=?
  `).bind(
    data.vehicleType??null,data.currentLocation??null,data.situation??null,data.situationNote??null,
    data.currentLocation??null,data.situation??null,data.situationNote??null,
    companyId,driverId
  ).run();
  return getProfile(env,companyId,driverId);
}

export async function getDriverOverview(env,companyId,driverId,recentLimit=1){
  const driver=await env.DB.prepare(`
    SELECT d.id,d.company_id,d.name,d.active,d.created_at,
      ai.login,ai.email,ai.display_name,ai.last_login_at,
      p.vehicle_type,p.current_location,p.situation,p.situation_note,
      p.location_updated_at,p.situation_updated_at
    FROM drivers d
    LEFT JOIN auth_identities ai ON ai.company_id=d.company_id AND ai.driver_id=d.id AND ai.role='driver'
    LEFT JOIN driver_operational_profiles p ON p.company_id=d.company_id AND p.driver_id=d.id
    WHERE d.company_id=? AND d.id=? LIMIT 1
  `).bind(companyId,driverId).first();
  if(!driver)return null;

  const metrics=await env.DB.prepare(`
    WITH assigned AS (
      SELECT m.id,m.status,m.created_at,m.updated_at,m.state_version,m.mission_date,m.reference,m.pickup_company,m.delivery_company
      FROM mission_canonical_projection m WHERE m.company_id=? AND EXISTS (SELECT 1 FROM mission_active_assignment_projection ca WHERE ca.mission_id=m.id AND ca.company_id=m.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.assignee_id=?)
      UNION
      SELECT m.id,m.status,m.created_at,m.updated_at,m.state_version,m.mission_date,m.reference,m.pickup_company,m.delivery_company
      FROM mission_active_assignment_projection sd
      JOIN mission_canonical_projection m ON m.id=sd.mission_id AND m.company_id=sd.company_id
      WHERE sd.assignee_company_id=? AND sd.assignee_id=? AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver' AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver'
    )
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status NOT IN ('Completed','Cancelled','Canceled') THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN mission_date=date('now') THEN 1 ELSE 0 END) AS today
    FROM assigned
  `).bind(companyId,driverId,companyId,driverId).first();

  const activeMission=await env.DB.prepare(`
    WITH assigned AS (
      SELECT m.id,m.company_id,m.reference,m.status,m.mission_date,m.mission_end_time,m.pickup_time,m.delivery_time,m.deadline_at,m.pickup_at_utc,m.delivery_at_utc,m.deadline_at_utc,m.pickup_company,m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_company,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,m.updated_at,m.state_version
      FROM mission_canonical_projection m WHERE m.company_id=? AND EXISTS (SELECT 1 FROM mission_active_assignment_projection ca WHERE ca.mission_id=m.id AND ca.company_id=m.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.assignee_id=?) AND m.status NOT IN ('Completed','Cancelled','Canceled')
      UNION
      SELECT m.id,m.company_id,m.reference,m.status,m.mission_date,m.mission_end_time,m.pickup_time,m.delivery_time,m.deadline_at,m.pickup_at_utc,m.delivery_at_utc,m.deadline_at_utc,m.pickup_company,m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_company,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,m.updated_at,m.state_version
      FROM mission_active_assignment_projection sd
      JOIN mission_canonical_projection m ON m.id=sd.mission_id AND m.company_id=sd.company_id
      WHERE sd.assignee_company_id=? AND sd.assignee_id=? AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver' AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver' AND m.status NOT IN ('Completed','Cancelled','Canceled')
    )
    SELECT a.*,
      (SELECT MAX(h.created_at) FROM mission_status_history h WHERE h.mission_id=a.id AND h.status='PickedUp') AS picked_up_at
    FROM assigned a ORDER BY datetime(a.updated_at) DESC,a.id DESC LIMIT 1
  `).bind(companyId,driverId,companyId,driverId).first();

  const recent=(await env.DB.prepare(`
    WITH assigned AS (
      SELECT m.id,m.company_id,m.reference,m.status,m.mission_date,m.pickup_time,m.delivery_time,m.deadline_at,m.pickup_at_utc,m.delivery_at_utc,m.deadline_at_utc,
        m.pickup_company,m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_company,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,m.public_description,m.updated_at,m.state_version,0 AS shared,
        (SELECT name FROM companies c WHERE c.id=m.company_id) AS owner_company_name,
        (SELECT mm.message FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id AND mm.sender_role='admin' ORDER BY mm.id ASC LIMIT 1) AS mission_message,
        (SELECT COUNT(*) FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id) AS message_count,
        (SELECT COUNT(*) FROM mission_files mf WHERE mf.mission_id=m.id AND mf.company_id=m.company_id) AS file_count
      FROM mission_canonical_projection m WHERE m.company_id=? AND EXISTS (SELECT 1 FROM mission_active_assignment_projection ca WHERE ca.mission_id=m.id AND ca.company_id=m.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.assignee_id=?)
      UNION
      SELECT m.id,m.company_id,m.reference,m.status,m.mission_date,m.pickup_time,m.delivery_time,m.deadline_at,m.pickup_at_utc,m.delivery_at_utc,m.deadline_at_utc,
        m.pickup_company,m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_company,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,m.public_description,m.updated_at,m.state_version,1 AS shared,
        (SELECT name FROM companies c WHERE c.id=m.company_id) AS owner_company_name,
        (SELECT mm.message FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id AND mm.sender_role='admin' ORDER BY mm.id ASC LIMIT 1) AS mission_message,
        (SELECT COUNT(*) FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id) AS message_count,
        (SELECT COUNT(*) FROM mission_files mf WHERE mf.mission_id=m.id AND mf.company_id=m.company_id) AS file_count
      FROM mission_active_assignment_projection sd
      JOIN mission_canonical_projection m ON m.id=sd.mission_id AND m.company_id=sd.company_id
      WHERE sd.assignee_company_id=? AND sd.assignee_id=? AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver' AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver'
    )
    SELECT * FROM assigned ORDER BY datetime(updated_at) DESC,id DESC LIMIT ?
  `).bind(companyId,driverId,companyId,driverId,Math.min(Math.max(Number(recentLimit)||1,1),12)).all()).results||[];

  return {driver,metrics:{total:Number(metrics?.total||0),completed:Number(metrics?.completed||0),active:Number(metrics?.active||0),today:Number(metrics?.today||0)},activeMission,recent};
}

export async function listMessages(env,companyId,driverId){
  const r=await env.DB.prepare(`
    SELECT id,company_id,driver_id,sender_role,message,created_at
    FROM driver_direct_messages WHERE company_id=? AND driver_id=? ORDER BY id ASC LIMIT 300
  `).bind(companyId,driverId).all();
  return r.results||[];
}

export async function insertMessage(env,{companyId,driverId,senderRole,senderIdentityId,message}){
  const r=await env.DB.prepare(`
    INSERT INTO driver_direct_messages(company_id,driver_id,sender_role,sender_identity_id,message)
    VALUES (?,?,?,?,?)
  `).bind(companyId,driverId,senderRole,senderIdentityId||null,message).run();
  return Number(r.meta.last_row_id);
}


export async function listDriverNotes(env,companyId,driverId){
  const r=await env.DB.prepare(`
    SELECT id,note,created_at
    FROM driver_daily_notes
    WHERE company_id=? AND driver_id=?
    ORDER BY id ASC
    LIMIT 500
  `).bind(companyId,driverId).all();
  return r.results||[];
}

export async function insertDriverNote(env,companyId,driverId,note){
  const r=await env.DB.prepare(`
    INSERT INTO driver_daily_notes(company_id,driver_id,note)
    VALUES (?,?,?)
  `).bind(companyId,driverId,note).run();
  return Number(r.meta.last_row_id);
}


export async function listMessagesForDriverView(env,companyId,driverId){
  const pref=await env.DB.prepare(`
    SELECT direct_messages_cleared_through_id AS cleared
    FROM driver_content_preferences WHERE company_id=? AND driver_id=? LIMIT 1
  `).bind(Number(companyId),Number(driverId)).first();
  const cleared=Number(pref?.cleared||0);
  const r=await env.DB.prepare(`
    SELECT id,company_id,driver_id,sender_role,message,created_at
    FROM driver_direct_messages
    WHERE company_id=? AND driver_id=? AND id>?
    ORDER BY id ASC LIMIT 300
  `).bind(Number(companyId),Number(driverId),cleared).all();
  return r.results||[];
}

export async function clearDriverMessagesView(env,companyId,driverId){
  const row=await env.DB.prepare(`
    SELECT COALESCE(MAX(id),0) AS max_id
    FROM driver_direct_messages WHERE company_id=? AND driver_id=?
  `).bind(Number(companyId),Number(driverId)).first();
  const maxId=Number(row?.max_id||0);
  await env.DB.prepare(`
    INSERT INTO driver_content_preferences(company_id,driver_id,direct_messages_cleared_through_id,updated_at)
    VALUES (?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id,driver_id) DO UPDATE SET
      direct_messages_cleared_through_id=excluded.direct_messages_cleared_through_id,
      updated_at=CURRENT_TIMESTAMP
  `).bind(Number(companyId),Number(driverId),maxId).run();
  return maxId;
}

export async function deleteAllDriverNotes(env,companyId,driverId){
  const r=await env.DB.prepare(`
    DELETE FROM driver_daily_notes WHERE company_id=? AND driver_id=?
  `).bind(Number(companyId),Number(driverId)).run();
  return Number(r.meta?.changes||0);
}
