import {setProductCountryActive,getProductCountry} from './product-country-catalog.service.js';
import {getCountryBlueprint,prepareCountryBlueprintForLaunch} from './country-product-blueprint.service.js';
import {getProductDefinition,compileProductDefinition} from './product-definition.service.js';
import {validateConfigurationDraft,authorizeConfiguration,activateConfiguration,rollbackConfiguration} from './platform-configuration.service.js';
import {auditAdminControl} from './admin-control-audit.service.js';

const conflict=(code,message)=>Object.assign(new Error(message||code),{status:409,code});
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const stamp=row=>String(row?.updated_at||'');

// The registry is deliberately explicit: an operation is listed only when an owner service exists.
export function listOwnerLifecycleAdapters(){
 return [
  {resourceType:'sector',ownerAuthority:'sectorCatalog',adapter:'sector-catalog.lifecycle.v1',status:'PARTIAL',supportedCommands:['inspect'],unsupportedCommands:['activate','deactivate','suspend','resume','retire'],reason:'Sector catalog dependency-aware lifecycle transitions are not yet implemented.'},
  {resourceType:'product_country',ownerAuthority:'productCountryCatalog',adapter:'product-country.lifecycle.v1',status:'OPERATIONAL',supportedCommands:['activate','deactivate'],unsupportedCommands:['suspend','resume','retire'],guards:['expectedUpdatedAt','atomic-active-launch-dependency-check','canonical-readback']},
  {resourceType:'country_blueprint',ownerAuthority:'countryProductBlueprintAuthority',adapter:'country-blueprint.lifecycle.v1',status:'OPERATIONAL_WITH_LIMITS',supportedCommands:['inspect'],unsupportedCommands:['prepare_for_launch','activate','suspend','resume','retire'],reason:'Blueprint preparation still needs an atomic revision-bound transition contract.'},
  {resourceType:'product_definition',ownerAuthority:'Product Factory',adapter:'product-definition.lifecycle.v1',status:'OPERATIONAL_WITH_LIMITS',supportedCommands:['inspect'],unsupportedCommands:['compile','activate','suspend','resume','retire'],reason:'Product Factory compilation needs revision reservation and manifest commit reconciliation before it can be exposed as a lifecycle command.'},
  {resourceType:'policy',ownerAuthority:'policyCatalog',adapter:'policy.lifecycle.v1',status:'PARTIAL',supportedCommands:['inspect'],unsupportedCommands:['activate','deactivate','suspend','resume','retire'],reason:'Policy dependency, approval and supersession contracts are not yet implemented.'},
  {resourceType:'configuration',ownerAuthority:'platformConfigurationAuthority',adapter:'configuration.lifecycle.v1',status:'OPERATIONAL',supportedCommands:['validate','authorize','activate','rollback'],unsupportedCommands:['suspend','resume','retire'],guards:['owner-validation','impact-preview','approval','expected-active-version','versioned-rollback']}
 ];
}

export async function executeOwnerLifecycleCommand(env,actor,input={},requestId=''){
 const type=String(input.resourceType||'').trim(),command=String(input.command||'').trim().toLowerCase(),id=input.resourceId;
 const adapter=listOwnerLifecycleAdapters().find(x=>x.resourceType===type);
 if(!adapter||!adapter.supportedCommands.includes(command))throw Object.assign(new Error('OWNER_LIFECYCLE_COMMAND_NOT_SUPPORTED'),{status:422,code:'OWNER_LIFECYCLE_COMMAND_NOT_SUPPORTED',details:{resourceType:type,command,supportedCommands:adapter?.supportedCommands||[]}});
 let result,resourceId=String(id??'');
 if(type==='product_country'){
  const current=await getProductCountry(env,resourceId);if(!current)throw Object.assign(new Error('PRODUCT_COUNTRY_NOT_FOUND'),{status:404,code:'PRODUCT_COUNTRY_NOT_FOUND'});
  if(!input.expectedUpdatedAt||stamp(current)!==String(input.expectedUpdatedAt))throw conflict('OWNER_LIFECYCLE_STALE_RESOURCE','Product Country changed; refresh before retrying.');
  result=await setProductCountryActive(env,resourceId,command==='activate',{expectedUpdatedAt:input.expectedUpdatedAt});
  const after=await getProductCountry(env,resourceId);if(Number(after?.active)!==(command==='activate'?1:0))throw Object.assign(new Error('OWNER_LIFECYCLE_READBACK_FAILED'),{status:503,code:'OWNER_LIFECYCLE_READBACK_FAILED'});
 }
 if(type==='configuration'){
  const configId=number(id);const current=await env.DB.prepare(`SELECT * FROM platform_configuration_versions WHERE id=? LIMIT 1`).bind(configId).first();if(!current)throw Object.assign(new Error('PLATFORM_CONFIGURATION_NOT_FOUND'),{status:404,code:'PLATFORM_CONFIGURATION_NOT_FOUND'});
  if(!input.expectedUpdatedAt||stamp(current)!==String(input.expectedUpdatedAt))throw conflict('OWNER_LIFECYCLE_STALE_RESOURCE','Configuration changed; refresh before retrying.');
  if(command==='validate')result=await validateConfigurationDraft(env,actor,configId,requestId);
  else if(command==='authorize')result=await authorizeConfiguration(env,actor,configId,requestId);
  else if(command==='activate')result=await activateConfiguration(env,actor,configId,requestId,{expectedActiveConfigId:input.expectedActiveConfigId??0,expectedActiveVersion:input.expectedActiveVersion??''});
  else result=await rollbackConfiguration(env,actor,configId,requestId);
  if(!result)throw Object.assign(new Error('OWNER_LIFECYCLE_READBACK_FAILED'),{status:503,code:'OWNER_LIFECYCLE_READBACK_FAILED'});
 }
 await auditAdminControl(env,{actor,action:`platform.owner_lifecycle.${type}.${command}`,resourceType:type,resourceId,requestId,metadata:{adapter:adapter.adapter,command,outcome:'OWNER_RESULT_READ_BACK'}});
 return {success:true,adapter:adapter.adapter,resourceType:type,resourceId,command,result,verified:true,observedAt:new Date().toISOString()};
}
