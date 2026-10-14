import {canonicalFirst} from '../core/canonical-db.js';
export async function findIdentityByLogin(env, login) {
  return canonicalFirst(env,`
    SELECT ai.*, d.name AS driver_name, c.name AS company_name,
           cvs.status AS company_verification_status, COALESCE(cmp.country_code,cvs.country_code) AS country_code
    FROM auth_identities ai
    JOIN companies c ON c.id=ai.company_id
    LEFT JOIN company_verification_status cvs ON cvs.company_id=c.id
    LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id
    LEFT JOIN drivers d ON d.id=ai.driver_id AND d.company_id=ai.company_id
    WHERE LOWER(ai.login)=LOWER(?) AND ai.active=1 AND c.deletion_status='active'
    LIMIT 1
  `,[login],'identity_authority');
}


export async function findIdentityById(env, identityId) {
  return canonicalFirst(env,`
    SELECT ai.*, d.name AS driver_name, c.name AS company_name,
           cvs.status AS company_verification_status, COALESCE(cmp.country_code,cvs.country_code) AS country_code
    FROM auth_identities ai
    JOIN companies c ON c.id=ai.company_id
    LEFT JOIN company_verification_status cvs ON cvs.company_id=c.id
    LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id
    LEFT JOIN drivers d ON d.id=ai.driver_id AND d.company_id=ai.company_id
    WHERE ai.id=? AND ai.active=1 AND c.deletion_status='active'
    LIMIT 1
  `,[identityId],'identity_authority');
}

export async function countAdminIdentities(env, companyId) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM auth_identities
    WHERE company_id=? AND role='admin' AND active=1
  `).bind(companyId).first();
  return Number(row?.count || 0);
}

export async function findDriverIdentity(env, companyId, driverId) {
  return env.DB.prepare(`
    SELECT * FROM auth_identities
    WHERE company_id=? AND driver_id=? AND role='driver'
    LIMIT 1
  `).bind(companyId, driverId).first();
}

export async function createIdentity(env, data) {
  const result = await env.DB.prepare(`
    INSERT INTO auth_identities (
      company_id, role, driver_id, login, email, display_name,
      password_hash, password_salt, password_iterations, active, must_change_password
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).bind(
    data.companyId,
    data.role,
    data.driverId || null,
    data.login,
    data.email || null,
    data.displayName || null,
    data.passwordHash,
    data.passwordSalt,
    data.passwordIterations,
    data.mustChangePassword ? 1 : 0
  ).run();
  return Number(result.meta.last_row_id);
}

export async function updateIdentityCredentials(env, identityId, data) {
  const bind=[data.login,data.email||null,data.displayName||null,data.passwordHash,data.passwordSalt,data.passwordIterations,data.mustChangePassword?1:0,identityId];
  try {
    return await env.DB.prepare(`
      UPDATE auth_identities
      SET login=?, email=?, display_name=?, password_hash=?, password_salt=?, password_iterations=?,
          must_change_password=?, active=1, session_version=session_version+1, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(...bind).run();
  } catch(error) {
    if(!missingSessionVersion(error)) throw error;
    return env.DB.prepare(`
      UPDATE auth_identities
      SET login=?, email=?, display_name=?, password_hash=?, password_salt=?, password_iterations=?,
          must_change_password=?, active=1, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(...bind).run();
  }
}

export async function touchLastLogin(env, identityId) {
  return env.DB.prepare(`UPDATE auth_identities SET last_login_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(identityId).run();
}

export async function createCompany(env, name) {
  const result = await env.DB.prepare(`INSERT INTO companies (name) VALUES (?)`).bind(name).run();
  return Number(result.meta.last_row_id);
}

export async function deleteCompanyIfEmpty(env, companyId) {
  return env.DB.prepare(`
    DELETE FROM companies
    WHERE id=?
      AND NOT EXISTS (SELECT 1 FROM mission_canonical_projection WHERE company_id=?)
      AND NOT EXISTS (SELECT 1 FROM drivers WHERE company_id=?)
  `).bind(companyId, companyId, companyId).run();
}

export async function markCompanyPending(env, companyId, countryCode) {
  return env.DB.prepare(`
    INSERT INTO company_verification_status (company_id,status,country_code,verified_at,created_at,updated_at)
    VALUES (?, 'pending', ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(company_id) DO UPDATE SET
      status='pending', country_code=excluded.country_code, verified_at=NULL, updated_at=CURRENT_TIMESTAMP
  `).bind(companyId,String(countryCode||'').toUpperCase()).run();
}

export async function setCompanyCountry(env, companyId, countryCode) {
  return env.DB.prepare(`UPDATE company_verification_status SET country_code=?, updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(String(countryCode||"").toUpperCase(),companyId).run();
}

export async function markCompanyVerified(env, companyId) {
  const current=await env.DB.prepare(`SELECT country_code FROM company_verification_status WHERE company_id=? LIMIT 1`).bind(companyId).first();
  const countryCode=String(current?.country_code||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(countryCode)||countryCode==='ZZ') { const e=new Error('COMPANY_COUNTRY_REQUIRED'); e.status=409; throw e; }
  return env.DB.prepare(`
    INSERT INTO company_verification_status (company_id,status,country_code,verified_at,created_at,updated_at)
    VALUES (?, 'verified', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(company_id) DO UPDATE SET
      status='verified', verified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
  `).bind(companyId,companyId).run();
}

export async function isCompanyVerified(env, companyId) {
  const row = await env.DB.prepare(`
    SELECT status FROM company_verification_status WHERE company_id=? LIMIT 1
  `).bind(companyId).first();
  return row?.status === "verified";
}

export async function getCompany(env, companyId) {
  return env.DB.prepare(`SELECT id,name FROM companies WHERE id=? LIMIT 1`).bind(companyId).first();
}

export async function updateCompanyName(env, companyId, name) {
  return env.DB.prepare(`UPDATE companies SET name=? WHERE id=?`).bind(name, companyId).run();
}

export async function setDriverIdentityActive(env, companyId, driverId, active) {
  try {
    return await env.DB.prepare(`UPDATE auth_identities SET active=?,session_version=session_version+1,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND driver_id=? AND role='driver'`)
      .bind(active ? 1 : 0, companyId, driverId).run();
  } catch(error) {
    if(!missingSessionVersion(error)) throw error;
    return env.DB.prepare(`UPDATE auth_identities SET active=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND driver_id=? AND role='driver'`)
      .bind(active ? 1 : 0, companyId, driverId).run();
  }
}

export async function deleteDriverIdentity(env, companyId, driverId) {
  return env.DB.prepare(`DELETE FROM auth_identities WHERE company_id=? AND driver_id=? AND role='driver'`)
    .bind(companyId, driverId).run();
}

export async function updateIdentityPassword(env, identityId, password) {
  try {
    return await env.DB.prepare(`UPDATE auth_identities SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0,session_version=session_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(password.hash,password.salt,password.iterations,identityId).run();
  } catch(error) {
    if(!missingSessionVersion(error)) throw error;
    return env.DB.prepare(`UPDATE auth_identities SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(password.hash,password.salt,password.iterations,identityId).run();
  }
}
export async function findRecoverableIdentityByEmail(env,email){
  return env.DB.prepare(`SELECT id,email,login,display_name FROM auth_identities WHERE active=1 AND email IS NOT NULL AND LOWER(email)=LOWER(?) LIMIT 1`).bind(email).first();
}

function missingSessionVersion(error){
  return /no such column:\s*session_version/i.test(String(error?.message||""));
}
