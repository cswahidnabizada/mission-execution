// 10.53.0: platform_product_test_scenarios uses ON DELETE SET NULL for company/mission references; scenario records preserve release-test history.
import {canonicalFirst} from "../../core/canonical-db.js";
// 10.37.2: organization_lifecycle_transitions is preserved because company deletion is logical (deletion_status), not physical.
import * as authRepo from "../../repositories/auth.repository.js";
import * as executorRepo from "../../repositories/executor.repository.js";
import * as verificationRepo from "../../repositories/verification.repository.js";
import { verifyPassword,hashPassword } from "../../security/password.js";
import { getSubscriptionByCompany } from "../../repositories/subscription.repository.js";
import { deleteStripeCustomer, deleteStripeSubscription } from "../subscriptions/stripe.service.js";
import {completeActivationRequestsForFields} from "../../security/activation-review.service.js";
import {prepareCriticalAudit,completeCriticalAudit} from "../../security/critical-audit.service.js";
import {canonicalAssignmentRevokeStatements} from '../../security/mission-assignment-authority.service.js';
import {deleteSemanticMemoryForCompany} from '../../extensions/agentic-layer/agent-semantic-memory.service.js';


// Frozen historical assignment archives covered by deletion policy: mission_executor_assignments, mission_tenant_driver_assignments.
// 10.37.10 commercial records are governed company-scoped or configuration-scoped; billing jurisdiction and plan configuration are explicitly accounted for here even when they are not company foreign-key children.
const POLICY_PRESERVED_COMPANY_RELATIONSHIPS = Object.freeze([
  'plan_product_configuration','billing_jurisdiction_policies',
  'mission_messages','mission_files','public_mission_requests','mission_reference_counters','support_requests','tenant_executor_links',
  'mission_tenant_access','driver_operational_profiles','driver_direct_messages','driver_daily_notes',
  'driver_content_preferences','notifications','notification_policy_registry','analytics_policy_registry','mission_exceptions','mission_delivery_proofs','network_customers','network_tenant_trust','network_executor_trust',
  'network_mission_invitations','network_customer_locations','mission_recipient_state','organization_onboarding_records','organization_provisioning_events','mission_management_requirements','mission_cancellations',
  'mission_lifecycle_events','mission_transition_requests','mission_transition_events','mission_custody_cases','consent_records','consent_policy_versions','consent_policy_audit_events','company_management_profiles','external_provider_policies','external_provider_audit_events','backup_recovery_points','organization_invitations','organization_capability_eligibility','backup_restore_requests','backup_reconciliation_events','compliance_evidence_registry','subscription_entitlements','subscription_state_transitions','billing_identities','billing_invoices','billing_payments','billing_provider_events','billing_reconciliation_events','billing_state_transitions','platform_product_verification_runs','mission_assignments','mission_assignment_reconciliation','mission_assignment_subjects','mission_assignment_decisions','mission_outcome_assessments','mission_next_situations','mission_plans','mission_plan_evaluations','agent_semantic_memory_documents','agent_calibration_observations','agent_calibration_profiles','agent_calibration_runs','agent_execution_attempts','agent_execution_recovery_events','external_provider_execution_events','agent_pilot_mission_enrollments','agent_pilot_events','agent_action_autonomy_policies','agent_company_autonomy_config','agent_decision_events','agent_customer_pilot_profiles','agent_pilot_mission_enrollments','agent_pilot_events','agent_outcome_resolution_events','agent_learning_observations','agent_learning_profiles','agent_learning_runs','agent_production_execution_events'
]);
const POLICY_PRESERVED_MISSION_RELATIONSHIPS = Object.freeze([
  'mission_messages','mission_files','public_mission_requests','mission_assignments','mission_assignment_decisions','mission_tenant_access',
  'mission_exceptions','mission_delivery_proofs','mission_access_codes','network_mission_invitations','mission_recipient_state',
  'mission_management_requirements','mission_cancellations','mission_lifecycle_events','mission_transition_requests','mission_transition_events','mission_custody_cases','platform_product_verification_runs','mission_assignments','mission_assignment_reconciliation','mission_assignment_subjects','mission_assignment_decisions','mission_outcome_assessments','mission_next_situations','mission_plans','mission_plan_evaluations','agent_semantic_memory_documents','agent_calibration_observations','agent_calibration_profiles','agent_calibration_runs','agent_execution_attempts','agent_execution_recovery_events','external_provider_execution_events','agent_pilot_mission_enrollments','agent_pilot_events'
]);
const EXECUTOR_ERASURE_RELATIONSHIPS = Object.freeze([
  'tenant_executor_links','public_mission_requests','public_executor_support_requests','network_executor_trust','network_mission_invitations',
  'mission_recipient_state','executor_operational_profiles'
]);
export async function getAccount(env, session) {
  if (session.role === "executor") {
    const p = await executorRepo.findExecutorById(env, Number(session.executorId));
    if (!p) throw notFound("Account not found");
    return {
      accountType: "executor", role: "executor", identityId: Number(p.id), executorId: Number(p.id),
      displayName: p.display_name, login: p.login, email: p.email,
      registeredCompanyName: p.registered_company_name, companyCategory: p.company_category, countryCode:p.country_code||"ZZ",
      workingCities: p.working_cities || [], workingZipCodes: p.working_zip_codes || [], mobile: p.mobile,
      description: p.description, vehicleTypes: p.vehicle_types || [], website: p.website || "",
      lastLoginAt: p.last_login_at || null
    };
  }

  const identity = await authRepo.findIdentityById(env, Number(session.identityId));
  if (!identity) throw notFound("Account not found");
  return {
    accountType: identity.role === "admin" ? "tenant" : "internal-driver",
    role: identity.role, identityId: Number(identity.id), tenantId: Number(identity.company_id),
    driverId: identity.driver_id ? Number(identity.driver_id) : null,
    displayName: identity.display_name || identity.driver_name || "",
    login: identity.login || "", email: identity.email || "",
    companyName: identity.company_name || "",
    companyVerified: identity.company_verification_status === "verified",
    lastLoginAt: identity.last_login_at || null
  };
}

export async function updateAccount(env, session, data) {
  if (session.role === "executor") return updateExecutor(env, session, data);
  const identity = await authRepo.findIdentityById(env, Number(session.identityId));
  if (!identity) throw notFound("Account not found");

  const displayName = clean(data.displayName, 160);
  const login = clean(data.login, 200).toLowerCase();
  const email = clean(data.email, 200).toLowerCase();
  if (!displayName || !login) throw bad("Name and login are required");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw bad("Enter a valid email address");
  await assertLoginAvailable(env, login, "tenant", Number(identity.id));
  if (email) await assertEmailAvailable(env, email, "tenant", Number(identity.id));

  const emailChanged=String(identity.email||"").trim().toLowerCase()!==email;
  const companyName=identity.role==="admin" ? clean(data.companyName,200) : "";
  const companyChanged=identity.role==="admin" && companyName && String(identity.company_name||"").trim()!==companyName;
  const nameChanged=identity.role==="driver" && String(identity.display_name||identity.driver_name||"").trim()!==displayName;
  const wantsPassword=Boolean(String(data.newPassword||data.password||""));
  if(wantsPassword){
    const currentPassword=String(data.currentPassword||"");
    if(!currentPassword || !(await verifyPassword(currentPassword,identity.password_hash,identity.password_salt,identity.password_iterations))) throw forbidden("Current password is incorrect");
    const next=String(data.newPassword||data.password||"");
    const policy=validatePasswordForAccount(next); if(!policy.valid)throw bad(policy.error);
    const hashed=await hashPassword(next);
    await env.DB.prepare(`UPDATE auth_identities SET display_name=?,login=?,email=?,password_hash=?,password_salt=?,password_iterations=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(displayName, login, email || null, hashed.hash,hashed.salt,hashed.iterations,identity.id).run();
    await purgeSessions(env,s=>Number(s.identityId)===Number(identity.id));
  }else{
    await env.DB.prepare(`UPDATE auth_identities SET display_name=?,login=?,email=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(displayName, login, email || null, identity.id).run();
  }
  if (identity.role === "driver" && identity.driver_id) {
    await env.DB.prepare(`UPDATE drivers SET name=? WHERE id=? AND company_id=?`)
      .bind(displayName, identity.driver_id, identity.company_id).run();
  }
  if(companyChanged) await authRepo.updateCompanyName(env,Number(identity.company_id),companyName);
  await invalidateVerificationForAccountChange(env,identity.role==="driver"?"driver":"tenant",Number(identity.role==="driver"?identity.driver_id:identity.company_id),{emailChanged,nameChanged,companyChanged});
  await completeActivationRequestsForFields(env,session,[...(emailChanged?["email"]:[]),...(nameChanged?["identity"]:[]),...(companyChanged?["company"]:[])]);
  return getAccount(env, { ...session, identityId: identity.id });
}

async function updateExecutor(env, session, data) {
  const current = await executorRepo.findExecutorById(env, Number(session.executorId));
  if (!current) throw notFound("Account not found");
  const displayName=clean(data.displayName,160), email=clean(data.email,200).toLowerCase();
  const login=clean(data.login||email,200).toLowerCase();
  if(!displayName||!email||!login) throw bad("Name, login and email are required");
  if(!/^\S+@\S+\.\S+$/.test(email)) throw bad("Enter a valid email address");
  await assertLoginAvailable(env,login,"executor",Number(current.id));
  await assertEmailAvailable(env,email,"executor",Number(current.id));

  const profile={
    registeredCompanyName:clean(data.registeredCompanyName,200), companyCategory:clean(data.companyCategory,64),
    workingCities:list(data.workingCities,60,80), workingZipCodes:list(data.workingZipCodes,30,12),
    mobile:clean(data.mobile,60), description:clean(data.description,1200),
    vehicleTypes:Array.isArray(data.vehicleTypes)?data.vehicleTypes.map(v=>clean(v,40)).filter(Boolean):[],
    website:clean(data.website,300)
  };
  if(!profile.registeredCompanyName||!profile.companyCategory||!profile.workingCities.length||!profile.workingZipCodes.length||!profile.mobile||!profile.description||!profile.vehicleTypes.length)
    throw bad("Complete all required executor profile fields");
  if(profile.workingZipCodes.some(z=>!/^\d{5}$/.test(z))) throw bad("Working ZIP codes must contain 5 digits");
  const emailChanged=String(current.email||'').trim().toLowerCase()!==email;
  const nameChanged=String(current.display_name||'').trim()!==displayName;
  const companyChanged=String(current.registered_company_name||'').trim()!==profile.registeredCompanyName || String(current.company_category||'').trim()!==profile.companyCategory;
  const phoneChanged=String(current.mobile||'').trim()!==profile.mobile;

  const wantsPassword=Boolean(String(data.newPassword||data.password||""));
  if(wantsPassword){
    const currentPassword=String(data.currentPassword||"");
    if(!currentPassword || !(await verifyPassword(currentPassword,current.password_hash,current.password_salt,current.password_iterations))) throw forbidden("Current password is incorrect");
    const next=String(data.newPassword||data.password||"");
    const policy=validatePasswordForAccount(next); if(!policy.valid)throw bad(policy.error);
    const hashed=await hashPassword(next);
    await executorRepo.updateExecutorPassword(env,Number(current.id),hashed);
  }
  await env.DB.prepare(`UPDATE public_executor_identities SET login=?,email=?,display_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(login,email,displayName,current.id).run();
  await env.DB.prepare(`UPDATE public_executor_profiles SET registered_company_name=?,company_category=?,working_cities=?,working_zip_codes=?,mobile=?,description=?,vehicle_types=?,website=?,updated_at=CURRENT_TIMESTAMP WHERE executor_id=?`)
    .bind(profile.registeredCompanyName,profile.companyCategory,JSON.stringify(profile.workingCities),JSON.stringify(profile.workingZipCodes),profile.mobile,profile.description,JSON.stringify(profile.vehicleTypes),profile.website||null,current.id).run();
  await invalidateVerificationForAccountChange(env,"executor",Number(current.id),{emailChanged,nameChanged,companyChanged,phoneChanged});
  await completeActivationRequestsForFields(env,session,[...(emailChanged?["email"]:[]),...(phoneChanged?["phone"]:[]),...(nameChanged?["identity"]:[]),...(companyChanged?["company","profile"]:[])]);
  return getAccount(env,{...session,executorId:current.id});
}

async function invalidateVerificationForAccountChange(env,identityType,identityId,{emailChanged=false,phoneChanged=false,nameChanged=false,companyChanged=false}={}){
  const profile=await verificationRepo.getProfile(env,identityType,Number(identityId));
  if(!profile)return;
  if(emailChanged)await verificationRepo.setCheck(env,profile.id,"email",{status:"pending",method:"email_code",note:"Account email changed; re-verification required"});
  if(phoneChanged)await verificationRepo.setCheck(env,profile.id,"phone",{status:"pending",method:"manual_review",note:"Phone changed; re-verification required"});
  if(nameChanged)await verificationRepo.setCheck(env,profile.id,"identity",{status:"pending",method:"manual_review",note:"Account name changed; identity re-verification required"});
  if(companyChanged)await verificationRepo.setCheck(env,profile.id,"company",{status:"pending",method:"manual_review",note:"Company profile changed; re-verification required"});
  if(emailChanged||phoneChanged||nameChanged||companyChanged){
    const key=await verificationRepo.getActiveTrustKey(env,profile.id);
    if(key?.id&&["active","issued"].includes(String(key.status))){
      await verificationRepo.setTrustKeyStatus(env,key.id,"suspended");
      await verificationRepo.addTrustEvent(env,key.id,"suspended","identity","Account verification data changed; re-verification required");
    }
    if(profile.review_status==="approved")await verificationRepo.setReview(env,profile.id,{status:"pending",trustLevel:0,note:"Verification data changed; review required"});
  }
}

export async function deleteOwnAccount(env, session, { confirmation, password }) {
  if (confirmation !== "DELETE") throw bad("Type DELETE to confirm permanent account deletion");
  if (session.role === "driver") throw forbidden("Internal driver accounts are managed by the tenant admin");
  if (session.role === "executor") return deleteExecutor(env, session, password);
  if (session.role === "admin") return deleteTenant(env, session, password);
  throw forbidden("Account deletion is not available for this session");
}

async function deleteTenant(env, session, password) {
  const identity=await authRepo.findIdentityById(env,Number(session.identityId));
  if(!identity||identity.role!=='admin') throw forbidden('Admin account required');
  if(!(await verifyPassword(password,identity.password_hash,identity.password_salt,identity.password_iterations))) throw forbidden('Current password is incorrect');
  const companyId=Number(identity.company_id);
  void POLICY_PRESERVED_COMPANY_RELATIONSHIPS;
  void POLICY_PRESERVED_MISSION_RELATIONSHIPS;
  const existing=await canonicalFirst(env,`SELECT id FROM privacy_requests WHERE company_id=? AND identity_type='tenant' AND identity_id=? AND request_type='erasure' AND status IN ('received','processing','restricted') ORDER BY id DESC LIMIT 1`,[companyId,companyId],'privacy_request_authority');
  if(existing) throw conflict('Account deletion is already in progress');
  const requestId=await createPrivacyDeletionRequest(env,{companyId,identityType:'tenant',identityId:companyId,reason:'Account owner requested erasure',session});
  const criticalEventId=await prepareCriticalAudit(env,{session,action:'account.erasure',resourceType:'company',resourceId:companyId,metadata:{requestId,mode:'policy_preserving_pseudonymization'}});
  await deleteSemanticMemoryForCompany(env,companyId);
  await env.DB.batch([
    env.DB.prepare(`UPDATE companies SET deletion_status='deleted',deleted_at=CURRENT_TIMESTAMP,deletion_request_id=? WHERE id=?`).bind(requestId,companyId),
    env.DB.prepare(`UPDATE auth_identities SET active=0,deleted_at=CURRENT_TIMESTAMP,session_version=session_version+1,login='deleted-tenant-'||id||'@invalid.onmission',email=NULL,display_name='Deleted account',updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`UPDATE drivers SET active=0,deleted_at=CURRENT_TIMESTAMP,name='Deleted executor',removed_at=COALESCE(removed_at,CURRENT_TIMESTAMP),removal_reason='account_erasure' WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`UPDATE mission_access_codes SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE owner_company_id=?`).bind(companyId),
    env.DB.prepare(`UPDATE organization_compliance_policies SET status='restricted',updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`DELETE FROM agent_action_outcome_profiles WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`DELETE FROM agent_executor_outcome_profiles WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`DELETE FROM agent_organization_outcome_profiles WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`DELETE FROM agent_calibration_observations WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`DELETE FROM agent_calibration_profiles WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`DELETE FROM agent_calibration_runs WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`DELETE FROM agent_learning_profiles WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`DELETE FROM agent_learning_runs WHERE company_id=?`).bind(companyId),
    env.DB.prepare(`UPDATE privacy_requests SET status='processing' WHERE id=?`).bind(requestId)
  ]);
  await purgeSessions(env,s=>Number(s.tenantId)===companyId);
  await completePrivacyDeletionRequest(env,requestId,{status:'restricted',outcomeCode:'ACCOUNT_DEACTIVATED_DATA_PRESERVED_BY_POLICY',outcomeNote:'Account access was revoked and direct identifiers were pseudonymized. Historical operational Truth, audit and legally retained records remain governed by retention policy.'});
  await completeCriticalAudit(env,criticalEventId,{success:true});
  await audit(env,{session:{...session,tenantId:companyId},action:'account.erasure_requested',resourceType:'privacy_request',resourceId:requestId,metadata:{requestType:'erasure',policyVersion:'current'}});
  return { deleted:true, accountType:'tenant', deletionRequestId:requestId, deletionMode:'policy_preserving_pseudonymization' };
}

async function deleteExecutor(env, session, password) {
  const executor=await executorRepo.findExecutorById(env,Number(session.executorId));
  if(!executor) throw notFound('Executor account not found');
  if(!(await verifyPassword(password,executor.password_hash,executor.password_salt,executor.password_iterations))) throw forbidden('Current password is incorrect');
  const executorId=Number(executor.id);
  void EXECUTOR_ERASURE_RELATIONSHIPS;
  const requestId=await createPrivacyDeletionRequest(env,{companyId:null,identityType:'executor',identityId:executorId,reason:'Executor requested erasure',session});
  const criticalEventId=await prepareCriticalAudit(env,{session,action:'account.erasure',resourceType:'executor',resourceId:executorId,metadata:{requestId,mode:'policy_preserving_pseudonymization'}});
  const assignments=(await env.DB.prepare(`SELECT company_id,mission_id FROM mission_assignments WHERE assignee_type='executor' AND assignee_id=? AND status='active'`).bind(executorId).all()).results||[];
  for(const a of assignments){
    await env.DB.batch([...canonicalAssignmentRevokeStatements(env,{companyId:Number(a.company_id),missionId:Number(a.mission_id),reason:'executor_erasure'}),env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(a.mission_id,a.company_id)]);
  }
  await env.DB.batch([
        env.DB.prepare(`DELETE FROM mission_assignments WHERE assignee_type='executor' AND assignee_id=?`).bind(executorId),
    env.DB.prepare(`UPDATE public_executor_identities SET active=0,deleted_at=CURRENT_TIMESTAMP,session_version=session_version+1,login='deleted-executor-'||id||'@invalid.onmission',email='deleted-executor-'||id||'@invalid.onmission',display_name='Deleted executor',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(executorId),
    env.DB.prepare(`UPDATE public_executor_profiles SET registered_company_name='Deleted executor',company_category='deleted',working_cities='[]',working_zip_codes='[]',mobile='',description='',vehicle_types='[]',website=NULL,updated_at=CURRENT_TIMESTAMP WHERE executor_id=?`).bind(executorId),
    env.DB.prepare(`DELETE FROM agent_executor_outcome_profiles WHERE executor_id=?`).bind(executorId),
    env.DB.prepare(`DELETE FROM agent_calibration_observations WHERE executor_id=?`).bind(executorId),
    env.DB.prepare(`DELETE FROM agent_calibration_profiles WHERE scope_type='EXECUTOR' AND scope_key=?`).bind(String(executorId)),
    env.DB.prepare(`UPDATE privacy_requests SET status='restricted' WHERE id=?`).bind(requestId)
  ]);
  await purgeSessions(env,s=>Number(s.executorId)===executorId);
  await completePrivacyDeletionRequest(env,requestId,{status:'restricted',outcomeCode:'EXECUTOR_DEACTIVATED_DATA_PRESERVED_BY_POLICY',outcomeNote:'Executor access was revoked and direct identifiers were pseudonymized. Historical operational records remain governed by retention policy.'});
  await completeCriticalAudit(env,criticalEventId,{success:true});
  await audit(env,{session:{...session,tenantId:0},action:'account.erasure_requested',resourceType:'privacy_request',resourceId:requestId,metadata:{requestType:'erasure',policyVersion:'current'}});
  return { deleted:true, accountType:'executor', deletionRequestId:requestId, deletionMode:'policy_preserving_pseudonymization' };
}

async function createPrivacyDeletionRequest(env,{companyId=null,identityType,identityId,reason,session}){
  const result=await env.DB.prepare(`INSERT INTO privacy_requests(company_id,identity_type,identity_id,request_type,status,reason,policy_version) VALUES(?,?,?,?, 'received', ?, 'current')`).bind(companyId,identityType,Number(identityId), 'erasure',reason).run();
  return Number(result.meta.last_row_id);
}
async function completePrivacyDeletionRequest(env,id,{status,outcomeCode,outcomeNote}){
  await env.DB.prepare(`UPDATE privacy_requests SET status=?,outcome_code=?,outcome_note=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,outcomeCode,outcomeNote,id).run();
}

export async function hydrateSession(env, session) {
  if(!session) return null;
  if(session.role==="executor"){
    const p=await executorRepo.findExecutorById(env,Number(session.executorId));
    if(!p)return null;
    const vp=await verificationRepo.getProfile(env,"executor",Number(p.id));
    const tk=vp?await verificationRepo.getActiveTrustKey(env,Number(vp.id)):null;
    const companyVerified=Boolean(vp?.review_status==="approved"&&tk?.status==="active");
    return { ...session, identityId:Number(p.id), executorId:Number(p.id), login:p.login, displayName:p.display_name, companyName:p.registered_company_name||null, companyVerified, countryCode:p.country_code||"ZZ", verificationComplete:companyVerified };
  }
  if(!session.identityId) return session;
  const i=await authRepo.findIdentityById(env,Number(session.identityId));
  if(!i)return null;
  const roleRow=await canonicalFirst(env,`SELECT pur.role_code FROM platform_users pu JOIN platform_user_roles pur ON pur.platform_user_id=pu.id AND pur.active=1 AND pur.scope_type='tenant' AND pur.scope_id=? WHERE pu.principal_type='tenant' AND pu.principal_id=? ORDER BY CASE pur.role_code WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 WHEN 'operator' THEN 4 WHEN 'driver' THEN 5 ELSE 6 END,pur.id LIMIT 1`,[Number(i.company_id),Number(i.id)],'platform_user_role_authority');
  return { ...session, role:i.role, tenantId:Number(i.company_id), driverId:i.driver_id?Number(i.driver_id):null, organizationRole:roleRow?.role_code||null,
    driverName:i.driver_name||null, login:i.login, displayName:i.display_name||i.driver_name||null,
    companyName:i.company_name||null, companyVerified:i.company_verification_status==="verified", countryCode:i.country_code||"ZZ", verificationComplete:i.company_verification_status==="verified" };
}

function validatePasswordForAccount(password){
  const value=String(password||"");
  if(value.length<12||value.length>128)return {valid:false,error:"Password must be 12–128 characters"};
  return {valid:true};
}

async function assertLoginAvailable(env,login,type,id){
  const a=await env.DB.prepare(`SELECT id FROM auth_identities WHERE LOWER(login)=LOWER(?) AND NOT (?='tenant' AND id=?) LIMIT 1`).bind(login,type,id).first();
  if(a)throw conflict("Login/email is already in use");
  const e=await env.DB.prepare(`SELECT id FROM public_executor_identities WHERE LOWER(login)=LOWER(?) AND NOT (?='executor' AND id=?) LIMIT 1`).bind(login,type,id).first();
  if(e)throw conflict("Login/email is already in use");
}
async function assertEmailAvailable(env,email,type,id){
  const a=await env.DB.prepare(`SELECT id FROM auth_identities WHERE email IS NOT NULL AND LOWER(email)=LOWER(?) AND NOT (?='tenant' AND id=?) LIMIT 1`).bind(email,type,id).first();
  if(a)throw conflict("Email is already in use");
  const e=await env.DB.prepare(`SELECT id FROM public_executor_identities WHERE LOWER(email)=LOWER(?) AND NOT (?='executor' AND id=?) LIMIT 1`).bind(email,type,id).first();
  if(e)throw conflict("Email is already in use");
}
export async function purgeSessions(env,predicate){
  let cursor=undefined;
  do{
    const page=await env.KV_BINDING.list({prefix:"session:",cursor});
    for(const key of page.keys||[]){
      try{const raw=await env.KV_BINDING.get(key.name);const s=raw?JSON.parse(raw):null;if(s&&predicate(s))await env.KV_BINDING.delete(key.name);}catch{}
    }
    cursor=page.list_complete?undefined:page.cursor;
  }while(cursor);
}
function list(v,maxItems,maxLen){const raw=Array.isArray(v)?v:String(v||"").split(",");return [...new Set(raw.map(x=>clean(x,maxLen)).filter(Boolean))].slice(0,maxItems);}
function clean(v,max){return String(v??"").trim().slice(0,max);}
function make(m,s){const e=new Error(m);e.status=s;return e;}const bad=m=>make(m,400),forbidden=m=>make(m,403),notFound=m=>make(m,404),conflict=m=>make(m,409);
