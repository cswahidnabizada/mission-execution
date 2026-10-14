/**
 * ON Mission 10.51.0 — Control Plane Governance Contract
 *
 * This is an orchestration/projection layer. It does not replace canonical
 * authorities. Every governed Control Plane resource exposes the same
 * readiness/dependency/error/verification envelope while its owning service
 * remains responsible for the underlying truth.
 */
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const json=(v,f={})=>{try{return JSON.parse(String(v??'null'))??f}catch{return f}};
const arr=v=>Array.isArray(v)?v:[];

export const CONTROL_PLANE_RESOURCE_TYPES=Object.freeze([
  'country','country_blueprint','product_launch','product_definition','lifecycle',
  'configuration','provider','subscription_plan','notification_policy','consent_policy',
  'residency_policy','preparation_task','preparation_research','verification_run','company'
]);

import {RELEASE_VERSION} from '../core/release.js';
import {canonicalFirst,canonicalAll,canonicalRun,authorityUnavailable} from '../core/canonical-db.js';

export const CONTROL_PLANE_GOVERNANCE_VERSION=RELEASE_VERSION;

const ACTIONS=Object.freeze({
  COUNTRY_INACTIVE:'ACTIVATE_COUNTRY',
  COUNTRY_FOUNDATION:'CONFIGURE_COUNTRY_FOUNDATION',
  MISSING_CONFIGURATION:'CONFIGURE_RUNTIME',
  MISSING_PROVIDER:'CONFIGURE_PROVIDER',
  MISSING_POLICY:'CONFIGURE_POLICY',
  MISSING_DEFINITION:'COMPILE_PRODUCT_DEFINITION',
  MISSING_LIFECYCLE:'VALIDATE_LIFECYCLE',
  PREPARATION:'COMPLETE_PREPARATION',
  VERIFICATION:'RUN_VERIFICATION'
});

function blocker(code,message,opts={}){return {
  code, message, severity:opts.severity||'BLOCKING', retryable:Boolean(opts.retryable),
  authority:opts.authority||'platform.control_plane', resourceType:opts.resourceType||null,
  resourceKey:opts.resourceKey||null, nextAction:opts.nextAction||null,
  dependency:opts.dependency||null
};}

function envelope(resource,{status='UNKNOWN',score=0,blockers=[],warnings=[],dependencies=[],verified=null,metadata={}}={}){
  const normalizedBlockers=blockers.filter(Boolean);
  return {
    governanceVersion:CONTROL_PLANE_GOVERNANCE_VERSION,
    resource:{type:resource.type,key:resource.key,label:resource.label||resource.key},
    readiness:{status:normalizedBlockers.length?'BLOCKED':status,score:Math.max(0,Math.min(100,Number(score)||0)),blockers:normalizedBlockers,warnings},
    dependencies,
    verification:verified||{status:'NOT_RUN',required:true,lastRunAt:null},
    errors:{contract:'control-plane.v1',authority:resource.authority||'platform.control_plane',lastError:null},
    metadata
  };
}

async function one(env,sql,args=[]){return canonicalFirst(env,sql,args,'platform.control_plane_governance');}
async function all(env,sql,args=[]){return canonicalAll(env,sql,args,'platform.control_plane_governance');}

export async function getControlPlaneResourceGovernance(env,{resourceType,resourceKey,label='',authority='',launchId=null}={}){
 const type=clean(resourceType,80),key=clean(resourceKey,240);
 if(!CONTROL_PLANE_RESOURCE_TYPES.includes(type)) return envelope({type,key,label,authority},{status:'AUTHORITY_OWNED',score:100,metadata:{evaluator:'authority-owned'}});
 const resource={type,key,label:label||key,authority:authority||`platform.${type}`};
 const blockers=[];const dependencies=[];let score=100;let status='READY';let metadata={};
 try{
  if(type==='country'){
   const r=await one(env,'SELECT code,name,active FROM country_catalog WHERE code=? LIMIT 1',[key.toUpperCase()]);
   if(!r){blockers.push(blocker('COUNTRY_NOT_FOUND',`Country ${key} is not in the canonical country catalog.`,{resourceType:type,resourceKey:key,nextAction:'CREATE_COUNTRY'}));score=0;}
   else if(Number(r.active)!==1){blockers.push(blocker('COUNTRY_INACTIVE',`Country ${r.name||key} is inactive.`,{resourceType:type,resourceKey:key,nextAction:ACTIONS.COUNTRY_INACTIVE}));score=25;}
   else score=100;metadata={country:r||null};
  } else if(type==='country_blueprint') {
   const r=await one(env,'SELECT id,country_code,status FROM platform_country_product_blueprints WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('BLUEPRINT_NOT_FOUND','Country blueprint does not exist.',{resourceType:type,resourceKey:key,nextAction:'CREATE_BLUEPRINT'}));
   else if(String(r.status)!=='ready') blockers.push(blocker('BLUEPRINT_NOT_READY','Country blueprint is not ready for product composition.',{resourceType:type,resourceKey:key,nextAction:'PREPARE_BLUEPRINT'}));
   score=blockers.length?50:100;metadata={blueprint:r||null};
  } else if(type==='product_launch') {
   const r=await one(env,'SELECT id,country_code,status,active,version FROM country_product_launches WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('LAUNCH_NOT_FOUND','Product launch does not exist.',{resourceType:type,resourceKey:key,nextAction:'START_PRODUCT'}));
   else { metadata={launch:r}; if(String(r.status)==='draft') { blockers.push(blocker('LAUNCH_NOT_VALIDATED','Product launch is still a draft.',{resourceType:type,resourceKey:key,nextAction:'RUN_READINESS'}));score=50; } else if(String(r.status)==='validated') score=80; else if(String(r.status)==='active'&&Number(r.active)===1) score=100; }
  } else if(type==='product_definition') {
   const r=await one(env,'SELECT id,launch_id,sector_code,status FROM platform_product_definitions WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('DEFINITION_NOT_FOUND','Product definition does not exist.',{resourceType:type,resourceKey:key,nextAction:'CREATE_DEFINITION'}));
   else if(!['compiled','active','validated'].includes(String(r.status))) blockers.push(blocker('DEFINITION_NOT_COMPILED','Product definition is not compiled/validated.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.MISSING_DEFINITION}));
   score=blockers.length?50:100;metadata={definition:r||null};
  } else if(type==='lifecycle') {
   const r=await one(env,'SELECT id,status,validation_status FROM platform_lifecycle_definitions WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('LIFECYCLE_NOT_FOUND','Lifecycle definition does not exist.',{resourceType:type,resourceKey:key,nextAction:'CREATE_LIFECYCLE'}));
   else if(!['validated','active'].includes(String(r.status||r.validation_status))) blockers.push(blocker('LIFECYCLE_NOT_VALIDATED','Lifecycle definition is not validated.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.MISSING_LIFECYCLE}));
   score=blockers.length?50:100;metadata={lifecycle:r||null};
  } else if(type==='configuration') {
   const [domain,config]=key.split(':');
   const r=await one(env,'SELECT id,domain_code,config_key,status,active,version FROM platform_configuration_versions WHERE domain_code=? AND config_key=? AND active=1 ORDER BY version DESC LIMIT 1',[domain,config]);
   if(!r) blockers.push(blocker('CONFIGURATION_NOT_ACTIVE',`Required configuration ${key} has no active version.`,{resourceType:type,resourceKey:key,nextAction:ACTIONS.MISSING_CONFIGURATION}));
   score=blockers.length?0:100;metadata={configuration:r||null};
  } else if(type==='provider') {
   const r=await one(env,'SELECT code,provider_type,active,contract_status FROM external_provider_registry WHERE code=? LIMIT 1',[key]);
   if(!r) blockers.push(blocker('PROVIDER_NOT_FOUND','Provider is not registered.',{resourceType:type,resourceKey:key,nextAction:'CONFIGURE_PROVIDER'}));
   else if(Number(r.active)!==1||!['approved','configured'].includes(String(r.contract_status||''))) blockers.push(blocker('PROVIDER_NOT_READY','Provider is not active and approved/configured.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.MISSING_PROVIDER}));
   score=blockers.length?25:100;metadata={provider:r||null};
  } else if(type==='subscription_plan') {
   const r=await one(env,'SELECT id,name,active FROM plans WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('PLAN_NOT_FOUND','Subscription plan does not exist.',{resourceType:type,resourceKey:key,nextAction:'CREATE_PLAN'}));
   else if(Number(r.active)!==1) blockers.push(blocker('PLAN_INACTIVE','Subscription plan is inactive.',{resourceType:type,resourceKey:key,nextAction:'ACTIVATE_PLAN'}));
   score=blockers.length?50:100;metadata={plan:r||null};
  } else if(type==='notification_policy') {
   const r=await one(env,'SELECT id,active FROM notification_policy_registry WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('NOTIFICATION_POLICY_NOT_FOUND','Notification policy does not exist.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.MISSING_POLICY}));
   else if(Number(r.active)!==1) blockers.push(blocker('NOTIFICATION_POLICY_INACTIVE','Notification policy is inactive.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.MISSING_POLICY}));
   score=blockers.length?50:100;metadata={policy:r||null};
  } else if(type==='consent_policy') {
   const r=await one(env,'SELECT id,active FROM consent_policy_versions WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('CONSENT_POLICY_NOT_FOUND','Consent policy does not exist.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.MISSING_POLICY}));
   else if(Number(r.active)!==1) blockers.push(blocker('CONSENT_POLICY_INACTIVE','Consent policy is inactive.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.MISSING_POLICY}));
   score=blockers.length?50:100;metadata={policy:r||null};
  } else if(type==='residency_policy') {
   const r=await one(env,'SELECT id,active,jurisdiction_code FROM residency_policies WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('RESIDENCY_POLICY_NOT_FOUND','Residency policy does not exist.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.MISSING_POLICY}));
   else if(Number(r.active)!==1) blockers.push(blocker('RESIDENCY_POLICY_INACTIVE','Residency policy is inactive.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.MISSING_POLICY}));
   score=blockers.length?50:100;metadata={policy:r||null};
  } else if(type==='preparation_task') {
   const r=await one(env,'SELECT id,status,required FROM platform_product_preparation_tasks WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('PREPARATION_TASK_NOT_FOUND','Preparation task does not exist.',{resourceType:type,resourceKey:key,nextAction:'CREATE_PREPARATION_TASK'}));
   else if(Number(r.required)===1&&String(r.status)!=='completed') blockers.push(blocker('PREPARATION_INCOMPLETE','Required preparation task is not complete.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.PREPARATION}));
   score=blockers.length?50:100;metadata={task:r||null};
  } else if(type==='preparation_research') {
   const r=await one(env,'SELECT id,status FROM platform_product_preparation_research WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('RESEARCH_NOT_FOUND','Preparation research record does not exist.',{resourceType:type,resourceKey:key,nextAction:'CREATE_RESEARCH'}));
   else if(String(r.status)!=='completed') blockers.push(blocker('RESEARCH_INCOMPLETE','Required preparation research is not complete.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.PREPARATION}));
   score=blockers.length?50:100;metadata={research:r||null};
  } else if(type==='verification_run') {
   const r=await one(env,'SELECT id,status,passed_count,failed_count,blocked_count FROM platform_product_verification_runs WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('VERIFICATION_NOT_FOUND','Verification run does not exist.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.VERIFICATION}));
   else if(String(r.status)!=='passed'||Number(r.failed_count)>0||Number(r.blocked_count)>0) blockers.push(blocker('VERIFICATION_FAILED','Verification has not passed without failures or blockers.',{resourceType:type,resourceKey:key,nextAction:ACTIONS.VERIFICATION}));
   score=blockers.length?50:100;metadata={run:r||null};
  } else if(type==='company') {
   const r=await one(env,'SELECT id,compliance_status FROM companies WHERE id=? LIMIT 1',[Number(key)]);
   if(!r) blockers.push(blocker('COMPANY_NOT_FOUND','Organization does not exist.',{resourceType:type,resourceKey:key,nextAction:'CREATE_COMPANY'}));
   else if(['suspended','restricted'].includes(String(r.compliance_status||'').toLowerCase())) blockers.push(blocker('COMPANY_RESTRICTED','Organization is restricted by its canonical compliance authority.',{resourceType:type,resourceKey:key,nextAction:'OPEN_ORGANIZATION_GOVERNANCE'}));
   score=blockers.length?50:100;metadata={company:r||null};
  }
  const deps=await readGovernanceDependencies(env,type,key,launchId);
  dependencies.push(...deps);
  if(dependencies.some(x=>x.status==='blocked')) { blockers.push(...dependencies.filter(x=>x.status==='blocked').map(x=>blocker('DEPENDENCY_BLOCKED',`${x.label||x.key} is blocking this resource.`,{resourceType:type,resourceKey:key,nextAction:x.nextAction||null,dependency:x}))); score=Math.min(score,50); }
  return envelope(resource,{status:status==='READY'&&!blockers.length?'READY':'BLOCKED',score,blockers,dependencies,verified:await verificationFor(env,type,key),metadata});
 } catch(error){
  return envelope(resource,{status:'AUTHORITY_UNAVAILABLE',score:0,blockers:[blocker('AUTHORITY_UNAVAILABLE','The canonical authority for this resource could not be read.',{retryable:true,resourceType:type,resourceKey:key,nextAction:'RETRY'})],metadata:{errorCode:error?.code||'AUTHORITY_UNAVAILABLE'}});
 }
}

async function verificationFor(env,type,key){
 if(type==='verification_run') return {status:'PASSED',required:true,lastRunAt:null};
 if(type==='product_launch'){
  const r=await one(env,'SELECT status FROM country_product_launches WHERE id=? LIMIT 1',[Number(key)]);
  return {status:r&&String(r.status)==='active'?'AVAILABLE':'NOT_RUN',required:true,lastRunAt:null};
 }
 return {status:'NOT_RUN',required:false,lastRunAt:null};
}

async function readGovernanceDependencies(env,type,key,launchId){
 const out=[];
 if(type==='product_launch'){
  const launch=await one(env,'SELECT id,country_code,country_blueprint_id,eligibility_json,manifest_json FROM country_product_launches WHERE id=? LIMIT 1',[Number(key)]);
  if(launch){out.push(await dependency(env,'country',String(launch.country_code),launch.country_code,'country'));if(launch.country_blueprint_id)out.push(await dependency(env,'country_blueprint',String(launch.country_blueprint_id),'Country blueprint','blueprint'));for(const s of arr(json(launch.eligibility_json,{}).sectors)){const d=await one(env,'SELECT code,status FROM sector_policies WHERE sector_code=? AND status=\'active\' LIMIT 1',[s]);out.push({type:'sector_policy',key:s,label:`Sector policy ${s}`,status:d?'ready':'blocked',nextAction:d?null:'CONFIGURE_POLICY'});}}
 }
 if(launchId&&type!=='product_launch') out.push({type:'product_launch',key:String(launchId),label:`Product launch ${launchId}`,status:'in_scope'});
 return out;
}
async function dependency(env,type,key,label){const g=await getControlPlaneResourceGovernance(env,{resourceType:type,resourceKey:key,label});return {type,key,label,status:g.readiness.status.toLowerCase(),score:g.readiness.score,nextAction:g.readiness.blockers[0]?.nextAction||null};}

export async function getProductControlPlaneGovernance(env,launchId){
 const id=Number(launchId);if(!Number.isInteger(id)||id<=0)return {version:CONTROL_PLANE_GOVERNANCE_VERSION,resources:[],summary:{ready:0,blocked:0,unavailable:0,total:0}};
 const launch=await one(env,'SELECT id,country_code,country_blueprint_id,manifest_json,eligibility_json FROM country_product_launches WHERE id=? LIMIT 1',[id]);
 if(!launch) return {version:CONTROL_PLANE_GOVERNANCE_VERSION,resources:[],summary:{ready:0,blocked:1,unavailable:0,total:1},error:{code:'LAUNCH_NOT_FOUND'}};
 const resources=[];
 resources.push(await getControlPlaneResourceGovernance(env,{resourceType:'product_launch',resourceKey:String(id),label:`Product launch ${id}`,launchId:id}));
 resources.push(await getControlPlaneResourceGovernance(env,{resourceType:'country',resourceKey:launch.country_code,label:launch.country_code,launchId:id}));
 if(launch.country_blueprint_id)resources.push(await getControlPlaneResourceGovernance(env,{resourceType:'country_blueprint',resourceKey:String(launch.country_blueprint_id),label:`Country blueprint ${launch.country_blueprint_id}`,launchId:id}));
 const manifest=json(launch.manifest_json,{});for(const key of arr(manifest.requiredConfigurations))resources.push(await getControlPlaneResourceGovernance(env,{resourceType:'configuration',resourceKey:key,label:key,launchId:id}));
 const defs=await all(env,'SELECT id,sector_code FROM platform_product_definitions WHERE launch_id=?',[id]);for(const d of defs)resources.push(await getControlPlaneResourceGovernance(env,{resourceType:'product_definition',resourceKey:String(d.id),label:`${d.sector_code} definition`,launchId:id}));
 const tasks=await all(env,'SELECT id,task_key FROM platform_product_preparation_tasks WHERE launch_id=? AND required=1',[id]);for(const t of tasks)resources.push(await getControlPlaneResourceGovernance(env,{resourceType:'preparation_task',resourceKey:String(t.id),label:t.task_key,launchId:id}));
 const research=await all(env,'SELECT id,research_key FROM platform_product_preparation_research WHERE launch_id=?',[id]);for(const r of research)resources.push(await getControlPlaneResourceGovernance(env,{resourceType:'preparation_research',resourceKey:String(r.id),label:r.research_key,launchId:id}));
 const blocked=resources.filter(r=>r.readiness.status==='BLOCKED');const unavailable=resources.filter(r=>r.readiness.status==='AUTHORITY_UNAVAILABLE');const ready=resources.filter(r=>r.readiness.status==='READY');
 return {version:CONTROL_PLANE_GOVERNANCE_VERSION,resources,summary:{ready:ready.length,blocked:blocked.length,unavailable:unavailable.length,total:resources.length,readyPercent:resources.length?Math.round((ready.length/resources.length)*100):0}};
}

export function structuredControlPlaneError(error,{resourceType=null,resourceKey=null,authority='platform.control_plane',nextAction=null}={}){
 const status=Number(error?.status||500);const code=clean(error?.code||'REQUEST_FAILED',120)||'REQUEST_FAILED';
 return {contract:'control-plane.v1',code,status,severity:status>=500?'ERROR':status>=400?'BLOCKING':'INFO',retryable:status>=500||['AUTHORITY_UNAVAILABLE','BUSY','TIMEOUT'].includes(code),authority,resourceType,resourceKey,nextAction:nextAction||null,message:status>=500?'The canonical authority could not complete the request.':String(error?.message||'Request failed').slice(0,500)};
}

export async function refreshControlPlaneGovernance(env,launchId){
 const governance=await getProductControlPlaneGovernance(env,launchId);
 const stmts=[];
 for(const resource of governance.resources){
  const r=resource.resource;
  stmts.push(env.DB.prepare(`INSERT INTO platform_control_plane_resource_contracts(resource_type,resource_key,label,authority_code,governance_version,metadata_json,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(resource_type,resource_key) DO UPDATE SET label=excluded.label,authority_code=excluded.authority_code,governance_version=excluded.governance_version,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(r.type,r.key,r.label,resource.errors.authority,CONTROL_PLANE_GOVERNANCE_VERSION,JSON.stringify(resource.metadata||{})));
  stmts.push(env.DB.prepare(`INSERT INTO platform_control_plane_readiness(resource_type,resource_key,status,score,blockers_json,warnings_json,verification_json,evaluated_at,updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(resource_type,resource_key) DO UPDATE SET status=excluded.status,score=excluded.score,blockers_json=excluded.blockers_json,warnings_json=excluded.warnings_json,verification_json=excluded.verification_json,evaluated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(r.type,r.key,resource.readiness.status,resource.readiness.score,JSON.stringify(resource.readiness.blockers||[]),JSON.stringify(resource.readiness.warnings||[]),JSON.stringify(resource.verification||{})));
  for(const d of resource.dependencies||[]){
   stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO platform_control_plane_dependencies(resource_type,resource_key,dependency_type,dependency_key,relation,impact_json,rollback_json,source_type,source_id) VALUES(?,?,?,?,?,?,?,?,?)`).bind(r.type,r.key,d.type,d.key,'depends_on',JSON.stringify(d.impact||{}),JSON.stringify(d.rollback||{}),'governance',String(launchId)));
  }
 }
 if(stmts.length){try{await env.DB.batch(stmts);}catch(error){throw authorityUnavailable('platform.control_plane_governance_projection',error);}}
 return governance;
}
