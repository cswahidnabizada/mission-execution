import { authorityUnavailable } from './canonical-db.js';
import {canonicalFirst} from './canonical-db.js';
const COOKIE_NAME = "onmission_session";
const SESSION_TTL = 60 * 60 * 8;
const SESSION_ABSOLUTE_MAX_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE_MAX_AGE = 24 * 60 * 60;
import {readOperationalAccess} from '../security/operational-access-cache.js';

const SESSION_TOUCH_MIN_MS = 5 * 60 * 1000;
const requestSessionCache = new WeakMap();

export async function createSession(env, data) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const session = {
    role: data.role,
    organizationRole: data.organizationRole || null,
    accessType: data.accessType || null,
    tenantId: data.tenantId === null || data.tenantId === undefined ? null : Number(data.tenantId),
    driverId: data.driverId ? Number(data.driverId) : null,
    driverName: data.driverName || null,
    missionId: data.missionId ? Number(data.missionId) : null,
    identityId: data.identityId ? Number(data.identityId) : null,
    identityType: data.identityType || null,
    executorId: data.executorId ? Number(data.executorId) : null,
    login: data.login || null,
    displayName: data.displayName || null,
    companyName: data.companyName || null,
    companyVerified: data.companyVerified === true,
    countryCode: normalizeCountryCode(data.countryCode),
    authMethod: data.authMethod || null,
    actingAs: data.actingAs || null,
    sessionVersion: Number(data.sessionVersion || 1),
    createdAt: new Date().toISOString()
  };
  await env.KV_BINDING.put(`session:${token}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });
  return { token, session };
}

export async function getSession(request, env) {
  if (request && typeof request === "object") {
    const cached = requestSessionCache.get(request);
    if (cached) return cached;
  }
  const promise = resolveSession(request, env);
  if (request && typeof request === "object") {
    requestSessionCache.set(request, promise);
  }
  return promise;
}

async function resolveSession(request, env) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  const raw = await env.KV_BINDING.get(`session:${token}`);
  if (!raw) return null;
  let session;
  try {
    session=JSON.parse(raw);
  } catch {
    await env.KV_BINDING.delete(`session:${token}`).catch(error=>{console.warn('Optional session KV cleanup unavailable:',error?.message||error);});
    return null;
  }
  session.__sessionToken=token;
  if(session.actingAs){
    const delegatedExpiry=Number(session.actingAs.expiresAt||0);
    if(!delegatedExpiry || delegatedExpiry<=Date.now() || !['view','act'].includes(String(session.actingAs.mode||''))){
      await env.KV_BINDING.delete(`session:${token}`);
      return null;
    }
  }
  try {
    session.operationalAccess=await readOperationalAccess(env,token);
    const created=Date.parse(session.createdAt||"");
    if(!Number.isFinite(created)||Date.now()-created>SESSION_ABSOLUTE_MAX_MS){
      await env.KV_BINDING.delete(`session:${token}`);
      return null;
    }
    const previousCountryCode=normalizeCountryCode(session.countryCode);
    const needsContextPersist=!session.countryCode;
    if(!(await sessionStillAuthorized(env,session))){
      await env.KV_BINDING.delete(`session:${token}`);
      return null;
    }
    if((needsContextPersist||previousCountryCode!==normalizeCountryCode(session.countryCode))&&session.countryCode){
      await env.KV_BINDING.put(`session:${token}`,JSON.stringify(session),{expirationTtl:SESSION_TTL}).catch(error=>{console.warn('Optional session KV refresh unavailable:',error?.message||error);});
    }
    return session;
  } catch (error) {
    // Do not convert an infrastructure/D1/KV failure into AUTH_REQUIRED.
    // A transient authority-read failure must never cause the browser to
    // destroy a valid session or bounce an authenticated user back to sign-in.
    console.error("SESSION_AUTHORITY_CHECK_FAILED", error?.message || error);
    throw error;
  }
}

export async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) throw authError("AUTH_REQUIRED", 401);
  return session;
}

export async function requireRole(request, env, roles) {
  const session = await requireSession(request, env);
  if (!roles.includes(session.role)) throw authError("FORBIDDEN", 403);
  if (session.role === 'admin' && roles.includes('admin')) {
    const organizationRole = await resolveOrganizationRoleForSession(env, session);
    if (!['owner','admin'].includes(organizationRole)) throw authError('FORBIDDEN',403);
    session.organizationRole = organizationRole;
  }
  return session;
}

export async function requireOrganizationRole(request, env, allowedRoles) {
  const session = await requireSession(request, env);
  const role = await resolveOrganizationRoleForSession(env, session);
  if (!allowedRoles.includes(role)) throw authError('FORBIDDEN',403);
  session.organizationRole = role;
  return session;
}

export async function requireAdmin(request, env) {
  return requireRole(request, env, ['admin']);
}

export async function resolveOrganizationRoleForSession(env, session) {
  const companyId=Number(session?.tenantId||0),identityId=Number(session?.identityId||0);
  if(!companyId||!identityId)return null;
  const pu=await canonicalFirst(env,`SELECT id FROM platform_users WHERE principal_type='tenant' AND principal_id=? LIMIT 1`,[identityId],'platform_user_authority');
  if(!pu)return null;
  const row=await canonicalFirst(env,`SELECT role_code FROM platform_user_roles WHERE platform_user_id=? AND scope_type='tenant' AND scope_id=? AND active=1 ORDER BY CASE role_code WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 WHEN 'operator' THEN 4 WHEN 'driver' THEN 5 ELSE 6 END,id LIMIT 1`,[Number(pu.id),companyId],'platform_user_role_authority');
  return row?.role_code||null;
}


export async function touchSession(request,env){
  const token=readCookie(request,COOKIE_NAME);
  if(!token)return false;
  const raw=await env.KV_BINDING.get(`session:${token}`);
  if(!raw)return false;
  let session;try{session=JSON.parse(raw);}catch{return false;}
  if(!(await sessionStillAuthorized(env,session))){
    await env.KV_BINDING.delete(`session:${token}`);
    return false;
  }
  const created=Date.parse(session.createdAt||"");
  if(!Number.isFinite(created)||Date.now()-created>SESSION_ABSOLUTE_MAX_MS)return false;
  const touched=Date.parse(session.lastTouchedAt||session.createdAt||"");
  if(Number.isFinite(touched)&&Date.now()-touched<SESSION_TOUCH_MIN_MS)return true;
  session.lastTouchedAt=new Date().toISOString();
  await env.KV_BINDING.put(`session:${token}`,JSON.stringify(session),{expirationTtl:SESSION_TTL});
  return true;
}

export async function destroySession(request, env) {
  const token = readCookie(request, COOKIE_NAME);
  if (token) await env.KV_BINDING.delete(`session:${token}`);
}


export async function revokeSessionsForIdentity(env,{identityType,identityId}){
  let cursor=undefined;
  do{
    const page=await env.KV_BINDING.list({prefix:"session:",cursor});
    for(const key of page.keys||[]){
      try{
        const raw=await env.KV_BINDING.get(key.name);
        const session=raw?JSON.parse(raw):null;
        if(!session)continue;
        const matches=identityType==="executor"
          ? Number(session.executorId)===Number(identityId)
          : Number(session.identityId)===Number(identityId);
        if(matches)await env.KV_BINDING.delete(key.name);
      }catch{}
    }
    cursor=page.list_complete?undefined:page.cursor;
  }while(cursor);
}


export async function revokeSessionsForDriver(env,{tenantId,driverId}){
  let cursor=undefined;
  do{
    const page=await env.KV_BINDING.list({prefix:"session:",cursor});
    for(const key of page.keys||[]){
      try{
        const raw=await env.KV_BINDING.get(key.name);
        const session=raw?JSON.parse(raw):null;
        if(session &&
           session.role==="driver" &&
           Number(session.tenantId)===Number(tenantId) &&
           Number(session.driverId)===Number(driverId)){
          await env.KV_BINDING.delete(key.name);
        }
      }catch{}
    }
    cursor=page.list_complete?undefined:page.cursor;
  }while(cursor);
}

async function sessionStillAuthorized(env,session){
  if(!env.DB)return false;
  const expectedVersion=Number(session.sessionVersion||1);
  try{
    if(session.identityType==="executor"||session.role==="executor"){
      const row=await env.DB.prepare(`
        SELECT pei.active,pei.session_version,pep.country_code
        FROM public_executor_identities pei
        LEFT JOIN public_executor_profiles pep ON pep.executor_id=pei.id
        WHERE pei.id=? LIMIT 1
      `).bind(Number(session.executorId||session.identityId)).first();
      if(!row || Number(row.active)!==1 || Number(row.session_version||1)!==expectedVersion)return false;
      const authoritativeCountry=normalizeCountryCode(row.country_code);
      if(authoritativeCountry!==normalizeCountryCode(session.countryCode))session.countryCode=authoritativeCountry;
      return true;
    }

    const row=await env.DB.prepare(`
      SELECT ai.active,ai.session_version,ai.company_id,ai.role,ai.driver_id,d.active AS driver_active,
             COALESCE(cmp.country_code,cvs.country_code) AS country_code
      FROM auth_identities ai
      LEFT JOIN drivers d ON d.id=ai.driver_id AND d.company_id=ai.company_id
      LEFT JOIN company_management_profiles cmp ON cmp.company_id=ai.company_id
      LEFT JOIN company_verification_status cvs ON cvs.company_id=ai.company_id
      WHERE ai.id=? LIMIT 1
    `).bind(Number(session.identityId)).first();
    if(!row||Number(row.active)!==1||Number(row.session_version||1)!==expectedVersion)return false;
    if(Number(row.company_id)!==Number(session.tenantId))return false;
    // D1 is authoritative for role as well as tenant/driver binding. A KV session
    // never keeps admin/driver authority after the identity role changes.
    if(String(row.role||"")!==String(session.role||""))return false;
    if(session.role==="driver"&&(Number(row.driver_id)!==Number(session.driverId)||Number(row.driver_active)!==1))return false;
    if(session.role==="admin"&&row.driver_id!==null&&row.driver_id!==undefined)return false;
    const authoritativeCountry=normalizeCountryCode(row.country_code);
    if(authoritativeCountry!==normalizeCountryCode(session.countryCode))session.countryCode=authoritativeCountry;
    return true;
  }catch(error){
    // Rolling-deploy compatibility before migration 0023 is applied. We still
    // enforce authoritative active/tenant/driver state; only generation-based
    // revocation waits for the migration.
    if(!/no such column:\s*.*session_version/i.test(String(error?.message||"")))throw error;
    if(session.identityType==="executor"||session.role==="executor"){
      const row=await env.DB.prepare(`SELECT pei.active,pep.country_code FROM public_executor_identities pei LEFT JOIN public_executor_profiles pep ON pep.executor_id=pei.id WHERE pei.id=? LIMIT 1`)
        .bind(Number(session.executorId||session.identityId)).first();
      if(!row||Number(row.active)!==1)return false;
      const authoritativeCountry=normalizeCountryCode(row.country_code);
      if(authoritativeCountry!==normalizeCountryCode(session.countryCode))session.countryCode=authoritativeCountry;
      return true;
    }
    const row=await env.DB.prepare(`
      SELECT ai.active,ai.company_id,ai.role,ai.driver_id,d.active AS driver_active,
             COALESCE(cmp.country_code,cvs.country_code) AS country_code
      FROM auth_identities ai
      LEFT JOIN drivers d ON d.id=ai.driver_id AND d.company_id=ai.company_id
      LEFT JOIN company_management_profiles cmp ON cmp.company_id=ai.company_id
      LEFT JOIN company_verification_status cvs ON cvs.company_id=ai.company_id
      WHERE ai.id=? LIMIT 1
    `).bind(Number(session.identityId)).first();
    if(!row||Number(row.active)!==1||Number(row.company_id)!==Number(session.tenantId))return false;
    if(String(row.role||"")!==String(session.role||""))return false;
    if(session.role==="driver"&&(Number(row.driver_id)!==Number(session.driverId)||Number(row.driver_active)!==1))return false;
    if(session.role==="admin"&&row.driver_id!==null&&row.driver_id!==undefined)return false;
    const authoritativeCountry=normalizeCountryCode(row.country_code);
    if(authoritativeCountry!==normalizeCountryCode(session.countryCode))session.countryCode=authoritativeCountry;
    return true;
  }
}

function normalizeCountryCode(value){
  const code=String(value||"").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code)?code:null;
}

export function publicSession(session) {
  return {
    role: session?.role || null,
    organizationRole: session?.organizationRole || null,
    accessType: session?.accessType || null,
    tenantId: session?.tenantId || null,
    identityId: session?.identityId || null,
    identityType: session?.identityType || null,
    executorId: session?.executorId || null,
    login: session?.login || null,
    displayName: session?.displayName || null,
    driverId: session?.driverId || null,
    driverName: session?.driverName || null,
    companyName: session?.companyName || null,
    companyVerified: session?.companyVerified === true,
    verificationComplete: session?.verificationComplete === true,
    countryCode: session?.countryCode || null,
    missionId: session?.missionId || null,
    authMethod: session?.authMethod || null,
    actingAs: session?.actingAs ? {contextId:session.actingAs.contextId,mode:session.actingAs.mode,targetIdentityId:Number(session.actingAs.targetIdentityId),targetTenantId:Number(session.actingAs.targetTenantId),startedAt:session.actingAs.startedAt,expiresAt:Number(session.actingAs.expiresAt),reason:session.actingAs.reason||null} : null
  };
}

export function sessionCookie(token) {
  return [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax", `Max-Age=${SESSION_COOKIE_MAX_AGE}`].join("; ");
}

export function clearSessionCookie() {
  return [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax", "Max-Age=0"].join("; ");
}

export function getSessionToken(request) { return readCookie(request, COOKIE_NAME); }

function readCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=").trim();
  }
  return null;
}

function authError(code, status) {
  const error = new Error(code);
  error.status = status;
  return error;
}
