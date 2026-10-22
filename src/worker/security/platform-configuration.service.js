import {canonicalFirst} from '../core/canonical-db.js';
import {auditAdminControl} from './admin-control-audit.service.js';

function bad(message,status=400){const e=new Error(message);e.status=status;return e;}
function clean(v,max=200){return String(v??'').trim().slice(0,max);}
function parse(v){try{return JSON.parse(v||'{}')}catch{return {}}}
const FORBIDDEN_KEYS=/password|secret|api[_-]?key|private[_-]?key|signing[_-]?key|credential|token/i;

export const PLATFORM_CONFIGURATION_DOMAINS=Object.freeze([
  'countries','jurisdictions','capabilities','organization_types','sectors','mission_rules','roles','rendering','guidance','capability_eligibility','subscription_plans','limits','communication_policies','provider_policies','retention','privacy','policy','residency','operational_thresholds','mission.lifecycle','i18n.catalog'
]);

export async function listPlatformConfigurations(env){
  const rows=(await env.DB.prepare(`SELECT id,configuration_id,domain_code,config_key,version,status,payload_json,effective_at,active,created_by_type,created_by_id,approved_by_type,approved_by_id,audit_event_id,created_at,updated_at FROM platform_configuration_versions ORDER BY domain_code,config_key,version DESC,id DESC LIMIT 500`).all()).results||[];
  return rows.map(r=>({...r,id:Number(r.id),active:Number(r.active)===1,payload:parse(r.payload_json)}));
}
export async function getActivePlatformConfiguration(env,domainCode,configKey){
  const row=await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE domain_code=? AND config_key=? AND status='active' AND active=1 ORDER BY effective_at DESC,id DESC LIMIT 1`).bind(clean(domainCode,80),clean(configKey,120)).first();
  return row?{...row,id:Number(row.id),active:true,payload:parse(row.payload_json)}:null;
}
export function validatePlatformConfiguration({domainCode,configKey,version,payload}){
  const d=clean(domainCode,80),k=clean(configKey,120),v=clean(version,40);
  if(!PLATFORM_CONFIGURATION_DOMAINS.includes(d))throw bad('Unsupported platform configuration domain',422);
  if(!k||!v)throw bad('Configuration identity is required');
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw bad('Configuration payload must be an object');
  const serialized=JSON.stringify(payload);
  if(serialized.length>12000)throw bad('Configuration payload is too large',413);
  if(FORBIDDEN_KEYS.test(serialized))throw bad('Secrets and credentials cannot be stored in product configuration',422);
  return {domainCode:d,configKey:k,version:v,payload,serialized};
}

async function nextVersion(env,domainCode,configKey){
  const row=await env.DB.prepare(`SELECT MAX(CAST(version AS INTEGER)) max_version FROM platform_configuration_versions WHERE domain_code=? AND config_key=?`).bind(domainCode,configKey).first();
  return String(Number(row?.max_version||0)+1);
}

export async function createConfigurationDraft(env,actor,input,requestId){
  const normalized=validatePlatformConfiguration(input);
  if(input.dataEntryId){const fenced=await env.DB.prepare(`SELECT id FROM platform_configuration_versions WHERE data_entry_id=? LIMIT 1`).bind(String(input.dataEntryId)).first();if(fenced)return env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=?`).bind(fenced.id).first();}
  const version=normalized.version==='auto'?await nextVersion(env,normalized.domainCode,normalized.configKey):normalized.version;
  const configurationId=clean(input.configurationId,160)||`${normalized.domainCode}:${normalized.configKey}`;
  const existing=await env.DB.prepare(`SELECT id FROM platform_configuration_versions WHERE domain_code=? AND config_key=? AND version=? LIMIT 1`).bind(normalized.domainCode,normalized.configKey,version).first();
  if(existing)throw bad('Configuration version already exists',409);
  const id=await env.DB.prepare(`INSERT INTO platform_configuration_versions(configuration_id,domain_code,config_key,version,status,payload_json,active,created_by_type,created_by_id,data_entry_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(configurationId,normalized.domainCode,normalized.configKey,version,'draft',normalized.serialized,0,actor.role,actor.id||null,input.dataEntryId==null?null:String(input.dataEntryId)).run();
  const row=await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=?`).bind(id.meta?.last_row_id||id.last_row_id).first();
  if(!row)throw bad('Configuration draft could not be created',500);
  await env.DB.prepare(`INSERT INTO platform_configuration_change_requests(request_id,configuration_version_id,stage,requested_by_type,requested_by_id,reason) VALUES(?,?,?,?,?,?)`).bind(requestId||crypto.randomUUID(),row.id,'draft',actor.role,actor.id||null,clean(input.reason,500)||null).run();
  await auditAdminControl(env,{actor,action:'admin.platform-config.draft-created',resourceType:'platform_configuration',resourceId:row?.id||null,requestId,metadata:{domainCode:normalized.domainCode,configKey:normalized.configKey,version}});
  return row;
}

export async function validateConfigurationDraft(env,actor,id,requestId){
  const row=await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=? LIMIT 1`).bind(Number(id)).first();
  if(!row)throw bad('Configuration version not found',404);if(row.status!=='draft')throw bad('Only draft configurations can be validated',409);
  const normalized=validatePlatformConfiguration({domainCode:row.domain_code,configKey:row.config_key,version:row.version,payload:parse(row.payload_json)});
  const duplicate=await env.DB.prepare(`SELECT id FROM platform_configuration_versions WHERE domain_code=? AND config_key=? AND version=? AND id<>?`).bind(row.domain_code,row.config_key,row.version,row.id).first();
  if(duplicate)throw bad('Configuration version conflicts with an existing version',409);
  await env.DB.prepare(`UPDATE platform_configuration_versions SET status='validated',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft'`).bind(row.id).run();
  await env.DB.prepare(`UPDATE platform_configuration_change_requests SET stage='validated',impact_json=?,updated_at=CURRENT_TIMESTAMP WHERE configuration_version_id=? AND stage='draft'`).bind(JSON.stringify(await previewConfigurationImpact(env,row.id)),row.id).run();
  await auditAdminControl(env,{actor,action:'admin.platform-config.validated',resourceType:'platform_configuration',resourceId:row.id,requestId,metadata:{domainCode:normalized.domainCode,configKey:normalized.configKey,version:normalized.version}});
  return env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=?`).bind(row.id).first();
}

export async function previewConfigurationImpact(env,id){
  const row=await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=? LIMIT 1`).bind(Number(id)).first();
  if(!row)throw bad('Configuration version not found',404);
  const [orgs,missions,capabilities]=await Promise.all([
    canonicalFirst(env,`SELECT COUNT(*) count FROM company_management_profiles`,[], 'platform_configuration_impact'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM mission_canonical_projection WHERE status NOT IN ('Delivered','Cancelled','Completed')`,[], 'platform_configuration_impact'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM canonical_capability_registry WHERE status='active'`,[], 'platform_configuration_impact')
  ]);
  return {configuration:{id:Number(row.id),domainCode:row.domain_code,configKey:row.config_key,version:row.version,status:row.status},affectedOrganizations:Number(orgs?.count||0),affectedActiveMissions:Number(missions?.count||0),activeCapabilities:Number(capabilities?.count||0),existingData:'preserved',newUsage:'policy-dependent; activation does not delete historical data'};
}

export async function authorizeConfiguration(env,actor,id,requestId){
  const row=await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=? LIMIT 1`).bind(Number(id)).first();
  if(!row)throw bad('Configuration version not found',404);if(row.status!=='validated')throw bad('Configuration must be validated before authorization',409);
  const impact=await previewConfigurationImpact(env,row.id);
  await env.DB.prepare(`UPDATE platform_configuration_versions SET approved_by_type=?,approved_by_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='validated'`).bind(actor.role,actor.id||null,row.id).run();
  await env.DB.prepare(`UPDATE platform_configuration_change_requests SET stage='approved',authorization_actor_type=?,authorization_actor_id=?,approved_by_type=?,approved_by_id=?,impact_json=?,updated_at=CURRENT_TIMESTAMP WHERE configuration_version_id=? AND stage='validated'`).bind(actor.role,actor.id||null,actor.role,actor.id||null,JSON.stringify(impact),row.id).run();
  await auditAdminControl(env,{actor,action:'admin.platform-config.authorized',resourceType:'platform_configuration',resourceId:row.id,requestId,metadata:{domainCode:row.domain_code,configKey:row.config_key,version:row.version}});
  return env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=?`).bind(row.id).first();
}

export async function activateConfiguration(env,actor,id,requestId,guard={}){
  const row=await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=? LIMIT 1`).bind(Number(id)).first();
  if(!row)throw bad('Configuration version not found',404);if(row.status!=='validated'||!row.approved_by_type)throw bad('Configuration requires validation and approval before activation',409);
  const current=await env.DB.prepare(`SELECT id,version FROM platform_configuration_versions WHERE domain_code=? AND config_key=? AND active=1 LIMIT 1`).bind(row.domain_code,row.config_key).first();
  if(guard.expectedActiveConfigId!=null&&Number(guard.expectedActiveConfigId)!==Number(current?.id||0))throw bad('PLATFORM_CONFIGURATION_ACTIVE_VERSION_CHANGED',409);
  if(guard.expectedActiveVersion!=null&&String(guard.expectedActiveVersion)!==String(current?.version||''))throw bad('PLATFORM_CONFIGURATION_ACTIVE_VERSION_CHANGED',409);
  const impact=await previewConfigurationImpact(env,id);
  const batch=[
    env.DB.prepare(`UPDATE platform_configuration_versions SET status='retired',active=0,updated_at=CURRENT_TIMESTAMP WHERE domain_code=? AND config_key=? AND active=1`).bind(row.domain_code,row.config_key),
    env.DB.prepare(`UPDATE platform_configuration_versions SET status='active',active=1,effective_at=COALESCE(effective_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id)
  ];
  await env.DB.batch(batch);
  await env.DB.prepare(`UPDATE platform_configuration_change_requests SET stage='activated',impact_json=?,updated_at=CURRENT_TIMESTAMP WHERE configuration_version_id=? AND stage='approved'`).bind(JSON.stringify(impact),row.id).run();
  await auditAdminControl(env,{actor,action:'admin.platform-config.activated',resourceType:'platform_configuration',resourceId:row.id,requestId,metadata:{domainCode:row.domain_code,configKey:row.config_key,version:row.version,affectedOrganizations:impact.affectedOrganizations,affectedActiveMissions:impact.affectedActiveMissions}});
  return {configuration:await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=?`).bind(row.id).first(),impact};
}

export async function rollbackConfiguration(env,actor,id,requestId){
  const source=await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=? LIMIT 1`).bind(Number(id)).first();
  if(!source)throw bad('Configuration version not found',404);
  const version=await nextVersion(env,source.domain_code,source.config_key);
  return createConfigurationDraft(env,actor,{configurationId:source.configuration_id,domainCode:source.domain_code,configKey:source.config_key,version,payload:parse(source.payload_json)},requestId);
}
