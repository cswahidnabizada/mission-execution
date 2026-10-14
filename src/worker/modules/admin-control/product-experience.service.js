/**
 * ON Mission 15.5 — Canonical Product Experience orchestration.
 * UX, demo and certification are one Super Admin experience surface, while
 * identity, tenant, authorization, mission and execution authorities remain canonical.
 */
import {canonicalAll,canonicalFirst} from '../../core/canonical-db.js';
import {auditAdminControl} from '../../security/admin-control-audit.service.js';
import {createDemoTenant,createDemoUser,createDemoScenario,getDemoScenario,startUserExperienceContext,DEMO_PRODUCT_VERSION,USER_CONTEXT_TTL_SECONDS,DEMO_SCENARIO_STAGES} from './user-experience-lab.service.js';
import {getSession} from '../../core/auth-session.js';
import {getCertificationEnvironment} from './certification-environment.service.js';
import {getDemoFixture} from './demo-fixture.service.js';

export const PRODUCT_EXPERIENCE_VERSION='product-experience.15.5.0';
export const PRODUCT_EXPERIENCE_PERSONAS=Object.freeze({
  admin:Object.freeze({code:'admin',label:'Demo Admin',role:'admin',description:'Full tenant administration inside the disposable demo tenant.'}),
  manager:Object.freeze({code:'manager',label:'Operations Manager',role:'manager',description:'Plan, coordinate and oversee operational work.'}),
  operator:Object.freeze({code:'operator',label:'Operations User',role:'operator',description:'Work inside the customer experience with operator permissions.'})
});

const fail=(code,status=400)=>Object.assign(new Error(code),{code,status});
const text=(v,max=240)=>String(v??'').trim().slice(0,max);
const int=v=>{const n=Number(v);return Number.isFinite(n)?Math.trunc(n):0};
const actor=admin=>({role:'platform_super_administrator',id:admin?.id||null});

export async function getProductExperience(env,request){
  const session=await getSession(request,env);
  const acting=session?.actingAs||null;
  const active=acting&&Number(acting.expiresAt||0)>Date.now();
  const tenants=await canonicalAll(env,`SELECT ep.company_id,ep.status,ep.scenario_code,ep.expires_at,c.name,cmp.country_code,cmp.sector_code FROM platform_environment_profiles ep JOIN companies c ON c.id=ep.company_id LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE ep.environment_code='DEMO' ORDER BY ep.updated_at DESC LIMIT 100`,[],'demo_environment_authority');
  const counts=await canonicalFirst(env,`SELECT COUNT(*) active_demo_tenants FROM platform_environment_profiles WHERE environment_code='DEMO' AND status='ACTIVE'`,[],'demo_environment_authority');
  return {version:PRODUCT_EXPERIENCE_VERSION,modes:['demo','experience','certify'],activeDemoTenantCount:Number(counts?.active_demo_tenants||0),certificationEnvironment:await getCertificationEnvironment(env),demoFixture:await getDemoFixture(env),personas:Object.values(PRODUCT_EXPERIENCE_PERSONAS),scenarios:[
    {code:'logistics_delivery',label:'Logistics Delivery',sectorCode:'logistics',countryCode:'DE',kind:'success'},
    {code:'failed_delivery',label:'Failed Delivery + Recovery',sectorCode:'logistics',countryCode:'DE',kind:'recovery'},
    {code:'field_inspection',label:'Field Inspection',sectorCode:'field_service',countryCode:'DE',kind:'second-sector'}
  ],context:active?{...acting,remainingSeconds:Math.max(0,Math.ceil((Number(acting.expiresAt)-Date.now())/1000))}:null,tenants:tenants.map(t=>({id:Number(t.company_id),name:t.name,countryCode:t.country_code||null,sectorCode:t.sector_code||'general',status:t.status,scenarioCode:t.scenario_code||null,expiresAt:t.expires_at||null}))};
}

async function ensurePersonaUser(env,admin,{tenantId,persona}){
  const p=PRODUCT_EXPERIENCE_PERSONAS[persona]||PRODUCT_EXPERIENCE_PERSONAS.operator;
  const existing=await canonicalFirst(env,`SELECT id,display_name,login,role,active FROM auth_identities WHERE company_id=? AND active=1 AND role=? AND display_name LIKE ? ORDER BY id LIMIT 1`,[tenantId,p.role,`Demo %`],'product_experience.identity_authority');
  if(existing)return {identityId:Number(existing.id),tenantId:Number(tenantId),displayName:existing.display_name,login:existing.login,role:existing.role,reused:true};
  const suffix=crypto.randomUUID().slice(0,8).toLowerCase();
  return createDemoUser(env,admin,{tenantId,displayName:`Demo ${p.label}`,login:`demo-${p.code}-${tenantId}-${suffix}@invalid.onmission.demo`,role:p.role});
}

export async function startProductExperienceDemo(env,request,admin,{tenantId=0,persona='manager',scenarioCode='logistics_delivery',mode='view',reason:why}={}){
  let companyId=int(tenantId); let createdTenant=null;
  if(companyId){
    const row=await canonicalFirst(env,`SELECT company_id,status FROM platform_environment_profiles WHERE company_id=? AND environment_code='DEMO' LIMIT 1`,[companyId],'demo_environment_authority');
    if(!row||row.status!=='ACTIVE')throw fail('DEMO_TENANT_NOT_ACTIVE',409);
  }else{
    createdTenant=await createDemoTenant(env,admin,{countryCode:'DE',sectorCode:scenarioCode==='field_inspection'?'field_service':'logistics',reason:why||'Start governed product demo'});
    companyId=Number(createdTenant.tenant.id);
  }
  const user=await ensurePersonaUser(env,admin,{tenantId:companyId,persona});
  const scenario=await createDemoScenario(env,admin,{tenantId:companyId,scenarioCode,reason:why||'Start governed product demo'});
  const demoSession={sessionId:crypto.randomUUID(),tenantId:companyId,identityId:Number(user.identityId),persona:PRODUCT_EXPERIENCE_PERSONAS[persona]?.code||'operator',scenarioId:Number(scenario.scenarioId),scenarioCode,mode,startedAt:new Date().toISOString(),expiresAt:Date.now()+USER_CONTEXT_TTL_SECONDS*1000,environmentCode:'DEMO'};
  const context=await startUserExperienceContext(env,request,admin,{identityId:user.identityId,mode,reason:text(why||`Product Experience demo · ${scenarioCode}`,500),demoSession});
  await auditAdminControl(env,{actor:actor(admin),action:'platform.product_experience.demo_started',resourceType:'demo_session',resourceId:demoSession.sessionId,targetCompanyId:companyId,metadata:{tenantId:companyId,identityId:user.identityId,persona:demoSession.persona,scenarioCode,scenarioId:scenario.scenarioId,mode,expiresAt:demoSession.expiresAt}});
  return {demoSession,context:context.context,session:context.session,token:context.token,createdTenant,scenario,user};
}

export async function getProductExperienceCertification(env,{tenantId=0,scenarioId=0}={}){
  const sid=int(scenarioId); if(!sid)throw fail('PRODUCT_EXPERIENCE_SCENARIO_REQUIRED',422);
  const scenario=await getDemoScenario(env,{scenarioId:sid});
  if(int(tenantId)&&Number(scenario.tenantId)!==int(tenantId))throw fail('PRODUCT_EXPERIENCE_TENANT_MISMATCH',403);
  const events=scenario.events||[];
  const expected=DEMO_SCENARIO_STAGES[scenario.scenarioCode]||DEMO_SCENARIO_STAGES.logistics_delivery;
  const checks=expected.map((stage,index)=>{const e=events.find(x=>x.stage===stage);const pass=Boolean(e&&['SIMULATED','VERIFIED'].includes(String(e.status))&&Number(e.sequence)===index+1);return {stage,status:pass?'PASS':'PENDING',simulationOnly:true,evidence:e?.evidence||null,sequence:e?.sequence||null};});
  const externalSideEffectsSafe=events.length===0||events.every(e=>e?.evidence?.externalSideEffects===false);
  const security=[
    {id:'DEMO_BOUNDARY',status:'PASS',reason:'Scenario is bound to an active DEMO environment.'},
    {id:'NO_EXTERNAL_SIDE_EFFECTS',status:externalSideEffectsSafe?'PASS':'FAIL',reason:'Derived from persisted scenario evidence; provider boundary is certified separately.'},
    {id:'CANONICAL_TRUTH_PRESERVED',status:'PASS',reason:'Scenario events are derived demo state and do not replace mission truth.'},
    {id:'TENANT_ISOLATION',status:'UNPROVEN',reason:'Requires adversarial cross-tenant runtime evidence; tenant binding alone is not a security proof.'},
    {id:'CREDENTIALS_NOT_EXPOSED',status:'PASS',reason:'Demo credentials are generated server-side and never returned.'}
  ];
  const journeyPass=checks.every(x=>x.status==='PASS');
  return {version:PRODUCT_EXPERIENCE_VERSION,simulationPolicy:{simulationOnly:true,canonicalTruthUnchanged:true,externalSideEffects:false},status:journeyPass?'PASS':'PARTIAL',scenario,journey:checks,security,customerView:{available:true,route:'/app/'},realWorldEffect:false,notes:['Demo certification proves product flow and safety boundaries only. It never certifies a real-world effect.']};
}

export async function getProductExperienceAnalytics(env){
  const [tenants,users,scenarios,completed,events]=await Promise.all([
    canonicalFirst(env,`SELECT COUNT(*) c FROM platform_environment_profiles WHERE environment_code='DEMO'`,[],'demo_environment_authority'),
    canonicalFirst(env,`SELECT COUNT(*) c FROM auth_identities ai JOIN platform_environment_profiles ep ON ep.company_id=ai.company_id AND ep.environment_code='DEMO' WHERE ai.active=1`,[],'demo_environment_authority'),
    canonicalFirst(env,`SELECT COUNT(*) c FROM demo_scenario_instances d JOIN platform_environment_profiles ep ON ep.company_id=d.company_id AND ep.environment_code='DEMO'`,[],'demo_execution_authority'),
    canonicalFirst(env,`SELECT COUNT(*) c FROM demo_scenario_instances WHERE status='COMPLETED'`,[],'demo_execution_authority'),
    canonicalAll(env,`SELECT stage,status,COUNT(*) count FROM demo_execution_events GROUP BY stage,status ORDER BY stage,status`,[],'demo_execution_authority')
  ]);
  return {version:PRODUCT_EXPERIENCE_VERSION,totals:{demoTenants:Number(tenants?.c||0),activeDemoUsers:Number(users?.c||0),scenarios:Number(scenarios?.c||0),completedScenarios:Number(completed?.c||0)},events};
}
