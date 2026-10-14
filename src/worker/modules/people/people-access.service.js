import { authorityUnavailable } from '../../core/canonical-db.js';
import {canonicalFirst} from '../../core/canonical-db.js';
import { hashPassword } from '../../security/password.js';
import { createIdentity, findIdentityByLogin } from '../../repositories/auth.repository.js';
import { createDriverWithCredentials } from './people.service.js';
import { audit } from '../../security/audit.js';
import { auditAdminControl } from '../admin-control/admin-control.audit.js';
import { sendOrganizationInvitationEmail } from '../auth/email.service.js';

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALLOWED_ROLES = new Set(['owner','admin','manager','operator','driver','developer']);
const ROLE_LABELS = Object.freeze({owner:'Owner',admin:'Administrator',manager:'Manager',operator:'Operator',driver:'Executor',developer:'Developer'});

function bad(message,status=400){const e=new Error(message);e.status=status;return e;}
function clean(v,max=240){return String(v??'').trim().slice(0,max);}
function normalizeEmail(v){return clean(v,240).toLowerCase();}
function token(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){const data=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}

export async function resolveOrganizationRole(env,session){
  const companyId=Number(session?.tenantId||0),identityId=Number(session?.identityId||0);
  if(!companyId||!identityId)return null;
  const pu=await canonicalFirst(env,`SELECT id FROM platform_users WHERE principal_type='tenant' AND principal_id=? LIMIT 1`,[identityId],'platform_user_authority');
  if(!pu)return null;
  const row=await canonicalFirst(env,`SELECT role_code FROM platform_user_roles WHERE platform_user_id=? AND scope_type='tenant' AND scope_id=? AND active=1 ORDER BY CASE role_code WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 WHEN 'operator' THEN 4 WHEN 'driver' THEN 5 ELSE 6 END,id LIMIT 1`,[Number(pu.id),companyId],'platform_user_role_authority');
  return row?.role_code||null;
}

async function assertOrganizationAdmin(env,session){
  if(!session?.tenantId)throw bad('Organization context is required',403);
  const role=await resolveOrganizationRole(env,session);
  if(!['owner','admin'].includes(role))throw bad('Organization administrator access is required',403);
  return role;
}

export async function listOrganizationPeople(env,session,{limit=100,offset=0}={}){
  await assertOrganizationAdmin(env,session);
  const companyId=Number(session.tenantId);
  const baseLimit=Math.min(Math.max(Number(limit)||100,1),200);
  const fetchLimit=baseLimit+1;
  const pageOffset=Math.min(Math.max(Number(offset)||0,0),50000);
  const invitationLimit=Math.min(baseLimit,100);
  const [identities,drivers,invitations,capabilities]=await Promise.all([
    env.DB.prepare(`SELECT ai.id identity_id,ai.login,ai.email,ai.display_name,ai.role auth_role,ai.active,ai.created_at,ai.last_login_at,d.id driver_id,d.name driver_name,d.active driver_active,pu.id platform_user_id,pur.role_code,pur.scope_type,pur.scope_id,pur.active role_active FROM auth_identities ai LEFT JOIN drivers d ON d.id=ai.driver_id AND d.company_id=ai.company_id LEFT JOIN platform_users pu ON pu.principal_type='tenant' AND pu.principal_id=ai.id LEFT JOIN platform_user_roles pur ON pur.platform_user_id=pu.id AND pur.scope_type='tenant' AND pur.scope_id=ai.company_id AND pur.active=1 WHERE ai.company_id=? AND ai.deleted_at IS NULL ORDER BY ai.created_at DESC,ai.id DESC LIMIT ? OFFSET ?`).bind(companyId,fetchLimit,pageOffset).all(),
    env.DB.prepare(`SELECT d.id driver_id,d.name,d.active,d.created_at,ai.id identity_id,ai.login,ai.email,ai.active identity_active FROM drivers d LEFT JOIN auth_identities ai ON ai.company_id=d.company_id AND ai.driver_id=d.id AND ai.role='driver' WHERE d.company_id=? AND d.deleted_at IS NULL ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?`).bind(companyId,fetchLimit,pageOffset).all(),
    env.DB.prepare(`SELECT invitation_id,email,role_code,scope_type,status,expires_at,invited_by_identity_id,accepted_identity_id,accepted_at,created_at FROM organization_invitations WHERE company_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(companyId,invitationLimit,pageOffset).all(),
    getOrganizationCapabilities(env,session)
  ]);
  const byIdentity=new Map();
  for(const row of identities.results||[]){
    if(!byIdentity.has(row.identity_id))byIdentity.set(row.identity_id,{identityId:Number(row.identity_id),platformUserId:row.platform_user_id?Number(row.platform_user_id):null,login:row.login,email:row.email,displayName:row.display_name,authRole:row.auth_role,active:Number(row.active)===1,driverId:row.driver_id?Number(row.driver_id):null,driverName:row.driver_name||null,driverActive:row.driver_active==null?null:Number(row.driver_active)===1,roles:[]});
    if(row.role_code)byIdentity.get(row.identity_id).roles.push({code:row.role_code,label:ROLE_LABELS[row.role_code]||row.role_code,scopeType:row.scope_type,scopeId:row.scope_id?Number(row.scope_id):null});
  }
  const people=[...byIdentity.values()];
  const hasMore=(identities.results||[]).length>baseLimit;
  return {people:people.slice(0,baseLimit),hasMore,nextOffset:hasMore?pageOffset+baseLimit:null,driverProjection:(drivers.results||[]).map(d=>({driverId:Number(d.driver_id),name:d.name,active:Number(d.active)===1,identityId:d.identity_id?Number(d.identity_id):null,login:d.login||null,email:d.email||null,identityActive:d.identity_active==null?null:Number(d.identity_active)===1})),invitations:(invitations.results||[]),capabilities};
}

export async function inviteOrganizationPerson(env,session,{email,roleCode,expiresInDays=7},requestId){
  const actorRole=await assertOrganizationAdmin(env,session);
  const companyId=Number(session.tenantId),normalizedEmail=normalizeEmail(email),role=clean(roleCode,40);
  if(!/^\S+@\S+\.\S+$/.test(normalizedEmail))throw bad('A valid email address is required');
  if(!ALLOWED_ROLES.has(role))throw bad('This organization role is not available');
  if(role==='owner'&&actorRole!=='owner')throw bad('Only the organization owner can invite an owner',403);
  const catalog=await env.DB.prepare(`SELECT role_code,active,scope_type FROM organization_role_catalog WHERE role_code=? LIMIT 1`).bind(role).first();
  if(!catalog||Number(catalog.active)!==1)throw bad('Organization role is not configured',422);
  const existing=await findIdentityByLogin(env,normalizedEmail);
  if(existing)throw bad('This email already belongs to an ON Mission account. Use access management for an existing organization member.',409);
  const pending=await env.DB.prepare(`SELECT invitation_id FROM organization_invitations WHERE company_id=? AND LOWER(email)=LOWER(?) AND status='invited' AND expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(companyId,normalizedEmail).first();
  if(pending)throw bad('An active invitation already exists for this email',409);
  const raw=token(),hash=await sha256(raw),invitationId=`inv_${crypto.randomUUID().replaceAll('-','')}`;
  const days=Math.min(30,Math.max(1,Number(expiresInDays||7))),expires=new Date(Date.now()+days*86400000).toISOString();
  await env.DB.prepare(`INSERT INTO organization_invitations(invitation_id,company_id,email,role_code,scope_type,token_hash,status,expires_at,invited_by_identity_id) VALUES(?,?,?,?,?,'invited',?,?,?)`).bind(invitationId,companyId,normalizedEmail,role,'tenant',hash,expires,Number(session.identityId)).run();
  const appUrl=new URL(session.invitationBaseUrl||env.APP_URL||'https://onmissionok.com');
  const invitationUrl=new URL('/accept-invitation.html',appUrl);invitationUrl.searchParams.set('token',raw);
  let delivery='queued';
  try{await sendOrganizationInvitationEmail(env,{to:normalizedEmail,organizationName:session.companyName||'your organization',roleLabel:ROLE_LABELS[role]||role,invitationUrl:String(invitationUrl),expiresAt:expires});delivery='sent';}
  catch(error){delivery=error?.message==='VERIFICATION_EMAIL_NOT_CONFIGURED'?'provider_not_configured':'provider_failed';}
  await audit(env,{session,action:'organization.invitation.created',resourceType:'organization_invitation',resourceId:null,metadata:{companyId,email:normalizedEmail,roleCode:role,delivery,requestId}});
  return {invitationId,email:normalizedEmail,roleCode:role,roleLabel:ROLE_LABELS[role]||role,status:'invited',expiresAt:expires,delivery};
}

export async function revokeOrganizationInvitation(env,session,invitationId,requestId){
  await assertOrganizationAdmin(env,session);const companyId=Number(session.tenantId);
  const row=await env.DB.prepare(`SELECT * FROM organization_invitations WHERE invitation_id=? AND company_id=? LIMIT 1`).bind(String(invitationId),companyId).first();
  if(!row)throw bad('Invitation not found',404);if(row.status!=='invited')throw bad('Only active invitations can be revoked',409);
  await env.DB.prepare(`UPDATE organization_invitations SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run();
  await audit(env,{session,action:'organization.invitation.revoked',resourceType:'organization_invitation',resourceId:Number(row.id),metadata:{invitationId,requestId}});
  return {invitationId,status:'revoked'};
}

export async function acceptOrganizationInvitation(env,{token:rawToken,password,displayName}){
  const raw=clean(rawToken,160);if(!raw)throw bad('Invitation token is required');
  const hash=await sha256(raw);
  const row=await env.DB.prepare(`SELECT oi.*,c.name company_name FROM organization_invitations oi JOIN companies c ON c.id=oi.company_id WHERE oi.token_hash=? LIMIT 1`).bind(hash).first();
  if(!row)throw bad('This invitation is invalid or expired',404);
  if(row.status!=='invited')throw bad(`This invitation is already ${row.status}`,409);
  if(Date.parse(String(row.expires_at))<=Date.now()){await env.DB.prepare(`UPDATE organization_invitations SET status='expired',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run();throw bad('This invitation has expired',410);}
  const existing=await findIdentityByLogin(env,row.email);if(existing)throw bad('An ON Mission account already exists for this email. Sign in and ask an organization administrator to manage access.',409);
  if(String(password||'').length<12)throw bad('Password must be at least 12 characters');
  const hashed=await hashPassword(password);let driverId=null,identityId=null;
  try{
    if(row.role_code==='driver'){
      const driver=await createDriverWithCredentials(env,Number(row.company_id),{name:clean(displayName,160)||row.email,username:row.email,password:password},null);
      driverId=Number(driver);
      identityId=Number((await env.DB.prepare(`SELECT id FROM auth_identities WHERE company_id=? AND driver_id=? AND role='driver' ORDER BY id DESC LIMIT 1`).bind(Number(row.company_id),driverId).first()).id);
    }else{
      identityId=await createIdentity(env,{companyId:Number(row.company_id),role:'admin',login:row.email,email:row.email,displayName:clean(displayName,160)||row.email,passwordHash:hashed.hash,passwordSalt:hashed.salt,passwordIterations:hashed.iterations,mustChangePassword:false});
    }
    const platformUser=await env.DB.prepare(`SELECT id FROM platform_users WHERE principal_type='tenant' AND principal_id=? LIMIT 1`).bind(Number(identityId)).first();
    if(!platformUser)throw bad('Access membership could not be created',500);
    await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_actors(platform_user_id,actor_type,active) VALUES(?, 'tenant',1)`).bind(Number(platformUser.id)).run();
    await env.DB.prepare(`INSERT INTO platform_user_memberships(platform_user_id,membership_type,membership_id,status) VALUES(?, 'tenant',?,'active') ON CONFLICT(platform_user_id,membership_type,membership_id) DO UPDATE SET status='active'`).bind(Number(platformUser.id),Number(row.company_id)).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_roles(platform_user_id,role_code,scope_type,scope_id,active) VALUES(?,?,?,?,1)`).bind(Number(platformUser.id),row.role_code,'tenant',Number(row.company_id)).run();
    await env.DB.prepare(`UPDATE organization_invitations SET status='accepted',accepted_identity_id=?,accepted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='invited'`).bind(identityId,Number(row.id)).run();
    return {identityId,companyId:Number(row.company_id),companyName:row.company_name,roleCode:row.role_code,roleLabel:ROLE_LABELS[row.role_code]||row.role_code,driverId};
  }catch(error){if(driverId)await env.DB.prepare(`DELETE FROM drivers WHERE id=? AND company_id=? AND NOT EXISTS(SELECT 1 FROM mission_active_assignment_projection WHERE assignee_id=drivers.id AND assignee_company_id=drivers.company_id AND assignee_type='driver' AND status='active')`).bind(driverId,Number(row.company_id)).run().catch(recoveryError=>{throw authorityUnavailable("driver_access_rollback",recoveryError);});throw error;}
}

export async function updateOrganizationPersonRole(env,session,identityId,roleCode,requestId){
  const actorRole=await assertOrganizationAdmin(env,session),companyId=Number(session.tenantId),role=clean(roleCode,40);
  if(!ALLOWED_ROLES.has(role)||role==='owner'&&actorRole!=='owner')throw bad('Role change is not permitted',403);
  const target=await env.DB.prepare(`SELECT ai.id,ai.role,ai.active,pu.id platform_user_id FROM auth_identities ai LEFT JOIN platform_users pu ON pu.principal_type='tenant' AND pu.principal_id=ai.id WHERE ai.id=? AND ai.company_id=? LIMIT 1`).bind(Number(identityId),companyId).first();
  if(!target)throw bad('Person not found',404);
  const current=await env.DB.prepare(`SELECT role_code FROM platform_user_roles WHERE platform_user_id=? AND scope_type='tenant' AND scope_id=? AND active=1 ORDER BY id LIMIT 1`).bind(Number(target.platform_user_id),companyId).first();
  if(current?.role_code==='owner'&&actorRole!=='owner')throw bad('Only the owner can change owner access',403);
  if(current?.role_code==='owner'&&role!=='owner'){
    const owners=await env.DB.prepare(`SELECT COUNT(*) count FROM platform_user_roles WHERE scope_type='tenant' AND scope_id=? AND role_code='owner' AND active=1`).bind(companyId).first();if(Number(owners?.count||0)<=1)throw bad('The organization must retain at least one owner',409);
  }
  await env.DB.prepare(`UPDATE platform_user_roles SET active=0,updated_at=CURRENT_TIMESTAMP WHERE platform_user_id=? AND scope_type='tenant' AND scope_id=?`).bind(Number(target.platform_user_id),companyId).run();
  await env.DB.prepare(`INSERT INTO platform_user_roles(platform_user_id,role_code,scope_type,scope_id,active) VALUES(?,?,?,?,1)`).bind(Number(target.platform_user_id),role,'tenant',companyId).run();
  await audit(env,{session,action:'organization.person.role_changed',resourceType:'person',resourceId:Number(identityId),metadata:{roleCode:role,previousRole:current?.role_code||null,requestId}});
  return {identityId:Number(identityId),roleCode:role,roleLabel:ROLE_LABELS[role]||role};
}

export async function setOrganizationPersonActive(env,session,identityId,active,requestId){
  const actorRole=await assertOrganizationAdmin(env,session),companyId=Number(session.tenantId);
  const target=await env.DB.prepare(`SELECT ai.id,ai.role,ai.active,ai.driver_id,pu.id platform_user_id FROM auth_identities ai LEFT JOIN platform_users pu ON pu.principal_type='tenant' AND pu.principal_id=ai.id WHERE ai.id=? AND ai.company_id=? LIMIT 1`).bind(Number(identityId),companyId).first();
  if(!target)throw bad('Person not found',404);
  const current=await env.DB.prepare(`SELECT role_code FROM platform_user_roles WHERE platform_user_id=? AND scope_type='tenant' AND scope_id=? AND active=1 ORDER BY id LIMIT 1`).bind(Number(target.platform_user_id),companyId).first();
  if(current?.role_code==='owner'&&!active){const owners=await env.DB.prepare(`SELECT COUNT(*) count FROM platform_user_roles WHERE scope_type='tenant' AND scope_id=? AND role_code='owner' AND active=1`).bind(companyId).first();if(Number(owners?.count||0)<=1)throw bad('The organization must retain at least one active owner',409);if(actorRole!=='owner')throw bad('Only the owner can deactivate an owner',403);}
  if(target.driver_id){await env.DB.prepare(`UPDATE drivers SET active=? WHERE id=? AND company_id=?`).bind(active?1:0,Number(target.driver_id),companyId).run().catch(recoveryError=>{throw authorityUnavailable("driver_access_state_sync",recoveryError);});}
  await env.DB.prepare(`UPDATE auth_identities SET active=?,session_version=session_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(active?1:0,Number(identityId)).run();
  await env.DB.prepare(`UPDATE platform_users SET account_state=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(active?'active':'deactivated',Number(target.platform_user_id)).run();
  await env.DB.prepare(`UPDATE platform_user_actors SET active=?,updated_at=CURRENT_TIMESTAMP WHERE platform_user_id=?`).bind(active?1:0,Number(target.platform_user_id)).run();
  await audit(env,{session,action:active?'organization.person.activated':'organization.person.deactivated',resourceType:'person',resourceId:Number(identityId),metadata:{requestId}});
  return {identityId:Number(identityId),active:Boolean(active)};
}

export async function getOrganizationCapabilities(env,session){
  const companyId=Number(session?.tenantId||0);if(!companyId)return {items:[]};
  const rows=(await env.DB.prepare(`SELECT cc.code,cc.label,cc.domain_code,cc.description,cc.status registry_status,COALESCE(oce.status,'eligible') eligibility_status,COALESCE(oce.active,1) active,oce.reason_code,oce.version FROM canonical_capability_registry cc LEFT JOIN organization_capability_eligibility oce ON oce.capability_code=cc.code AND oce.company_id=? AND oce.active=1 WHERE cc.status='active' ORDER BY CASE cc.code WHEN 'organization' THEN 1 WHEN 'people' THEN 2 WHEN 'mission' THEN 3 WHEN 'logistics' THEN 4 ELSE 5 END,cc.label`).bind(companyId).all()).results||[];
  return {items:rows.map(r=>({code:r.code,label:r.label,domainCode:r.domain_code,description:r.description,stage:'SUPPORTED → AVAILABLE → ELIGIBLE → ENTITLED → ENABLED',supported:r.registry_status==='active',available:true,eligible:r.eligibility_status==='eligible',entitled:null,enabled:false,eligibilityStatus:r.eligibility_status,reasonCode:r.reason_code,version:r.version}))};
}
