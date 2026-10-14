/* ON Mission 10.96.0 — Human Platform Control Plane foundation.
 * Experience governance only. Canonical operational truth remains in domain authorities.
 */
import {listPlatformConfigurations,createConfigurationDraft,validateConfigurationDraft,authorizeConfiguration,activateConfiguration,rollbackConfiguration,previewConfigurationImpact} from '../../security/platform-configuration.service.js';
import {auditAdminControl} from './admin-control.audit.js';
import {getSystemHealth} from './system-health.service.js';
import {canonicalFirst} from '../../core/canonical-db.js';

export const HUMAN_PLATFORM_CONTROL_VERSION='human-platform-control.v1';
export const HUMAN_PLATFORM_DOMAIN='rendering';
export const HUMAN_PLATFORM_CONFIG_KEY='human-work-platform';
export const HUMAN_PLATFORM_DESTINATIONS=Object.freeze(['today','work','network','objects','people','account']);
export const HUMAN_PLATFORM_CONTEXTS=Object.freeze(['mission','person','organization','network_relationship','object','product']);
export const HUMAN_PLATFORM_WORK_SOURCES=Object.freeze(['mission','assignment','network','evidence','exception','waiting','history']);

const clone=x=>JSON.parse(JSON.stringify(x));
const defaultConfig=()=>({
  contractVersion:HUMAN_PLATFORM_CONTROL_VERSION,
  canonicalDestinations:HUMAN_PLATFORM_DESTINATIONS.map((key,index)=>({key,label:key==='today'?'Today':key[0].toUpperCase()+key.slice(1),order:index+1,enabled:true,required:true})),
  workComposition:Object.fromEntries(HUMAN_PLATFORM_WORK_SOURCES.map(key=>[key,true])),
  contexts:HUMAN_PLATFORM_CONTEXTS.map(key=>({key,enabled:true,entry:'contextual'})),
  roleExperience:{default:{destinations:[...HUMAN_PLATFORM_DESTINATIONS],contexts:[...HUMAN_PLATFORM_CONTEXTS]}},
  attention:{categories:[{key:'urgent',source:'liveness',priority:'critical'},{key:'needs_action',source:'assignment',priority:'high'},{key:'waiting',source:'mission_lifecycle',priority:'informational'},{key:'network_decision',source:'network',priority:'high'}]},
  governance:{experienceVisibilityNeverGrantsAuthorization:true,canonicalTruthOwnedByDomains:true,mutationsViaCanonicalActionRegistry:true,productionChangesRequireGovernedRelease:true}
});
const parse=v=>{try{return JSON.parse(v||'{}')}catch{return {}}};
const clean=v=>String(v??'').trim().slice(0,120);
export function normalizeHumanPlatformPayload(payload){
  const p=payload&&typeof payload==='object'&&!Array.isArray(payload)?clone(payload):defaultConfig();
  const required=new Set(HUMAN_PLATFORM_DESTINATIONS);
  const destinations=Array.isArray(p.canonicalDestinations)?p.canonicalDestinations:[];
  const keys=new Set(destinations.map(x=>clean(x?.key)));
  if(keys.size!==required.size||[...required].some(k=>!keys.has(k)))throw Object.assign(new Error('Human Work canonical destinations cannot be removed or replaced'),{status:422,code:'HUMAN_PLATFORM_CANONICAL_DESTINATION_INVALID'});
  p.canonicalDestinations=destinations.map((x,i)=>({key:clean(x.key),label:clean(x.label,60)||clean(x.key),order:Number(x.order)||i+1,enabled:true,required:true}));
  p.workComposition=Object.fromEntries(HUMAN_PLATFORM_WORK_SOURCES.map(k=>[k,p.workComposition?.[k]!==false]));
  p.contexts=HUMAN_PLATFORM_CONTEXTS.map(k=>{const found=Array.isArray(p.contexts)?p.contexts.find(x=>x?.key===k):null;return {key:k,enabled:found?.enabled!==false,entry:'contextual'}});
  p.governance={...defaultConfig().governance,...(p.governance||{})};
  return p;
}
function sanitize(row){if(!row)return null;return {...row,id:Number(row.id),active:Number(row.active)===1,payload:normalizeHumanPlatformPayload(parse(row.payload_json))};}

export function humanPlatformDefaultConfiguration(){return defaultConfig();}

export async function getHumanPlatformControl(env){
  const rows=(await listPlatformConfigurations(env)).filter(x=>x.domain_code===HUMAN_PLATFORM_DOMAIN&&x.config_key===HUMAN_PLATFORM_CONFIG_KEY).sort((a,b)=>Number(b.id)-Number(a.id));
  const active=sanitize(rows.find(x=>x.active&&x.status==='active')||null);
  const draft=sanitize(rows.find(x=>x.status==='draft')||null);
  const validated=sanitize(rows.find(x=>x.status==='validated')||null);
  let runtime={status:'UNAVAILABLE',details:null};
  try{const health=await getSystemHealth(env);runtime={status:'HEALTHY',details:health};}catch(error){runtime={status:'AUTHORITY_UNAVAILABLE',details:{code:String(error?.code||'AUTHORITY_UNAVAILABLE'),status:Number(error?.status)||503}};}
  return {version:HUMAN_PLATFORM_CONTROL_VERSION,domain:HUMAN_PLATFORM_DOMAIN,configKey:HUMAN_PLATFORM_CONFIG_KEY,canonicalDestinations:HUMAN_PLATFORM_DESTINATIONS,contexts:HUMAN_PLATFORM_CONTEXTS,workSources:HUMAN_PLATFORM_WORK_SOURCES,configuration:active||{status:'governed_default',payload:defaultConfig()},draft,validated,runtime,governance:{truth:'canonical domain authorities',mutation:'canonical Action Registry',authorization:'server-side canonical authorization',release:'validated → authorized → active',rollback:'previous verified configuration'} };
}

export async function createHumanPlatformDraft(env,actor,input,requestId){
  const payload=normalizeHumanPlatformPayload(input?.payload||defaultConfig());
  return createConfigurationDraft(env,actor,{configurationId:'human-work-platform',domainCode:HUMAN_PLATFORM_DOMAIN,configKey:HUMAN_PLATFORM_CONFIG_KEY,version:'auto',payload,reason:clean(input?.reason,500)||'Human Working Platform experience configuration',},requestId);
}
export async function validateHumanPlatform(env,actor,id,requestId){return validateConfigurationDraft(env,actor,Number(id),requestId);}
export async function authorizeHumanPlatform(env,actor,id,requestId){return authorizeConfiguration(env,actor,Number(id),requestId);}
export async function activateHumanPlatform(env,actor,id,requestId,guard={}){
  const row=await canonicalFirst(env,`SELECT id,status,approved_by_type FROM platform_configuration_versions WHERE id=? AND domain_code=? AND config_key=? LIMIT 1`,[Number(id),HUMAN_PLATFORM_DOMAIN,HUMAN_PLATFORM_CONFIG_KEY],'human_platform_activation.configuration');
  if(!row)throw Object.assign(new Error('Human Platform configuration version not found'),{status:404,code:'HUMAN_PLATFORM_CONFIGURATION_NOT_FOUND'});
  if(row.status!=='validated'||!row.approved_by_type)throw Object.assign(new Error('Human Platform configuration must be authorized before activation'),{status:409,code:'HUMAN_PLATFORM_RELEASE_NOT_AUTHORIZED'});
  const published=await canonicalFirst(env,`SELECT id FROM admin_control_audit_events WHERE resource_type='human_platform_control_plane' AND resource_id=? AND action='human-platform.control-plane.published' ORDER BY id DESC LIMIT 1`,[Number(id)],'human_platform_activation.publication');
  if(!published)throw Object.assign(new Error('Human Platform configuration must be published before activation'),{status:409,code:'HUMAN_PLATFORM_RELEASE_NOT_PUBLISHED'});
  const verified=await canonicalFirst(env,`SELECT id FROM admin_control_audit_events WHERE resource_type='human_platform_control_plane' AND resource_id=? AND action='human-platform.control-plane.verified' ORDER BY id DESC LIMIT 1`,[Number(id)],'human_platform_activation.verification');
  if(!verified)throw Object.assign(new Error('Human Work Test Lab verification is required before activation'),{status:409,code:'HUMAN_PLATFORM_RELEASE_NOT_VERIFIED'});
  if(!Object.prototype.hasOwnProperty.call(guard,'expectedActiveConfigId')||!Object.prototype.hasOwnProperty.call(guard,'expectedActiveVersion'))throw Object.assign(new Error('Activation requires an explicit active-version concurrency guard'),{status:409,code:'HUMAN_PLATFORM_ACTIVE_GUARD_REQUIRED'});
  return activateConfiguration(env,actor,Number(id),requestId,guard);
}
export async function rollbackHumanPlatform(env,actor,id,requestId){return rollbackConfiguration(env,actor,Number(id),requestId);}
export async function previewHumanPlatform(env,id){const impact=await previewConfigurationImpact(env,Number(id));return {...impact,contractVersion:HUMAN_PLATFORM_CONTROL_VERSION,canonicalDestinations:HUMAN_PLATFORM_DESTINATIONS};}

export async function auditHumanPlatformAction(env,actor,action,resourceId,requestId,metadata={}){
  return auditAdminControl(env,{actor,action:`human-platform.${action}`,resourceType:'human_work_platform_configuration',resourceId:resourceId==null?null:String(resourceId),targetCompanyId:null,requestId,metadata});
}
