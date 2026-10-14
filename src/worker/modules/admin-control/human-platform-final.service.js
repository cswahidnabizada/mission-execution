/* ON Mission 11.02.0 — Complete Human Platform Control Plane.
 * Composition/governance only. Operational truth remains in canonical authorities.
 */
import {canonicalFirst} from '../../core/canonical-db.js';
import {listPlatformConfigurations,getActivePlatformConfiguration} from '../../security/platform-configuration.service.js';
import {getSystemHealth} from './system-health.service.js';
import {auditAdminControl} from './admin-control.audit.js';
import {HUMAN_PLATFORM_CONTROL_VERSION,HUMAN_PLATFORM_DESTINATIONS,HUMAN_PLATFORM_CONTEXTS,HUMAN_PLATFORM_WORK_SOURCES,humanPlatformDefaultConfiguration,normalizeHumanPlatformPayload} from './human-platform-control.service.js';

export const HUMAN_PLATFORM_FINAL_VERSION='human-platform-control-plane.v1';

const clean=(v,max=120)=>String(v??'').trim().slice(0,max);
const parse=v=>{try{return JSON.parse(v||'{}')}catch{return {}}};
const clone=v=>JSON.parse(JSON.stringify(v));
const title=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

export const HUMAN_PLATFORM_TEST_SCENARIOS=Object.freeze([
  {key:'mission_received',name:'Mission received',description:'A user receives actionable mission work.',requires:['mission','assignment','evidence'],expected:['today','work','mission','canonical_action','evidence','next_situation'],path:['today','work','mission','canonical_action','evidence','next_situation']},
  {key:'network_invitation',name:'Partner invitation',description:'A relationship decision arrives through the network.',requires:['network','network_relationship'],expected:['today','network','network_relationship','canonical_action'],path:['today','network','network_relationship','canonical_action']},
  {key:'waiting',name:'Mission waiting',description:'A mission becomes waiting without inventing an action.',requires:['waiting','mission'],expected:['work','waiting','no_false_action'],path:['work','waiting','no_false_action']},
  {key:'breach',name:'Mission breach',description:'A liveness breach reaches attention and recovery.',requires:['exception','mission','urgent_attention'],expected:['today','urgent','mission','recovery_action'],path:['today','urgent','mission','recovery_action']},
  {key:'evidence',name:'Evidence capture',description:'Work reaches an evidence requirement before its next situation.',requires:['evidence','mission'],expected:['work','mission','evidence','next_situation'],path:['work','mission','evidence','next_situation']},
  {key:'authorization_boundary',name:'Authorization boundary',description:'Experience visibility never grants authorization.',requires:[],expected:['visibility_not_authorization','server_authorization'],path:['visibility_not_authorization','server_authorization']},
  {key:'release_boundary',name:'Release boundary',description:'Production experience changes only through governed lifecycle.',requires:[],expected:['draft','validated','authorized','published','verified','live'],path:['draft','validated','authorized','published','verified','live']}
]);
function normalized(payload){return normalizeHumanPlatformPayload(payload&&typeof payload==='object'?payload:humanPlatformDefaultConfiguration());}
function result(status,details={}){return {status,...details};}

export async function resolveHumanPlatformSimulation(env,input={}){
  const product=clean(input.product||input.productId,120)||null;
  const country=clean(input.country||input.countryCode,2).toUpperCase()||null;
  const role=clean(input.role||input.roleCode,80)||'default';
  const configurationId=Number(input.configurationId||0)||null;
  let configuration=null;
  if(configurationId){const rows=await listPlatformConfigurations(env);configuration=rows.find(x=>Number(x.id)===configurationId)||null;if(!configuration)throw Object.assign(new Error('Human Platform configuration not found'),{status:404,code:'HUMAN_PLATFORM_CONFIGURATION_NOT_FOUND'});}
  else configuration=await getActivePlatformConfiguration(env,'rendering','human-work-platform');
  const payload=normalized(configuration?.payload||parse(configuration?.payload_json)||humanPlatformDefaultConfiguration());
  const blockers=[];
  let countryRecord=null,roleRecord=null,productRecord=null;
  if(country){countryRecord=await canonicalFirst(env,`SELECT code,name,active,requires_review,default_subscription_class FROM platform_product_country_catalog WHERE code=? LIMIT 1`,[country],'human_platform_simulation.country');if(!countryRecord)blockers.push({code:'COUNTRY_NOT_FOUND',message:'Selected product country is not configured.'});else if(Number(countryRecord.active)!==1)blockers.push({code:'COUNTRY_NOT_ACTIVE',message:'Selected product country is not active.'});}
  if(role&&role!=='default'){roleRecord=await canonicalFirst(env,`SELECT role_code,label,description,scope_type,active FROM organization_role_catalog WHERE role_code=? LIMIT 1`,[role],'human_platform_simulation.role');if(!roleRecord)blockers.push({code:'ROLE_NOT_FOUND',message:'Selected role is not configured.'});else if(Number(roleRecord.active)!==1)blockers.push({code:'ROLE_NOT_ACTIVE',message:'Selected role is not active.'});}
  if(product&&/^\d+$/.test(product))productRecord=await canonicalFirst(env,`SELECT id,country_code,version,status,active,eligibility_json FROM country_product_launches WHERE id=? LIMIT 1`,[Number(product)],'human_platform_simulation.product');
  else if(country)productRecord=await canonicalFirst(env,`SELECT id,country_code,version,status,active,eligibility_json FROM country_product_launches WHERE country_code=? AND status='active' AND active=1 ORDER BY id DESC LIMIT 1`,[country],'human_platform_simulation.product');
  if(product&&productRecord&&!country&&productRecord.country_code)countryRecord=await canonicalFirst(env,`SELECT code,name,active,requires_review,default_subscription_class FROM platform_product_country_catalog WHERE code=? LIMIT 1`,[productRecord.country_code],'human_platform_simulation.country');
  if(product&&!productRecord)blockers.push({code:'PRODUCT_NOT_FOUND',message:'Selected product release is not available.'});
  const destinations=payload.canonicalDestinations.map(d=>({key:d.key,label:d.label,order:d.order,enabled:d.enabled!==false,required:true}));
  const work=Object.entries(payload.workComposition).filter(([,enabled])=>enabled!==false).map(([key])=>({key,label:title(key),sourceAuthority:key==='mission'?'Mission Authority':key==='assignment'?'Assignment Authority':key==='network'?'Network Authority':key==='evidence'?'Evidence Authority':key==='exception'?'Liveness / Exception Authority':key==='waiting'?'Mission Lifecycle Authority':'History / Canonical Projection'}));
  const contexts=payload.contexts.filter(x=>x.enabled!==false).map(x=>({key:x.key,label:title(x.key),entry:x.entry||'contextual'}));
  const roleExperience=payload.roleExperience?.[role]||payload.roleExperience?.default||{destinations:HUMAN_PLATFORM_DESTINATIONS,contexts:HUMAN_PLATFORM_CONTEXTS};
  const visibleDestinations=destinations.filter(d=>!Array.isArray(roleExperience.destinations)||roleExperience.destinations.includes(d.key));
  const visibleContexts=contexts.filter(c=>!Array.isArray(roleExperience.contexts)||roleExperience.contexts.includes(c.key));
  const attention=clone(payload.attention?.categories||[]);
  const syntheticWork=work.map(x=>({type:x.key,label:x.label,authority:x.sourceAuthority,actionable:x.key!=='waiting'&&x.key!=='history'}));
  return {
    version:HUMAN_PLATFORM_FINAL_VERSION,
    simulation:true,
    mutation:'NONE',
    productionMutation:false,
    banner:'SIMULATION — NO PRODUCTION MUTATION',
    selection:{product,productRelease:productRecord?{id:Number(productRecord.id),countryCode:productRecord.country_code,version:productRecord.version,status:productRecord.status,active:Boolean(Number(productRecord.active))}:null,country:countryRecord?{code:countryRecord.code,name:countryRecord.name,active:Boolean(Number(countryRecord.active))}:country,role:roleRecord?{code:roleRecord.role_code,label:roleRecord.label,scopeType:roleRecord.scope_type}:role,configuration:configuration?{id:Number(configuration.id),version:configuration.version,status:configuration.status}:null},
    blockers,
    readiness:blockers.length?'BLOCKED':'READY',
    experience:{navigation:visibleDestinations,today:{attention,work:syntheticWork.filter(x=>x.key!=='history')},work:{composition:syntheticWork},contexts:visibleContexts,network:visibleDestinations.some(x=>x.key==='network'),objects:visibleDestinations.some(x=>x.key==='objects'),people:visibleDestinations.some(x=>x.key==='people'),account:visibleDestinations.some(x=>x.key==='account')},
    authorityMap:{navigation:'Human Platform Configuration',work:'Canonical domain authorities → Human Work Composer',contexts:'Canonical domain authorities',actions:'Canonical Action Registry',authorization:'Canonical server-side authorization',truth:'Canonical operational domains'},
    governance:{experienceVisibilityNeverGrantsAuthorization:true,productionChangesRequireGovernedRelease:true,tenantDataExcluded:true}
  };
}

export async function runHumanPlatformTestLab(env,input={}){
  const simulation=await resolveHumanPlatformSimulation(env,input);
  const rows=await listPlatformConfigurations(env);
  const selected=input.configurationId?rows.find(x=>Number(x.id)===Number(input.configurationId)):rows.find(x=>x.domain_code==='rendering'&&x.config_key==='human-work-platform'&&x.active&&x.status==='active');
  const payload=normalized(selected?.payload||humanPlatformDefaultConfiguration());
  const enabled=new Set(Object.entries(payload.workComposition).filter(([,v])=>v!==false).map(([k])=>k));
  const contexts=new Set(payload.contexts.filter(x=>x.enabled!==false).map(x=>x.key));
  const attention=new Set((payload.attention?.categories||[]).map(x=>x.key));
  const governance=payload.governance||{};
  const has=(requirement)=>requirement==='urgent_attention'?attention.has('urgent')||attention.has('needs_action'):enabled.has(requirement)||contexts.has(requirement);
  const results=HUMAN_PLATFORM_TEST_SCENARIOS.map(s=>{
    const details=[];
    for(const requirement of s.requires)if(!has(requirement))details.push(`Missing governed capability: ${requirement}`);
    if(s.key==='authorization_boundary'&&governance.experienceVisibilityNeverGrantsAuthorization!==true)details.push('Authorization boundary is not explicitly protected.');
    if(s.key==='release_boundary'&&governance.productionChangesRequireGovernedRelease!==true)details.push('Production release boundary is not explicitly protected.');
    if(simulation.blockers.length)details.push(...simulation.blockers.map(x=>x.message));
    const passed=details.length===0;
    return {key:s.key,name:s.name,description:s.description,status:passed?'PASS':'FAIL',expected:s.expected,journey:s.path,evidence:{configurationId:selected?Number(selected.id):null,configurationVersion:selected?.version||null,readOnly:true,productionMutation:false,canonicalAuthorities:simulation.authorityMap},details};
  });
  const passed=results.filter(x=>x.status==='PASS').length,failed=results.length-passed;
  return {version:HUMAN_PLATFORM_FINAL_VERSION,mode:'read-only deterministic journey lab',mutation:'NONE',selection:simulation.selection,summary:{total:results.length,passed,failed,status:failed?'FAIL':'PASS'},scenarios:results,simulation};
}

function releaseStage(row,auditById){
  if(row.active&&row.status==='active')return 'LIVE';
  const events=auditById.get(Number(row.id))||new Set();
  if(events.has('verified'))return 'VERIFIED';
  if(events.has('published'))return 'PUBLISHED';
  if(row.approved_by_type)return 'AUTHORIZED';
  if(row.status==='validated')return 'VALIDATED';
  if(row.status==='draft')return 'DRAFT';
  return String(row.status||'UNKNOWN').toUpperCase();
}

export async function getHumanPlatformReleaseLedger(env){
  const rows=(await listPlatformConfigurations(env)).filter(x=>x.domain_code==='rendering'&&x.config_key==='human-work-platform').sort((a,b)=>Number(b.id)-Number(a.id));
  const ids=rows.map(x=>Number(x.id));
  const auditRows=ids.length?(await env.DB.prepare(`SELECT resource_id,action,created_at,request_id,metadata FROM admin_control_audit_events WHERE resource_type='human_platform_control_plane' AND resource_id IN (${ids.map(()=>'?').join(',')}) ORDER BY id DESC LIMIT 500`).bind(...ids).all()).results||[]:[];
  const auditById=new Map();
  for(const x of auditRows){const id=Number(x.resource_id);if(!auditById.has(id))auditById.set(id,new Set());const action=String(x.action||'');if(action.endsWith('.published'))auditById.get(id).add('published');if(action.endsWith('.verified'))auditById.get(id).add('verified');}
  const active=rows.find(x=>x.active&&x.status==='active');
  return {version:HUMAN_PLATFORM_FINAL_VERSION,authority:'platform_configuration_versions',active:active?{id:Number(active.id),version:active.version,stage:'LIVE'}:null,releases:rows.slice(0,30).map(x=>({id:Number(x.id),configurationId:x.configuration_id,version:x.version,status:x.status,stage:releaseStage(x,auditById),active:Boolean(x.active),createdAt:x.created_at,updatedAt:x.updated_at,approvedBy:x.approved_by_type?{type:x.approved_by_type,id:x.approved_by_id}:null}))};
}

export async function publishHumanPlatform(env,actor,id,requestId){
  const row=await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=? AND domain_code='rendering' AND config_key='human-work-platform' LIMIT 1`).bind(Number(id)).first();
  if(!row)throw Object.assign(new Error('Human Platform configuration version not found'),{status:404,code:'HUMAN_PLATFORM_CONFIGURATION_NOT_FOUND'});
  if(row.status!=='validated'||!row.approved_by_type)throw Object.assign(new Error('Configuration must be authorized before publication'),{status:409,code:'HUMAN_PLATFORM_RELEASE_NOT_AUTHORIZED'});
  const existing=await env.DB.prepare(`SELECT id FROM admin_control_audit_events WHERE resource_type='human_platform_control_plane' AND resource_id=? AND action='human-platform.control-plane.published' ORDER BY id DESC LIMIT 1`).bind(Number(id)).first();
  if(!existing)await auditHumanPlatformFinal(env,actor,'published',id,requestId,{version:row.version,stage:'PUBLISHED'});
  return {configuration:{id:Number(row.id),version:row.version,status:row.status},stage:'PUBLISHED',reused:Boolean(existing)};
}

export async function verifyHumanPlatform(env,actor,id,requestId){
  const row=await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=? AND domain_code='rendering' AND config_key='human-work-platform' LIMIT 1`).bind(Number(id)).first();
  if(!row)throw Object.assign(new Error('Human Platform configuration version not found'),{status:404,code:'HUMAN_PLATFORM_CONFIGURATION_NOT_FOUND'});
  if(row.status!=='validated'||!row.approved_by_type)throw Object.assign(new Error('Configuration must be authorized before verification'),{status:409,code:'HUMAN_PLATFORM_RELEASE_NOT_AUTHORIZED'});
  const published=await env.DB.prepare(`SELECT id FROM admin_control_audit_events WHERE resource_type='human_platform_control_plane' AND resource_id=? AND action='human-platform.control-plane.published' ORDER BY id DESC LIMIT 1`).bind(Number(id)).first();
  if(!published)throw Object.assign(new Error('Configuration must be published before verification'),{status:409,code:'HUMAN_PLATFORM_RELEASE_NOT_PUBLISHED'});
  const lab=await runHumanPlatformTestLab(env,{configurationId:Number(id)});
  if(lab.summary.status!=='PASS')throw Object.assign(new Error('Human Work Test Lab must pass before release verification'),{status:409,code:'HUMAN_PLATFORM_TEST_LAB_FAILED',details:lab.summary});
  await auditHumanPlatformFinal(env,actor,'verified',id,requestId,{version:row.version,stage:'VERIFIED',scenarioCount:lab.summary.total,passed:lab.summary.passed});
  return {configuration:{id:Number(row.id),version:row.version,status:row.status},stage:'VERIFIED',lab:lab.summary};
}

export async function inspectHumanPlatformTenant(env,input={}){
  const tenantId=Number(input.tenantId||input.companyId||0)||null;
  if(!tenantId)throw Object.assign(new Error('Tenant selection is required'),{status:400,code:'TENANT_SELECTION_REQUIRED'});
  const company=await canonicalFirst(env,`SELECT c.id,COALESCE(cmp.legal_name,c.name) legal_name,cmp.trading_name,cmp.country_code,cmp.region_code,cmp.sector_code,cmp.organization_type,cmp.status management_status,c.deletion_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.id=? LIMIT 1`,[tenantId],'human_platform_tenant_inspection.company');
  if(!company)throw Object.assign(new Error('Tenant not found'),{status:404,code:'TENANT_NOT_FOUND'});
  const role=clean(input.role||input.roleCode,80)||'default';
  const country=clean(input.country||input.countryCode,2).toUpperCase()||String(company.country_code||'').toUpperCase()||null;
  const [activeConfig,launches,roles,missionCount]=await Promise.all([
    getActivePlatformConfiguration(env,'rendering','human-work-platform'),
    canonicalFirst(env,`SELECT id,country_code,version,status,active,eligibility_json,updated_at FROM country_product_launches WHERE country_code=? AND status='active' AND active=1 ORDER BY id DESC LIMIT 8`,[country],'human_platform_tenant_inspection.product'),
    canonicalFirst(env,`SELECT role_code,label,scope_type,active FROM organization_role_catalog WHERE role_code=? LIMIT 1`,[role],'human_platform_tenant_inspection.role'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM mission_canonical_projection WHERE company_id=? AND status NOT IN ('Delivered','Cancelled','Completed')`,[tenantId],'human_platform_tenant_inspection.missions')
  ]);
  const payload=normalized(activeConfig?.payload||humanPlatformDefaultConfiguration());
  const roleExperience=payload.roleExperience?.[role]||payload.roleExperience?.default||{};
  return {version:HUMAN_PLATFORM_FINAL_VERSION,readOnly:true,tenant:{id:Number(company.id),name:company.legal_name||company.trading_name||`Tenant ${company.id}`,country,sector:company.sector_code,organizationType:company.organization_type,status:company.management_status,deletionStatus:company.deletion_status},selection:{role,roleConfigured:Boolean(roles),country},experience:{release:activeConfig?{id:Number(activeConfig.id),version:activeConfig.version,status:activeConfig.status}:null,navigation:payload.canonicalDestinations,workComposition:payload.workComposition,contexts:payload.contexts,attention:payload.attention,roleExperience},product:{activeRelease:launches?{id:Number(launches.id),countryCode:launches.country_code,version:launches.version,status:launches.status,active:Boolean(Number(launches.active)),updatedAt:launches.updated_at}:null},operationalProjection:{openMissions:Number(missionCount?.count||0)},authorityBoundary:'Read-only projection; no tenant mutation or impersonation is performed.'};
}

export async function getHumanPlatformRuntimeCenter(env){
  const health=await getSystemHealth(env);
  const operations=(await env.DB.prepare(`SELECT id,operation_key,action_code,resource_type,resource_id,status,started_at,updated_at,error_code FROM platform_admin_operations ORDER BY id DESC LIMIT 30`).all()).results||[];
  const audit=(await env.DB.prepare(`SELECT id,actor_role,action,resource_type,resource_id,request_id,created_at FROM admin_control_audit_events ORDER BY id DESC LIMIT 30`).all()).results||[];
  return {version:HUMAN_PLATFORM_FINAL_VERSION,health,operations:operations.map(x=>({...x,id:Number(x.id),resourceId:x.resource_id===null?null:String(x.resource_id)})),audit,recovery:{posture:health.degradedAuthorities?.length?'DEGRADED':'HEALTHY',rule:'Canonical failures remain explicit; recovery does not invent missing truth.',availableActions:['inspect','reconcile through existing canonical recovery authorities','review audit']},governance:{readOnlyObservability:true,mutationsViaCanonicalAuthorities:true}};
}

export async function auditHumanPlatformFinal(env,actor,action,resourceId,requestId,metadata={}){return auditAdminControl(env,{actor,action:`human-platform.control-plane.${action}`,resourceType:'human_platform_control_plane',resourceId:resourceId==null?null:String(resourceId),targetCompanyId:null,requestId,metadata});}
