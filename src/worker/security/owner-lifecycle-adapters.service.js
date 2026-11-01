import {setProductCountryActive,getProductCountry} from './product-country-catalog.service.js';
import {getCountryBlueprint,prepareCountryBlueprintForLaunch} from './country-product-blueprint.service.js';
import {getProductDefinition,compileProductDefinition} from './product-definition.service.js';
import {validateConfigurationDraft,authorizeConfiguration,activateConfiguration,rollbackConfiguration} from './platform-configuration.service.js';
import {auditAdminControl} from './admin-control-audit.service.js';

const conflict=(code,message)=>Object.assign(new Error(message||code),{status:409,code});
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const stamp=row=>String(row?.updated_at||'');
const missing=(code)=>Object.assign(new Error(code),{status:404,code});
const stale=(row,expected,label)=>{if(!expected||stamp(row)!==String(expected))throw conflict('OWNER_LIFECYCLE_STALE_RESOURCE',`${label} changed; refresh before retrying.`)};

// Every advertised command is delegated to its canonical owner. Mutations are revision-fenced and read back.
export function listOwnerLifecycleAdapters(){
 return [
  {resourceType:'sector',ownerAuthority:'sectorCatalog',adapter:'sector-catalog.lifecycle.v2',status:'OPERATIONAL_WITH_DEPENDENCY_GUARDS',supportedCommands:['inspect','activate','deactivate'],unsupportedCommands:['suspend','resume','retire'],guards:['expectedUpdatedAt','active-product-definition-dependency-check','canonical-readback']},
  {resourceType:'product_country',ownerAuthority:'productCountryCatalog',adapter:'product-country.lifecycle.v1',status:'OPERATIONAL',supportedCommands:['inspect','activate','deactivate'],unsupportedCommands:['suspend','resume','retire'],guards:['expectedUpdatedAt','atomic-active-launch-dependency-check','canonical-readback']},
  {resourceType:'country_blueprint',ownerAuthority:'countryProductBlueprintAuthority',adapter:'country-blueprint.lifecycle.v2',status:'OPERATIONAL_WITH_READINESS_GUARD',supportedCommands:['inspect','prepare_for_launch'],unsupportedCommands:['activate','suspend','resume','retire'],guards:['expectedUpdatedAt','owner-readiness-validation','canonical-readback']},
  {resourceType:'product_definition',ownerAuthority:'Product Factory',adapter:'product-definition.lifecycle.v2',status:'OPERATIONAL_WITH_REVISION_GUARD',supportedCommands:['inspect','compile'],unsupportedCommands:['activate','suspend','resume','retire'],guards:['expectedUpdatedAt','draft-only-compile','manifest-hash','canonical-readback']},
  {resourceType:'policy',ownerAuthority:'policyCatalog',adapter:'policy.lifecycle.v2',status:'OPERATIONAL_WITH_RELEASE_GUARD',supportedCommands:['inspect','activate','deactivate'],unsupportedCommands:['suspend','resume','retire'],guards:['expectedUpdatedAt','published-market-dependency-check','canonical-readback']},
  {resourceType:'configuration',ownerAuthority:'platformConfigurationAuthority',adapter:'configuration.lifecycle.v1',status:'OPERATIONAL',supportedCommands:['inspect','validate','authorize','activate','rollback'],unsupportedCommands:['suspend','resume','retire'],guards:['owner-validation','impact-preview','approval','expected-active-version','versioned-rollback']}
 ];
}

async function inspectOwner(env,type,id){
 if(type==='sector')return env.DB.prepare(`SELECT code,name,description,active,created_at,updated_at FROM platform_reusable_sectors WHERE code=? LIMIT 1`).bind(String(id)).first();
 if(type==='product_country')return getProductCountry(env,String(id));
 if(type==='country_blueprint')return getCountryBlueprint(env,number(id));
 if(type==='product_definition')return getProductDefinition(env,number(id));
 if(type==='policy')return env.DB.prepare(`SELECT code,name,policy_type,scope,configuration_json,active,created_at,updated_at FROM platform_reusable_policies WHERE code=? LIMIT 1`).bind(String(id)).first();
 if(type==='configuration')return env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=? LIMIT 1`).bind(number(id)).first();
 return null;
}

async function executeOwnerLifecycleCommandOnce(env,actor,input={},requestId=''){
 const type=String(input.resourceType||'').trim(),command=String(input.command||'').trim().toLowerCase(),id=input.resourceId;
 const adapter=listOwnerLifecycleAdapters().find(x=>x.resourceType===type);
 if(!adapter||!adapter.supportedCommands.includes(command))throw Object.assign(new Error('OWNER_LIFECYCLE_COMMAND_NOT_SUPPORTED'),{status:422,code:'OWNER_LIFECYCLE_COMMAND_NOT_SUPPORTED',details:{resourceType:type,command,supportedCommands:adapter?.supportedCommands||[]}});
 const resourceId=String(id??'');if(!resourceId)throw Object.assign(new Error('OWNER_LIFECYCLE_RESOURCE_ID_REQUIRED'),{status:422,code:'OWNER_LIFECYCLE_RESOURCE_ID_REQUIRED'});
 let result;
 if(command==='inspect'){
  result=await inspectOwner(env,type,id);if(!result)throw missing('OWNER_LIFECYCLE_RESOURCE_NOT_FOUND');
 }else if(type==='product_country'){
  const current=await getProductCountry(env,resourceId);if(!current)throw missing('PRODUCT_COUNTRY_NOT_FOUND');stale(current,input.expectedUpdatedAt,'Product Country');
  result=await setProductCountryActive(env,resourceId,command==='activate',{expectedUpdatedAt:input.expectedUpdatedAt});
  const after=await getProductCountry(env,resourceId);if(Number(after?.active)!==(command==='activate'?1:0))throw Object.assign(new Error('OWNER_LIFECYCLE_READBACK_FAILED'),{status:503,code:'OWNER_LIFECYCLE_READBACK_FAILED'});result=after;
 }else if(type==='sector'){
  const current=await inspectOwner(env,type,resourceId);if(!current)throw missing('SECTOR_NOT_FOUND');stale(current,input.expectedUpdatedAt,'Sector');
  if(command==='deactivate'){
   const [dependent,policyDependent]=await Promise.all([env.DB.prepare(`SELECT id FROM platform_product_definitions WHERE lower(sector_code)=lower(?) AND status IN ('compiled','published','active') LIMIT 1`).bind(resourceId).first(),env.DB.prepare(`SELECT code FROM sector_policies WHERE lower(sector_code)=lower(?) AND status='active' LIMIT 1`).bind(resourceId).first()]);
   if(dependent||policyDependent)throw conflict('SECTOR_HAS_ACTIVE_PRODUCT_DEPENDENCIES','Sector is referenced by an active Sector Policy or compiled/active Product Definition. Retire or replace the dependent resource first.');
  }
  const changed=await env.DB.prepare(`UPDATE platform_reusable_sectors SET active=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE code=? AND updated_at=?`).bind(command==='activate'?1:0,resourceId,input.expectedUpdatedAt).run();
  if(Number(changed.meta?.changes??changed.changes??0)!==1)throw conflict('OWNER_LIFECYCLE_STALE_RESOURCE','Sector changed during the operation.');
  result=await inspectOwner(env,type,resourceId);if(Number(result?.active)!==(command==='activate'?1:0))throw Object.assign(new Error('OWNER_LIFECYCLE_READBACK_FAILED'),{status:503,code:'OWNER_LIFECYCLE_READBACK_FAILED'});
 }else if(type==='country_blueprint'){
  const current=await getCountryBlueprint(env,number(id));if(!current)throw missing('COUNTRY_BLUEPRINT_NOT_FOUND');stale(current,input.expectedUpdatedAt,'Country Blueprint');
  result=await prepareCountryBlueprintForLaunch(env,actor,number(id));
  const after=await getCountryBlueprint(env,number(id));if(!after||!['ready','preparing'].includes(String(after.status)))throw Object.assign(new Error('OWNER_LIFECYCLE_READBACK_FAILED'),{status:503,code:'OWNER_LIFECYCLE_READBACK_FAILED'});
  result={...after,readiness:result.readiness};
 }else if(type==='product_definition'){
  const current=await getProductDefinition(env,number(id));if(!current)throw missing('PRODUCT_DEFINITION_NOT_FOUND');stale(current,input.expectedUpdatedAt,'Product Definition');
  if(String(current.status)!=='draft')throw conflict('PRODUCT_DEFINITION_NOT_DRAFT','Only a draft Product Definition can be compiled.');
  result=await compileProductDefinition(env,number(id));
  const after=await getProductDefinition(env,number(id));if(after.status!=='compiled'||!result.manifestHash)throw Object.assign(new Error('OWNER_LIFECYCLE_READBACK_FAILED'),{status:503,code:'OWNER_LIFECYCLE_READBACK_FAILED'});
  result={...result,definition:after};
 }else if(type==='policy'){
  const current=await inspectOwner(env,type,resourceId);if(!current)throw missing('POLICY_NOT_FOUND');stale(current,input.expectedUpdatedAt,'Policy');
  if(command==='deactivate'){
   const dependent=await env.DB.prepare(`SELECT v.id FROM platform_market_package_versions v WHERE v.status IN ('PUBLISHED','VERIFIED','LIVE') AND EXISTS (SELECT 1 FROM json_each(json_extract(v.package_json,'$.policies')) p WHERE json_extract(p.value,'$.code')=?) LIMIT 1`).bind(resourceId).first();
   if(dependent)throw conflict('POLICY_HAS_PUBLISHED_MARKET_DEPENDENCIES','A published or live market release references this policy. Create a replacement release before deactivation.');
  }
  const changed=await env.DB.prepare(`UPDATE platform_reusable_policies SET active=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE code=? AND updated_at=?`).bind(command==='activate'?1:0,resourceId,input.expectedUpdatedAt).run();
  if(Number(changed.meta?.changes??changed.changes??0)!==1)throw conflict('OWNER_LIFECYCLE_STALE_RESOURCE','Policy changed during the operation.');
  result=await inspectOwner(env,type,resourceId);if(Number(result?.active)!==(command==='activate'?1:0))throw Object.assign(new Error('OWNER_LIFECYCLE_READBACK_FAILED'),{status:503,code:'OWNER_LIFECYCLE_READBACK_FAILED'});
 }else if(type==='configuration'){
  const configId=number(id);const current=await inspectOwner(env,type,configId);if(!current)throw missing('PLATFORM_CONFIGURATION_NOT_FOUND');stale(current,input.expectedUpdatedAt,'Configuration');
  if(command==='validate')result=await validateConfigurationDraft(env,actor,configId,requestId);
  else if(command==='authorize')result=await authorizeConfiguration(env,actor,configId,requestId);
  else if(command==='activate')result=await activateConfiguration(env,actor,configId,requestId,{expectedActiveConfigId:input.expectedActiveConfigId??0,expectedActiveVersion:input.expectedActiveVersion??''});
  else result=await rollbackConfiguration(env,actor,configId,requestId);
  if(!result)throw Object.assign(new Error('OWNER_LIFECYCLE_READBACK_FAILED'),{status:503,code:'OWNER_LIFECYCLE_READBACK_FAILED'});
 }
 await auditAdminControl(env,{actor,action:`platform.owner_lifecycle.${type}.${command}`,resourceType:type,resourceId,requestId,metadata:{adapter:adapter.adapter,command,outcome:command==='inspect'?'OWNER_INSPECTED':'OWNER_RESULT_READ_BACK'}});
 return {success:true,adapter:adapter.adapter,resourceType:type,resourceId,command,result,verified:true,observedAt:new Date().toISOString()};
}


const stable=(v)=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
async function digest(value){const bytes=new TextEncoder().encode(JSON.stringify(stable(value)));const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function getOwnerLifecycleOperation(env,idempotencyKey){
 const row=await env.DB.prepare(`SELECT idempotency_key,operation_hash,resource_type,resource_id,command,status,result_json,error_code,error_message,actor_type,actor_id,request_id,started_at,completed_at,updated_at FROM platform_owner_lifecycle_operations WHERE idempotency_key=? LIMIT 1`).bind(String(idempotencyKey||'')).first();
 if(!row)return null;let result={};try{result=JSON.parse(row.result_json||'{}')}catch{}return {...row,result};
}
export async function executeOwnerLifecycleCommand(env,actor,input={},requestId=''){
 const type=String(input.resourceType||'').trim(),command=String(input.command||'').trim().toLowerCase();
 const adapter=listOwnerLifecycleAdapters().find(x=>x.resourceType===type);
 if(!adapter||!adapter.supportedCommands.includes(command))return executeOwnerLifecycleCommandOnce(env,actor,input,requestId);
 if(command==='inspect')return executeOwnerLifecycleCommandOnce(env,actor,input,requestId);
 const key=String(input.idempotencyKey||requestId||'').trim();
 if(!key||key.length>180)throw Object.assign(new Error('A stable idempotencyKey is required for owner lifecycle mutations.'),{status:422,code:'OWNER_LIFECYCLE_IDEMPOTENCY_KEY_REQUIRED'});
 const fingerprint=await digest({resourceType:type,resourceId:String(input.resourceId??''),command,expectedUpdatedAt:String(input.expectedUpdatedAt||''),expectedActiveConfigId:input.expectedActiveConfigId??null,expectedActiveVersion:input.expectedActiveVersion??null});
 const existing=await getOwnerLifecycleOperation(env,key);
 if(existing){
  if(existing.operation_hash!==fingerprint)throw conflict('OWNER_LIFECYCLE_IDEMPOTENCY_CONFLICT','This idempotency key was already used for a different command.');
  if(existing.status==='COMPLETED')return {...existing.result,reused:true,idempotencyKey:key};
  throw conflict('OWNER_LIFECYCLE_RECOVERY_REQUIRED',`The prior command is ${existing.status}. Inspect its operation record and canonical resource before retrying.`);
 }
 const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO platform_owner_lifecycle_operations(idempotency_key,operation_hash,resource_type,resource_id,command,status,actor_type,actor_id,request_id) VALUES(?,?,?,?,?,'IN_PROGRESS',?,?,?)`).bind(key,fingerprint,type,String(input.resourceId??''),command,String(actor?.role||actor?.type||'platform_super_administrator'),actor?.id==null?null:String(actor.id),requestId||null).run();
 if(Number(inserted.meta?.changes??inserted.changes??0)!==1){const raced=await getOwnerLifecycleOperation(env,key);if(raced?.operation_hash!==fingerprint)throw conflict('OWNER_LIFECYCLE_IDEMPOTENCY_CONFLICT','This idempotency key was already used for a different command.');if(raced?.status==='COMPLETED')return {...raced.result,reused:true,idempotencyKey:key};throw conflict('OWNER_LIFECYCLE_RECOVERY_REQUIRED',`The prior command is ${raced?.status||'UNKNOWN'}. Inspect its operation record and canonical resource before retrying.`);}
 try{
  const result=await executeOwnerLifecycleCommandOnce(env,actor,{...input,idempotencyKey:key},requestId);
  await env.DB.prepare(`UPDATE platform_owner_lifecycle_operations SET status='COMPLETED',result_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=? AND status='IN_PROGRESS'`).bind(JSON.stringify(result),key).run();
  return {...result,idempotencyKey:key};
 }catch(error){
  const status=error?.code==='OWNER_LIFECYCLE_READBACK_FAILED'||Number(error?.status||0)>=500?'RECOVERY_REQUIRED':'FAILED';
  await env.DB.prepare(`UPDATE platform_owner_lifecycle_operations SET status=?,error_code=?,error_message=?,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=? AND status='IN_PROGRESS'`).bind(status,String(error?.code||'OWNER_LIFECYCLE_FAILED'),String(error?.message||'Owner lifecycle command failed').slice(0,500),key).run().catch(()=>{});
  throw error;
 }
}
