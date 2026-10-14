import { canonicalFirst, canonicalAll } from '../../core/canonical-db.js';
import { createSession, destroySession, getSession, publicSession, sessionCookie, clearSessionCookie } from '../../core/auth-session.js';
import { hydrateSession, purgeSessions } from '../account/account.service.js';
import { createOrganizationOnboarding } from '../onboarding/organization-onboarding.service.js';
import { controlRecord } from '../../security/platform-data-control.service.js';
import { auditAdminControl } from '../../security/admin-control-audit.service.js';
import { RELEASE_VERSION } from '../../core/release.js';
import { getDemoFixture } from './demo-fixture.service.js';
import { hashPassword } from '../../security/password.js';
import * as authRepo from '../../repositories/auth.repository.js';
import { getPlatformAdministratorMissionById } from '../missions/platform-admin-query.service.js';

export const USER_EXPERIENCE_LAB_VERSION = `user-experience-lab.${RELEASE_VERSION}`;
export const USER_CONTEXT_TTL_SECONDS = 30 * 60;
export const DEMO_PRODUCT_VERSION = `demo-product.${RELEASE_VERSION}`;
export const DEMO_TENANT_TTL_DAYS = 7;
const DEMO_PREFIX = 'ON Mission Demo';
const DEMO_PRODUCT_CODE = 'onmission-logistics-demo';
const DEMO_SIDE_EFFECT_POLICY = 'SIMULATED_EXTERNAL_SIDE_EFFECTS';
export const DEMO_SCENARIO_STAGES = Object.freeze({
  logistics_delivery:Object.freeze(['OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','OUTCOME','LEARN','NEXT SITUATION']),
  failed_delivery:Object.freeze(['OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT SITUATION']),
  field_inspection:Object.freeze(['OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','OUTCOME','LEARN','NEXT SITUATION'])
});
const DEMO_SCENARIOS = Object.freeze({
  logistics_delivery: {label:'Logistics Delivery',sectorCode:'logistics',countryCode:'DE',description:'Full governed mission journey with simulated external effect.'},
  failed_delivery: {label:'Failed Delivery + Recovery',sectorCode:'logistics',countryCode:'DE',description:'Unknown effect followed by safe recovery and reassessment.'},
  field_inspection: {label:'Field Inspection',sectorCode:'field_service',countryCode:'DE',description:'Second-sector demonstration without a second execution engine.'}
});

function fail(message,status=400,code=message){const e=new Error(message);e.status=status;e.code=code;return e;}
function text(v,max=240){return String(v??'').trim().slice(0,max);}
function int(v){const n=Number(v);return Number.isFinite(n)?Math.trunc(n):0;}
function safeMode(mode){const m=String(mode||'view').toLowerCase();if(!['view','act'].includes(m))throw fail('USER_CONTEXT_MODE_INVALID',400);return m;}
function reason(v){const r=text(v,500);if(r.length<8)throw fail('USER_CONTEXT_REASON_REQUIRED',422);return r;}
function actorForAdmin(admin){return {role:'platform_super_administrator',id:admin?.id||null};}

export async function listUserExperienceTenants(env,{q='',limit=50}={}){
  const n=Math.min(100,Math.max(1,int(limit)||50));
  const s=`%${text(q,120).replace(/[%_]/g,c=>`\\${c}`)}%`;
  return (await canonicalAll(env,`
    SELECT c.id,c.name,c.deletion_status,cmp.country_code,cmp.sector_code,cmp.status management_status,
      ep.environment_code,ep.product_code,ep.status environment_status,ep.side_effect_policy_code,ep.scenario_code,ep.expires_at,
      (SELECT COUNT(*) FROM auth_identities ai WHERE ai.company_id=c.id AND ai.active=1) user_count
    FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id LEFT JOIN platform_environment_profiles ep ON ep.company_id=c.id
    WHERE c.deletion_status='active' AND (c.name LIKE ? ESCAPE '\\' OR COALESCE(cmp.legal_name,'') LIKE ? ESCAPE '\\' OR COALESCE(cmp.trading_name,'') LIKE ? ESCAPE '\\')
    ORDER BY c.id DESC LIMIT ?`,[s,s,s,n],'user_experience_lab.tenant_authority')).map(r=>({id:Number(r.id),name:r.name,countryCode:r.country_code||null,sectorCode:r.sector_code||'general',status:r.management_status||r.deletion_status,userCount:Number(r.user_count||0),environmentCode:r.environment_code||'PRODUCTION',productCode:r.product_code||'on_mission',environmentStatus:r.environment_status||null,sideEffectPolicy:r.side_effect_policy_code||'REAL_OPERATIONAL_EFFECTS',scenarioCode:r.scenario_code||null,expiresAt:r.expires_at||null,isDemo:r.environment_code==='DEMO'}));
}

export async function listUserExperienceUsers(env,{tenantId=0,q='',limit=100}={}){
  const n=Math.min(200,Math.max(1,int(limit)||100));
  const company=int(tenantId);
  if(!company)throw fail('USER_CONTEXT_TENANT_REQUIRED',422);
  const s=`%${text(q,120).replace(/[%_]/g,c=>`\\${c}`)}%`;
  return (await canonicalAll(env,`
    SELECT ai.id,ai.company_id,ai.login,ai.display_name,ai.role,ai.driver_id,ai.active,c.name company_name,
      cmp.country_code,cmp.sector_code
    FROM auth_identities ai JOIN companies c ON c.id=ai.company_id
    LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id
    WHERE ai.company_id=? AND (ai.login LIKE ? ESCAPE '\\' OR COALESCE(ai.display_name,'') LIKE ? ESCAPE '\\')
    ORDER BY CASE ai.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'operator' THEN 2 WHEN 'driver' THEN 3 ELSE 4 END, ai.id LIMIT ?`,[company,s,s,n],'user_experience_lab.identity_authority')).map(r=>({id:Number(r.id),tenantId:Number(r.company_id),login:r.login,displayName:r.display_name||r.login,role:r.role,driverId:r.driver_id?Number(r.driver_id):null,active:Number(r.active)===1,companyName:r.company_name,countryCode:r.country_code||null,sectorCode:r.sector_code||'general'}));
}

async function targetIdentity(env,identityId){
  const row=await canonicalFirst(env,`SELECT ai.*,c.name company_name,cmp.country_code,cmp.sector_code FROM auth_identities ai JOIN companies c ON c.id=ai.company_id LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE ai.id=? LIMIT 1`,[int(identityId)],'user_experience_lab.identity_authority');
  if(!row)throw fail('USER_CONTEXT_TARGET_NOT_FOUND',404);
  if(Number(row.active)!==1)throw fail('USER_CONTEXT_TARGET_INACTIVE',409);
  if(String(row.role||'')==='platform_super_administrator')throw fail('USER_CONTEXT_TARGET_FORBIDDEN',403);
  return row;
}

function contextFromSession(session){
  const a=session?.actingAs;
  if(!a)return null;
  const exp=Number(a.expiresAt||0);
  if(!exp||exp<=Date.now())return null;
  return {contextId:a.contextId,mode:a.mode,reason:a.reason,targetIdentityId:Number(a.targetIdentityId),targetTenantId:Number(a.targetTenantId),startedAt:a.startedAt,expiresAt:exp,remainingSeconds:Math.max(0,Math.ceil((exp-Date.now())/1000)),release:a.release||RELEASE_VERSION,demoSession:a.demoSession||null};
}

export async function getUserExperienceContext(request,env){
  const session=await getSession(request,env);
  const context=contextFromSession(session);
  return {version:USER_EXPERIENCE_LAB_VERSION,active:Boolean(context),context,session:session?publicSession(session):null};
}

export async function startUserExperienceContext(env,request,admin,{identityId,mode='view',reason:why,demoSession=null}={}){
  const target=await targetIdentity(env,identityId);
  const selectedMode=safeMode(mode); const selectedReason=reason(why);
  if(!Number(target.company_id))throw fail('USER_CONTEXT_TENANT_INVALID',409);
  const contextId=crypto.randomUUID();
  const expiresAt=Date.now()+USER_CONTEXT_TTL_SECONDS*1000;
  const base={role:target.role,organizationRole:null,accessType:target.role==='admin'?'admin':'company',tenantId:Number(target.company_id),identityId:Number(target.id),identityType:'tenant',driverId:target.driver_id?Number(target.driver_id):null,login:target.login,displayName:target.display_name,companyName:target.company_name,companyVerified:false,countryCode:target.country_code||null,authMethod:'platform_delegated',sessionVersion:Number(target.session_version||1)};
  const hydrated=await hydrateSession(env,base); if(!hydrated)throw fail('USER_CONTEXT_TARGET_UNAVAILABLE',409);
  const delegated={...hydrated,actingAs:{contextId,mode:selectedMode,reason:selectedReason,targetIdentityId:Number(target.id),targetTenantId:Number(target.company_id),startedAt:new Date().toISOString(),expiresAt,release:RELEASE_VERSION,demoSession:demoSession||null}};
  const created=await createSession(env,delegated);
  const actor=actorForAdmin(admin);
  await auditAdminControl(env,{actor,action:`platform.user_experience.${selectedMode==='view'?'view_as_started':'act_as_started'}`,resourceType:'user_context',resourceId:Number(target.id),targetCompanyId:Number(target.company_id),requestId:null,metadata:{contextId,mode:selectedMode,reason:selectedReason,expiresAt,release:RELEASE_VERSION}});
  return {token:created.token,session:delegated,context:contextFromSession(delegated)};
}

export async function endUserExperienceContext(env,request,admin,{requestId=null}={}){
  const session=await getSession(request,env);
  const context=contextFromSession(session);
  if(!context)return {active:false};
  await destroySession(request,env);
  await auditAdminControl(env,{actor:actorForAdmin(admin),action:'platform.user_experience.context_ended',resourceType:'user_context',resourceId:context.targetIdentityId,targetCompanyId:context.targetTenantId,requestId,metadata:{contextId:context.contextId,mode:context.mode,reason:context.reason}});
  return {active:false,endedContextId:context.contextId};
}

export async function getDemoProduct(env){
  const counts=await canonicalFirst(env,`SELECT COUNT(*) active_demo_tenants FROM platform_environment_profiles WHERE environment_code='DEMO' AND status='ACTIVE'` ,[],'demo_environment_authority');
  const scenarios=Object.entries(DEMO_SCENARIOS).map(([code,v])=>({code,...v}));
  return {version:DEMO_PRODUCT_VERSION,productCode:DEMO_PRODUCT_CODE,environmentCode:'DEMO',sideEffectPolicy:DEMO_SIDE_EFFECT_POLICY,activeTenantCount:Number(counts?.active_demo_tenants||0),scenarios,demoFixture:await getDemoFixture(env),architecture:{sameCanonicalCore:true,separateExecutionEngine:false,missionTruthCanonical:true,assignmentTruthCanonical:true,authorizationCanonical:true,effectMode:'SIMULATED_ONLY',externalSideEffects:false}};
}

export async function listDemoTenants(env,{limit=50}={}){
  const n=Math.min(100,Math.max(1,int(limit)||50));
  return (await canonicalAll(env,`SELECT c.id,c.name,cmp.country_code,cmp.sector_code,CASE WHEN ep.expires_at IS NOT NULL AND ep.expires_at<=CURRENT_TIMESTAMP THEN 'EXPIRED' ELSE ep.status END environment_status,ep.scenario_code,ep.expires_at,(SELECT COUNT(*) FROM auth_identities ai WHERE ai.company_id=c.id AND ai.active=1) user_count FROM companies c JOIN platform_environment_profiles ep ON ep.company_id=c.id AND ep.environment_code='DEMO' LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.deletion_status='active' ORDER BY c.id DESC LIMIT ?`,[n],'demo_environment_authority')).map(r=>({id:Number(r.id),name:r.name,countryCode:r.country_code||null,sectorCode:r.sector_code||'general',status:r.environment_status,scenarioCode:r.scenario_code||null,expiresAt:r.expires_at||null,userCount:Number(r.user_count||0)}));
}

export async function createDemoUser(env,admin,{tenantId,displayName='Demo User',login,role='admin'}={}){
  const companyId=int(tenantId); if(!companyId)throw fail('DEMO_TENANT_REQUIRED',422);
  const envRow=await canonicalFirst(env,`SELECT company_id,status,expires_at FROM platform_environment_profiles WHERE company_id=? AND environment_code='DEMO' LIMIT 1`,[companyId],'demo_environment_authority');
  if(!envRow||envRow.status!=='ACTIVE')throw fail('DEMO_TENANT_NOT_ACTIVE',409);
  if(envRow.expires_at&&Date.parse(String(envRow.expires_at).replace(' ','T')+'Z')<=Date.now())throw fail('DEMO_TENANT_EXPIRED',409);
  const selectedRole=String(role||'admin').toLowerCase();
  const allowedRoles=new Set(['admin','manager','operator']);
  if(!allowedRoles.has(selectedRole))throw fail('DEMO_USER_ROLE_NOT_YET_SUPPORTED',409,'DEMO_USER_ROLE_NOT_YET_SUPPORTED');
  const rawLogin=text(login,240).toLowerCase();
  if(!rawLogin||!rawLogin.includes('@'))throw fail('DEMO_USER_LOGIN_REQUIRED',422);
  const existing=await authRepo.findIdentityByLogin(env,rawLogin); if(existing)throw fail('DEMO_USER_LOGIN_ALREADY_IN_USE',409);
  const generatedPassword=`ONM-DEMO-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const hashed=await hashPassword(generatedPassword);
  const identityId=await authRepo.createIdentity(env,{companyId,role:selectedRole,login:rawLogin,email:rawLogin,displayName:text(displayName,160)||'Demo User',passwordHash:hashed.hash,passwordSalt:hashed.salt,passwordIterations:hashed.iterations,mustChangePassword:true});
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_users(principal_type,principal_id,account_state) VALUES('tenant',?,'active')`).bind(identityId).run();
  const pu=await env.DB.prepare(`SELECT id FROM platform_users WHERE principal_type='tenant' AND principal_id=? LIMIT 1`).bind(identityId).first();
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_actors(platform_user_id,actor_type,active) VALUES(?, 'tenant',1)`).bind(Number(pu.id)).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_memberships(platform_user_id,membership_type,membership_id,status) VALUES(?, 'tenant',?,'active')`).bind(Number(pu.id),companyId).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_roles(platform_user_id,role_code,scope_type,scope_id,active) VALUES(?,?,?,?,1)`).bind(Number(pu.id),selectedRole,'tenant',companyId).run();
  await auditAdminControl(env,{actor:actorForAdmin(admin),action:'platform.demo.user_created',resourceType:'identity',resourceId:identityId,targetCompanyId:companyId,metadata:{displayName:text(displayName,160),role:selectedRole,credentialsExposed:false,temporaryPassword:true}});
  return {identityId,tenantId:companyId,displayName:text(displayName,160)||'Demo User',role:selectedRole,login:rawLogin,credentialsExposed:false,accessMethod:'Super Admin User Experience Lab / View or Act as User'};
}

export async function createDemoScenario(env,admin,{tenantId,scenarioCode='logistics_delivery',missionId=0,reason:why}={}){
  const companyId=int(tenantId); if(!companyId)throw fail('DEMO_TENANT_REQUIRED',422);
  const selectedMission=int(missionId);
  const scenario=DEMO_SCENARIOS[String(scenarioCode||'')]; if(!scenario)throw fail('DEMO_SCENARIO_NOT_FOUND',404);
  const envRow=await canonicalFirst(env,`SELECT company_id,status,expires_at FROM platform_environment_profiles WHERE company_id=? AND environment_code='DEMO' LIMIT 1`,[companyId],'demo_environment_authority');
  if(!envRow||envRow.status!=='ACTIVE')throw fail('DEMO_TENANT_NOT_ACTIVE',409);
  if(envRow.expires_at&&Date.parse(String(envRow.expires_at).replace(' ','T')+'Z')<=Date.now())throw fail('DEMO_TENANT_EXPIRED',409);
  if(selectedMission){const mission=await getPlatformAdministratorMissionById(env,{missionId:selectedMission,companyId});if(!mission)throw fail('DEMO_MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);}
  const result=await env.DB.prepare(`INSERT INTO demo_scenario_instances(company_id,scenario_code,status,blueprint_version,mission_id,seed_json) VALUES(?,?, 'READY','1',?,?)`).bind(companyId,String(scenarioCode),selectedMission||null,JSON.stringify({countryCode:scenario.countryCode,sectorCode:scenario.sectorCode,sideEffectPolicy:DEMO_SIDE_EFFECT_POLICY,reason:text(why||'Demo scenario created',500)})).run();
  const id=Number(result.meta.last_row_id);
  const stages=[...(DEMO_SCENARIO_STAGES[String(scenarioCode)]||DEMO_SCENARIO_STAGES.logistics_delivery)];
  for(let i=0;i<stages.length;i++) await env.DB.prepare(`INSERT INTO demo_execution_events(scenario_instance_id,company_id,sequence,stage,status,evidence_json) VALUES(?,?,?,?,'READY',?)`).bind(id,companyId,i+1,stages[i],JSON.stringify({simulationOnly:true,canonicalTruthUnchanged:true,externalSideEffects:false})).run();
  await env.DB.prepare(`UPDATE platform_environment_profiles SET scenario_code=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(String(scenarioCode),companyId).run();
  await auditAdminControl(env,{actor:actorForAdmin(admin),action:'platform.demo.scenario_created',resourceType:'demo_scenario',resourceId:id,targetCompanyId:companyId,metadata:{scenarioCode,reason:text(why||'Demo scenario created',500)}});
  return {scenarioId:id,tenantId:companyId,scenarioCode,scenario,status:'READY',stages};
}

export async function advanceDemoScenario(env,admin,{scenarioId,sequence,status='SIMULATED',evidence={}}={}){
  const id=int(scenarioId);const seq=int(sequence);if(!id||!seq)throw fail('DEMO_SCENARIO_CONTEXT_REQUIRED',422);
  const row=await canonicalFirst(env,`SELECT d.id,d.company_id,d.status,d.scenario_code,d.current_sequence,ep.status environment_status FROM demo_scenario_instances d JOIN platform_environment_profiles ep ON ep.company_id=d.company_id AND ep.environment_code='DEMO' WHERE d.id=? LIMIT 1`,[id],'demo_environment_authority');
  if(!row||row.environment_status!=='ACTIVE')throw fail('DEMO_SCENARIO_NOT_ACTIVE',409);
  if(!['SIMULATED','VERIFIED','BLOCKED'].includes(String(status)))throw fail('DEMO_SCENARIO_STATUS_INVALID',422);
  const stages=DEMO_SCENARIO_STAGES[String(row.scenario_code)]||DEMO_SCENARIO_STAGES.logistics_delivery;
  const expectedSequence=Number(row.current_sequence||0)+1;
  if(seq!==expectedSequence)throw fail('DEMO_SCENARIO_OUT_OF_ORDER',409);
  const event=await canonicalFirst(env,`SELECT id,sequence,stage,status FROM demo_execution_events WHERE scenario_instance_id=? AND sequence=? LIMIT 1`,[id,seq],'demo_execution_authority');
  if(!event)throw fail('DEMO_SCENARIO_STAGE_NOT_FOUND',404);
  if(String(event.stage)!==String(stages[seq-1]))throw fail('DEMO_SCENARIO_STAGE_SEQUENCE_INVALID',409);
  const safeEvidence={...(evidence||{}),simulationOnly:true,canonicalTruthUnchanged:true,externalSideEffects:false};
  const eventUpdate=await env.DB.prepare(`UPDATE demo_execution_events SET status=?,evidence_json=? WHERE id=? AND status='READY'`).bind(String(status),JSON.stringify(safeEvidence),Number(event.id)).run();
  if(Number(eventUpdate.meta?.changes||eventUpdate.changes||0)!==1)throw fail('DEMO_SCENARIO_EVENT_CONCURRENCY_CONFLICT',409);
  const isTerminal=seq===stages.length;
  const nextStatus=String(status)==='BLOCKED'?'FAILED':(isTerminal?'COMPLETED':'RUNNING');
  const update=await env.DB.prepare(`UPDATE demo_scenario_instances SET status=?,current_sequence=?,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),completed_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND current_sequence=?`).bind(nextStatus,seq,isTerminal?1:0,id,Number(row.current_sequence||0)).run();
  if(Number(update.meta?.changes||update.changes||0)!==1)throw fail('DEMO_SCENARIO_CONCURRENCY_CONFLICT',409);
  await auditAdminControl(env,{actor:actorForAdmin(admin),action:'platform.demo.scenario_advanced',resourceType:'demo_scenario',resourceId:id,targetCompanyId:Number(row.company_id),metadata:{sequence:seq,stage:event.stage,status,simulationOnly:true}});
  return {scenarioId:id,tenantId:Number(row.company_id),scenarioCode:row.scenario_code,stage:event.stage,sequence:seq,status:nextStatus,evidence:safeEvidence};
}

export async function resetDemoScenario(env,admin,{scenarioId,reason:why}={}){
  const id=int(scenarioId);if(!id)throw fail('DEMO_SCENARIO_REQUIRED',422);
  const row=await canonicalFirst(env,`SELECT d.id,d.company_id,d.scenario_code,ep.status environment_status FROM demo_scenario_instances d JOIN platform_environment_profiles ep ON ep.company_id=d.company_id AND ep.environment_code='DEMO' WHERE d.id=? LIMIT 1`,[id],'demo_execution_authority');
  if(!row||row.environment_status!=='ACTIVE')throw fail('DEMO_SCENARIO_NOT_ACTIVE',409);
  await env.DB.prepare(`UPDATE demo_execution_events SET status='READY',evidence_json=? WHERE scenario_instance_id=?`).bind(JSON.stringify({simulationOnly:true,canonicalTruthUnchanged:true,externalSideEffects:false,reset:true}),id).run();
  await env.DB.prepare(`UPDATE demo_scenario_instances SET status='READY',current_sequence=0,started_at=NULL,completed_at=NULL,reset_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  await auditAdminControl(env,{actor:actorForAdmin(admin),action:'platform.demo.scenario_reset',resourceType:'demo_scenario',resourceId:id,targetCompanyId:Number(row.company_id),metadata:{reason:text(why||'Reset demo scenario',500)}});
  return {reset:true,scenarioId:id,tenantId:Number(row.company_id),status:'READY'};
}

export async function getDemoScenario(env,{scenarioId=0}={}){
  const id=int(scenarioId);if(!id)throw fail('DEMO_SCENARIO_REQUIRED',422);
  const row=await canonicalFirst(env,`SELECT id,company_id,scenario_code,status,blueprint_version,mission_id,seed_json,started_at,completed_at,reset_at FROM demo_scenario_instances WHERE id=? LIMIT 1`,[id],'demo_execution_authority');
  if(!row)throw fail('DEMO_SCENARIO_NOT_FOUND',404);
  const events=await canonicalAll(env,`SELECT sequence,stage,status,evidence_json,created_at FROM demo_execution_events WHERE scenario_instance_id=? ORDER BY sequence`,[id],'demo_execution_authority');
  return {scenarioId:Number(row.id),tenantId:Number(row.company_id),scenarioCode:row.scenario_code,status:row.status,missionId:row.mission_id?Number(row.mission_id):null,seed:parseJson(row.seed_json),events:events.map(e=>({sequence:Number(e.sequence),stage:e.stage,status:e.status,evidence:parseJson(e.evidence_json),createdAt:e.created_at}))};
}

export async function createDemoTenant(env,admin,{countryCode='DE',sectorCode='logistics',reason:why}={}){
  const selectedReason=reason(why||'Create disposable governed demo tenant');
  const country=text(countryCode,2).toUpperCase();
  const sector=text(sectorCode,80)||'general';
  const suffix=crypto.randomUUID().slice(0,8).toUpperCase();
  const email=`demo-${suffix.toLowerCase()}@invalid.onmission.demo`;
  const password=`ONM-Demo-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const result=await createOrganizationOnboarding(env,{idempotencyKey:`uxlab:${suffix}`,countryCode:country,companyName:`${DEMO_PREFIX} ${suffix}`,organizationType:'company',sectorCode:sector,purposeCode:'operational_communications',adminName:'ON Mission Demo User',email,password,registrationNumber:`DEMO-${suffix}`,registeredAddressLine1:'Demo address',registeredPostalCode:'20095',registeredCity:'Hamburg'},{requestId:crypto.randomUUID(),actor:{type:'platform_super_administrator'}});
  const companyId=Number(result.companyId);
  await env.DB.prepare(`INSERT INTO platform_environment_profiles(company_id,environment_code,product_code,status,side_effect_policy_code,metadata_json,created_by_type,created_by_id) VALUES(?,'DEMO',?,'ACTIVE',?,?,'platform_super_administrator',?) ON CONFLICT(company_id) DO UPDATE SET environment_code='DEMO',product_code=excluded.product_code,status='ACTIVE',side_effect_policy_code=excluded.side_effect_policy_code,updated_at=CURRENT_TIMESTAMP`).bind(companyId,DEMO_PRODUCT_CODE,DEMO_PRODUCT_CODE,country,DEMO_SIDE_EFFECT_POLICY,JSON.stringify({disposable:true,credentialsExposed:false,externalSideEffects:false}),String(admin?.id||'')).run();
  await env.DB.prepare(`UPDATE platform_environment_profiles SET expires_at=datetime(CURRENT_TIMESTAMP, '+${DEMO_TENANT_TTL_DAYS} days'),updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND environment_code='DEMO'`).bind(companyId).run();
  const actor=actorForAdmin(admin);
  await auditAdminControl(env,{actor,action:'platform.user_experience.demo_tenant_created',resourceType:'tenant',resourceId:companyId,targetCompanyId:companyId,metadata:{reason:selectedReason,countryCode:country,sectorCode:sector,disposable:true,credentialsIssued:false,environmentCode:'DEMO',sideEffectPolicy:DEMO_SIDE_EFFECT_POLICY}});
  return {tenant:{id:companyId,name:result.companyName,countryCode:result.countryCode,sectorCode:result.sectorCode,environmentCode:'DEMO',productCode:DEMO_PRODUCT_CODE,sideEffectPolicy:DEMO_SIDE_EFFECT_POLICY},owner:{identityId:Number(result.ownerIdentityId),displayName:'ON Mission Demo User',role:'admin',loginMasked:`demo-${suffix.toLowerCase()}@invalid.onmission.demo`},contextReady:true,credentialsExposed:false,accessMethod:'User Experience Lab'};
}

export async function resetDemoTenant(env,admin,{tenantId,reason:why}={}){
  const id=int(tenantId);if(!id)throw fail('DEMO_TENANT_REQUIRED',422);
  const row=await canonicalFirst(env,`SELECT c.id,c.name,c.deletion_status,cmp.status management_status,ep.environment_code,ep.status environment_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id LEFT JOIN platform_environment_profiles ep ON ep.company_id=c.id WHERE c.id=? LIMIT 1`,[id],'user_experience_lab.tenant_authority');
  if(!row)throw fail('DEMO_TENANT_NOT_FOUND',404);
  if(String(row.environment_code||'')!=='DEMO')throw fail('DEMO_TENANT_ONLY',403);
  await env.DB.prepare(`UPDATE platform_environment_profiles SET status='QUARANTINED',updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND environment_code='DEMO'`).bind(id).run();
  await purgeSessions(env,s=>Number(s.tenantId)===id || Number(s.actingAs?.targetTenantId||0)===id || Number(s.actingAs?.demoSession?.tenantId||0)===id);
  await controlRecord(env,actorForAdmin(admin),{resourceType:'tenant',resourceId:id,action:'trash',reasonCode:'uxlab_reset',reason:text(why||'Reset disposable demo tenant',500),requestId:crypto.randomUUID()});
  await auditAdminControl(env,{actor:actorForAdmin(admin),action:'platform.user_experience.demo_tenant_reset',resourceType:'tenant',resourceId:id,targetCompanyId:id,metadata:{reason:text(why||'Reset disposable demo tenant',500),replacementRequired:true}});
  return {reset:true,tenantId:id,status:'QUARANTINED',nextAction:'CREATE_NEW_DEMO_TENANT'};
}

export async function inspectUserExperienceJourney(env,{identityId=0}={}){
  const target=await targetIdentity(env,identityId);
  return {version:USER_EXPERIENCE_LAB_VERSION,target:{identityId:Number(target.id),tenantId:Number(target.company_id),displayName:target.display_name||target.login,role:target.role,companyName:target.company_name},journey:[
    ['REGISTRATION','/register.html?uxlab=preview','preview'],['LOGIN','/login.html?uxlab=preview','preview'],['ONBOARDING','/app#account?activation=1','inspect'],['MISSION','/app#missions','inspect'],['ASSIGNMENT','/app#missions','inspect'],['EXECUTION','/app#missions','inspect'],['EVIDENCE','/app#missions','inspect'],['OUTCOME','/app#missions','inspect']
  ].map(([stage,path,mode])=>({stage,path,mode})),operationalCounts:null,authorityBoundary:'Canonical tenant Mission Workspace and mission execution authorities own operational truth; the User Experience Lab never queries or mutates mission/custody truth.'};
}

export function delegatedSessionCookie(token){return sessionCookie(token);}
export function delegatedClearCookie(){return clearSessionCookie();}
function parseJson(v){try{return JSON.parse(String(v||'{}'))||{};}catch{return {};}}
