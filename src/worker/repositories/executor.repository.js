function parseList(value) {
  try { const parsed=JSON.parse(value||"[]"); return Array.isArray(parsed)?parsed:[]; } catch { return []; }
}

export async function findExecutorByLogin(env, login) {
  const row=await env.DB.prepare(`
    SELECT pei.*, pep.registered_company_name, pep.company_category, pep.working_cities,
      pep.working_zip_codes, pep.country_code, pep.mobile, pep.description, pep.vehicle_types, pep.website
    FROM public_executor_identities pei
    JOIN public_executor_profiles pep ON pep.executor_id=pei.id
    WHERE LOWER(pei.login)=LOWER(?) AND pei.active=1 AND pei.deleted_at IS NULL
    LIMIT 1
  `).bind(login).first();
  return hydrate(row);
}

export async function findExecutorByEmail(env, email) {
  const row=await env.DB.prepare(`SELECT * FROM public_executor_identities WHERE LOWER(email)=LOWER(?) AND active=1 AND deleted_at IS NULL LIMIT 1`).bind(email).first();
  return row||null;
}

export async function findExecutorById(env, executorId) {
  const row=await env.DB.prepare(`
    SELECT pei.*, pep.registered_company_name, pep.company_category, pep.working_cities,
      pep.working_zip_codes, pep.country_code, pep.mobile, pep.description, pep.vehicle_types, pep.website
    FROM public_executor_identities pei
    JOIN public_executor_profiles pep ON pep.executor_id=pei.id
    WHERE pei.id=? AND pei.active=1 AND pei.deleted_at IS NULL LIMIT 1
  `).bind(executorId).first();
  return hydrate(row);
}

export async function createExecutor(env, identity, profile) {
  const idResult=await env.DB.prepare(`
    INSERT INTO public_executor_identities (
      login,email,display_name,password_hash,password_salt,password_iterations,active,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(identity.email,identity.email,identity.displayName,identity.passwordHash,identity.passwordSalt,identity.passwordIterations).run();
  const executorId=Number(idResult.meta.last_row_id);
  try {
    await env.DB.prepare(`
      INSERT INTO public_executor_profiles (
        executor_id,registered_company_name,company_category,working_cities,working_zip_codes,country_code,
        mobile,description,vehicle_types,website,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(
      executorId,profile.registeredCompanyName,profile.companyCategory,
      JSON.stringify(profile.workingCities),JSON.stringify(profile.workingZipCodes),profile.countryCode,profile.mobile,
      profile.description,JSON.stringify(profile.vehicleTypes),profile.website||null
    ).run();
    return executorId;
  } catch (error) {
    await env.DB.prepare(`DELETE FROM public_executor_identities WHERE id=?`).bind(executorId).run();
    throw error;
  }
}

export async function updateExecutorProfile(env, executorId, p) {
  await env.DB.prepare(`UPDATE public_executor_identities SET display_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(p.name,executorId).run();
  await env.DB.prepare(`
    UPDATE public_executor_profiles SET registered_company_name=?,company_category=?,working_cities=?,working_zip_codes=?,
      mobile=?,description=?,vehicle_types=?,website=?,updated_at=CURRENT_TIMESTAMP WHERE executor_id=?
  `).bind(p.registeredCompanyName,p.companyCategory,JSON.stringify(p.workingCities),JSON.stringify(p.workingZipCodes),p.mobile,p.description,JSON.stringify(p.vehicleTypes),p.website||null,executorId).run();
}

export async function touchExecutorLogin(env, executorId) {
  return env.DB.prepare(`UPDATE public_executor_identities SET last_login_at=CURRENT_TIMESTAMP WHERE id=?`).bind(executorId).run();
}

export async function updateExecutorPassword(env, executorId, password) {
  try {
    return await env.DB.prepare(`UPDATE public_executor_identities SET password_hash=?,password_salt=?,password_iterations=?,session_version=session_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(password.hash,password.salt,password.iterations,executorId).run();
  } catch(error) {
    if(!/no such column:\s*session_version/i.test(String(error?.message||""))) throw error;
    return env.DB.prepare(`UPDATE public_executor_identities SET password_hash=?,password_salt=?,password_iterations=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(password.hash,password.salt,password.iterations,executorId).run();
  }
}

export async function listAssignedMissions(env, executorId, filters={}) {
  let sql=`
    SELECT m.*, (SELECT oa.assignee_id FROM mission_active_assignment_projection oa WHERE oa.mission_id=m.id AND oa.company_id=m.company_id AND oa.assignment_type='owner_driver' AND oa.assignee_type='driver' AND oa.status='active' ORDER BY oa.id DESC LIMIT 1) AS owner_driver_id, mea.assignee_id AS assigned_executor_id, mea.assignee_id AS owner_assigned_executor_id,
      c.name AS company_name, nc.company_name AS customer_name, pei.display_name AS executor_name,
      (SELECT mm.message FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id AND mm.sender_role='admin' ORDER BY mm.id ASC LIMIT 1) AS mission_message,
      (SELECT COUNT(*) FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id) AS message_count,
      (SELECT COUNT(*) FROM mission_files mf WHERE mf.mission_id=m.id AND mf.company_id=m.company_id) AS file_count
    FROM mission_active_assignment_projection mea
    JOIN mission_canonical_projection m ON m.id=mea.mission_id AND m.company_id=mea.company_id
    JOIN companies c ON c.id=m.company_id
    LEFT JOIN network_customers nc ON nc.id=m.customer_id AND nc.company_id=m.company_id
    JOIN public_executor_identities pei ON pei.id=mea.assignee_id
    WHERE mea.assignee_id=? AND mea.assignment_type='executor' AND mea.assignee_type='executor' AND mea.status='active'`;
  const binds=[executorId];
  if(filters.missionId){sql+=' AND m.id=?';binds.push(filters.missionId);}
  if(filters.status){sql+=' AND m.status=?';binds.push(filters.status);}
  if(filters.activeOnly){sql += " AND m.status NOT IN ('Completed','Cancelled','Canceled')";}
  if(filters.date){sql+=' AND m.mission_date=?';binds.push(filters.date);}
  if(filters.search){
    const q=`%${String(filters.search).toLowerCase()}%`;
    sql+=` AND (
      LOWER(m.reference) LIKE ? OR LOWER(COALESCE(m.pickup_company,'')) LIKE ? OR
      LOWER(COALESCE(m.pickup_address,'')) LIKE ? OR LOWER(COALESCE(m.delivery_company,'')) LIKE ? OR
      LOWER(COALESCE(m.delivery_address,'')) LIKE ? OR LOWER(COALESCE(c.name,'')) LIKE ? OR
      LOWER(COALESCE(nc.company_name,'')) LIKE ? OR
      LOWER(COALESCE(pei.display_name,'')) LIKE ? OR LOWER(COALESCE(m.public_description,'')) LIKE ? OR
      LOWER(COALESCE(m.status,'')) LIKE ? OR LOWER(COALESCE(m.mission_date,'')) LIKE ? OR
      LOWER(COALESCE(m.pickup_time,'')) LIKE ? OR LOWER(COALESCE(m.delivery_time,'')) LIKE ? OR
      EXISTS (SELECT 1 FROM mission_messages sm WHERE sm.mission_id=m.id AND sm.company_id=m.company_id AND LOWER(COALESCE(sm.message,'')) LIKE ?)
    )`;
    binds.push(q,q,q,q,q,q,q,q,q,q,q,q,q,q);
  }
  const limit=Math.min(Math.max(Number(filters.limit)||100,1),201);
  const offset=Math.min(Math.max(Number(filters.offset)||0,0),50000);
  sql+=' ORDER BY m.updated_at DESC,m.id DESC LIMIT ? OFFSET ?';
  binds.push(limit,offset);
  const r=await env.DB.prepare(sql).bind(...binds).all();
  return r.results||[];
}

export async function findAssignedMission(env, executorId, missionId) {
  return env.DB.prepare(`
    SELECT m.*, (SELECT oa.assignee_id FROM mission_active_assignment_projection oa WHERE oa.mission_id=m.id AND oa.company_id=m.company_id AND oa.assignment_type='owner_driver' AND oa.assignee_type='driver' AND oa.status='active' ORDER BY oa.id DESC LIMIT 1) AS owner_driver_id, mea.assignee_id AS assigned_executor_id, mea.assignee_id AS owner_assigned_executor_id,
      c.name AS company_name, nc.company_name AS customer_name, pei.display_name AS executor_name,
      (SELECT mm.message FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id AND mm.sender_role='admin' ORDER BY mm.id ASC LIMIT 1) AS mission_message,
      (SELECT COUNT(*) FROM mission_messages mm WHERE mm.mission_id=m.id AND mm.company_id=m.company_id) AS message_count,
      (SELECT COUNT(*) FROM mission_files mf WHERE mf.mission_id=m.id AND mf.company_id=m.company_id) AS file_count
    FROM mission_active_assignment_projection mea
    JOIN mission_canonical_projection m ON m.id=mea.mission_id AND m.company_id=mea.company_id
    JOIN companies c ON c.id=m.company_id
    LEFT JOIN network_customers nc ON nc.id=m.customer_id AND nc.company_id=m.company_id
    JOIN public_executor_identities pei ON pei.id=mea.assignee_id
    WHERE mea.assignee_id=? AND mea.mission_id=? AND mea.assignment_type='executor' AND mea.assignee_type='executor' AND mea.status='active' LIMIT 1
  `).bind(executorId,missionId).first();
}

export async function upsertTenantExecutorLink(env, companyId, executorId) {
  return env.DB.prepare(`
    INSERT INTO tenant_executor_links (company_id,executor_id,status,approved_at,created_at,updated_at)
    VALUES (?,?,'approved',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id,executor_id) DO UPDATE SET status='approved',approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
  `).bind(companyId,executorId).run();
}








export async function listTenantExecutors(env, companyId, filters={}) {
  const r=await env.DB.prepare(`
    SELECT tel.status,tel.approved_at,pei.id AS executor_id,pei.display_name,pei.email,
      pep.registered_company_name,pep.company_category,pep.working_cities,pep.working_zip_codes,pep.mobile,pep.description,pep.vehicle_types,pep.website
    FROM tenant_executor_links tel
    JOIN public_executor_identities pei ON pei.id=tel.executor_id
    JOIN public_executor_profiles pep ON pep.executor_id=pei.id
    WHERE tel.company_id=? AND tel.status='approved'
    ORDER BY tel.approved_at DESC
    LIMIT ? OFFSET ?
  `).bind(companyId,Math.min(Math.max(Number(filters.limit)||100,1),200),Math.min(Math.max(Number(filters.offset)||0,0),50000)).all();
  return (r.results||[]).map(hydrate);
}

function hydrate(row){
  if(!row)return null;
  const out={...row};
  if('working_cities' in out)out.working_cities=parseList(out.working_cities);
  if('working_zip_codes' in out)out.working_zip_codes=parseList(out.working_zip_codes);
  if('vehicle_types' in out)out.vehicle_types=parseList(out.vehicle_types);
  return out;
}



