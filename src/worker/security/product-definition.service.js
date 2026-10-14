import {RELEASE_VERSION} from '../core/release.js';
import {getCountryBlueprint} from './country-product-blueprint.service.js';
import {listPlatformConfigurations} from './platform-configuration.service.js';

export const PRODUCT_DEFINITION_VERSION=RELEASE_VERSION;
export const PRODUCT_COMPONENT_TYPES=Object.freeze(['identity','vocabulary','content','capability','workflow','role','experience','policy','integration','dependency']);
const ALLOWED_STATUS=new Set(['draft','validated','blocked']);
const sha256=async value=>{const data=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');};
const parse=v=>{try{return JSON.parse(v||'{}')}catch{return {}}};
const safeKey=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9._:-]+/g,'-').slice(0,160);

export const PRODUCT_DEFINITION_SCHEMAS=Object.freeze({
 identity:{required:['productKey','name'],properties:{productKey:'string',name:'string',description:'string'}},
 vocabulary:{required:['key','label'],properties:{key:'string',label:'string',description:'string',translations:'object'}},
 content:{required:['key'],properties:{key:'string',title:'string',body:'string',languageCode:'string',category:'string'}},
 capability:{required:['key'],properties:{key:'string',enabled:'boolean',configuration:'object'}},
 workflow:{required:['key'],properties:{key:'string',states:'array',transitions:'array'}},
 role:{required:['key'],properties:{key:'string',label:'string',responsibilities:'array'}},
 experience:{required:['key'],properties:{key:'string',type:'string',sections:'array',presentation:'object'}},
 policy:{required:['key'],properties:{key:'string',parameters:'object'}},
 integration:{required:['key'],properties:{key:'string',enabled:'boolean',configuration:'object'}},
 dependency:{required:['key'],properties:{key:'string',type:'string',target:'string',required:'boolean'}}
});

function validateComponent(type,key,payload){
  if(!PRODUCT_COMPONENT_TYPES.includes(type))throw Object.assign(new Error('PRODUCT_COMPONENT_TYPE_NOT_SUPPORTED'),{status:400,code:'PRODUCT_COMPONENT_TYPE_NOT_SUPPORTED'});
  const schema=PRODUCT_DEFINITION_SCHEMAS[type];
  const value=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  for(const req of schema.required){if(type==='identity'&&req==='productKey'){if(!String(value.productKey||'').trim())throw Object.assign(new Error('PRODUCT_IDENTITY_PRODUCT_KEY_REQUIRED'),{status:400,code:'PRODUCT_IDENTITY_PRODUCT_KEY_REQUIRED'});}else if(!String(value[req]??'').trim()&&!(Array.isArray(value[req])&&value[req].length)){throw Object.assign(new Error(`PRODUCT_COMPONENT_REQUIRED_${req.toUpperCase()}`),{status:400,code:`PRODUCT_COMPONENT_REQUIRED_${req.toUpperCase()}`});}}
  return {key:safeKey(key||value.key||value.productKey),payload:value};
}

export async function listProductDefinitions(env,{countryCode='',sectorCode='',limit=100}={}){
  const rows=(await env.DB.prepare(`SELECT id,product_key,name,description,country_code,sector_code,status,base_definition_id,launch_id,definition_version,compiled_version,compiled_hash,compiled_at,created_by_type,created_by_id,created_at,updated_at FROM platform_product_definitions WHERE (?='' OR country_code=?) AND (?='' OR sector_code=?) ORDER BY updated_at DESC,id DESC LIMIT ?`).bind(String(countryCode||''),String(countryCode||''),String(sectorCode||''),String(sectorCode||''),Math.min(250,Math.max(1,Number(limit||100)))).all()).results||[];
  return rows.map(normalizeDefinition);
}
function normalizeDefinition(r){return {...r,id:Number(r.id),base_definition_id:r.base_definition_id==null?null:Number(r.base_definition_id),launch_id:r.launch_id==null?null:Number(r.launch_id),definition_version:Number(r.definition_version||1),compiled_version:r.compiled_version==null?null:Number(r.compiled_version)}}
export async function getProductDefinition(env,id,{withComponents=true}={}){
  const row=await env.DB.prepare(`SELECT * FROM platform_product_definitions WHERE id=? LIMIT 1`).bind(Number(id)).first();
  if(!row)throw Object.assign(new Error('PRODUCT_DEFINITION_NOT_FOUND'),{status:404,code:'PRODUCT_DEFINITION_NOT_FOUND'});
  const definition=normalizeDefinition(row);
  if(withComponents){const rows=(await env.DB.prepare(`SELECT * FROM platform_product_definition_components WHERE definition_id=? AND version=(SELECT MAX(c2.version) FROM platform_product_definition_components c2 WHERE c2.definition_id=platform_product_definition_components.definition_id AND c2.component_type=platform_product_definition_components.component_type AND c2.component_key=platform_product_definition_components.component_key) ORDER BY component_type,component_key`).bind(Number(id)).all()).results||[];definition.components=rows.map(x=>({...x,id:Number(x.id),definition_id:Number(x.definition_id),version:Number(x.version),payload:parse(x.payload_json)}));}
  return definition;
}
export async function createProductDefinition(env,actor,{productKey,name,description='',countryCode,sectorCode,launchId=null,baseDefinitionId=null,dataEntryId=null}={}){
  const code=String(countryCode||'').trim().toUpperCase();const sector=safeKey(sectorCode||'general');const key=safeKey(productKey||`${code}-${sector}`);
  if(!code||!key||!String(name||'').trim())throw Object.assign(new Error('PRODUCT_DEFINITION_IDENTITY_REQUIRED'),{status:400,code:'PRODUCT_DEFINITION_IDENTITY_REQUIRED'});
  if(dataEntryId){const fenced=await env.DB.prepare(`SELECT id FROM platform_product_definitions WHERE data_entry_id=? LIMIT 1`).bind(String(dataEntryId)).first();if(fenced)return getProductDefinition(env,fenced.id);}
  const existing=await env.DB.prepare(`SELECT id FROM platform_product_definitions WHERE product_key=? ORDER BY definition_version DESC LIMIT 1`).bind(key).first();
  const version=existing?Number((await env.DB.prepare(`SELECT MAX(definition_version) v FROM platform_product_definitions WHERE product_key=?`).bind(key).first())?.v||0)+1:1;
  const r=await env.DB.prepare(`INSERT INTO platform_product_definitions(product_key,name,description,country_code,sector_code,status,base_definition_id,launch_id,definition_version,created_by_type,created_by_id,data_entry_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(key,String(name).trim(),String(description||''),code,sector,'draft',baseDefinitionId?Number(baseDefinitionId):null,launchId?Number(launchId):null,version,String(actor?.type||'platform_super_administrator'),actor?.id==null?null:String(actor.id),dataEntryId==null?null:String(dataEntryId)).run();
  return getProductDefinition(env,r.meta.last_row_id);
}
export async function updateProductDefinitionDraft(env,actor,definitionId,{name,description,sectorCode}={}){
 const row=await env.DB.prepare(`SELECT * FROM platform_product_definitions WHERE id=? LIMIT 1`).bind(Number(definitionId)).first();
 if(!row)throw Object.assign(new Error('PRODUCT_DEFINITION_NOT_FOUND'),{status:404,code:'PRODUCT_DEFINITION_NOT_FOUND'});
 if(String(row.status)!=='draft')throw Object.assign(new Error('Only draft product definitions can be edited'),{status:409,code:'PRODUCT_DEFINITION_NOT_EDITABLE'});
 const fields=[],args=[];
 if(name!==undefined){const value=String(name||'').trim().slice(0,180);if(!value)throw Object.assign(new Error('PRODUCT_DEFINITION_NAME_REQUIRED'),{status:400,code:'PRODUCT_DEFINITION_NAME_REQUIRED'});fields.push('name=?');args.push(value);}
 if(description!==undefined){fields.push('description=?');args.push(String(description||'').slice(0,4000));}
 if(sectorCode!==undefined){const value=safeKey(sectorCode||'general');fields.push('sector_code=?');args.push(value);}
 if(fields.length){fields.push('updated_at=CURRENT_TIMESTAMP');await env.DB.prepare(`UPDATE platform_product_definitions SET ${fields.join(',')} WHERE id=? AND status='draft'`).bind(...args,Number(definitionId)).run();}
 return getProductDefinition(env,definitionId);
}

export async function upsertProductComponent(env,actor,definitionId,{componentType,componentKey,payload,status='draft',dataEntryId=null}={}){
  const checked=validateComponent(componentType,componentKey,payload);const st=ALLOWED_STATUS.has(status)?status:'draft';if(dataEntryId){const fenced=await env.DB.prepare(`SELECT * FROM platform_product_definition_components WHERE data_entry_id=? LIMIT 1`).bind(String(dataEntryId)).first();if(fenced)return getProductDefinition(env,definitionId);}const current=await env.DB.prepare(`SELECT MAX(version) v FROM platform_product_definition_components WHERE definition_id=? AND component_type=? AND component_key=?`).bind(Number(definitionId),componentType,checked.key).first();const version=Number(current?.v||0)+1;
  await env.DB.prepare(`UPDATE platform_product_definition_components SET status='blocked',updated_at=CURRENT_TIMESTAMP WHERE definition_id=? AND component_type=? AND component_key=? AND status!='blocked'`).bind(Number(definitionId),componentType,checked.key).run();
  await env.DB.prepare(`INSERT INTO platform_product_definition_components(definition_id,component_type,component_key,source_type,payload_json,status,version,created_by_type,created_by_id,data_entry_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(Number(definitionId),componentType,checked.key,'inline',JSON.stringify(checked.payload),st,version,String(actor?.type||'platform_super_administrator'),actor?.id==null?null:String(actor.id),dataEntryId==null?null:String(dataEntryId)).run();
  await env.DB.prepare(`UPDATE platform_product_definitions SET updated_at=CURRENT_TIMESTAMP,status='draft' WHERE id=?`).bind(Number(definitionId)).run();
  return getProductDefinition(env,definitionId);
}
async function getLaunchProjectionById(env,id){
  const row=await env.DB.prepare(`SELECT id,country_code,version,status,active,country_blueprint_id,manifest_json,eligibility_json,readiness_json FROM country_product_launches WHERE id=? LIMIT 1`).bind(Number(id)).first();
  if(!row)return null;
  const parseJson=v=>{try{return JSON.parse(v||'{}')}catch{return {}}};
  return {...row,id:Number(row.id),active:Number(row.active)===1,version:String(row.version||''),manifest:parseJson(row.manifest_json),eligibility:parseJson(row.eligibility_json),readiness:parseJson(row.readiness_json)};
}
async function baseContext(env,definition){
  const [blueprint,launch,configurations]=await Promise.all([
    definition.country_blueprint_id?getCountryBlueprint(env,Number(definition.country_blueprint_id)):Promise.resolve(null),
    definition.launch_id?getLaunchProjectionById(env,Number(definition.launch_id)):Promise.resolve(null),
    listPlatformConfigurations(env)
  ]);
  const design={};
  for(const [domain,key] of [['capabilities','catalog'],['roles','action_policy'],['rendering','product_experience'],['guidance','user_journey'],['policy','default'],['mission_rules','intake']]){
    const row=(configurations||[]).find(x=>x.domain_code===domain&&x.config_key===key&&Number(x.active)===1);
    design[`${domain}:${key}`]=row||null;
  }
  const countryBlueprint=blueprint?{id:blueprint.id,name:blueprint.name,status:blueprint.status,defaultLanguageCode:blueprint.default_language_code,languages:blueprint.languages||[],sectors:blueprint.sectors||[],contents:blueprint.contents||[],legalRequirements:blueprint.legalRequirements||[]}:null;
  return {country:{code:definition.country_code,blueprint:countryBlueprint},launch,design};
}
export async function compileProductDefinition(env,id){
  const definition=await getProductDefinition(env,id);const context=await baseContext(env,definition);const components={};for(const c of definition.components||[])(components[c.component_type]??=[]).push({key:c.component_key,...c.payload});
  const manifest={manifestVersion:PRODUCT_DEFINITION_VERSION,definition:{id:definition.id,key:definition.product_key,name:definition.name,version:definition.definition_version},composition:{countryCode:definition.country_code,sectorCode:definition.sector_code,baseDefinitionId:definition.base_definition_id||null},foundation:context.country,launch:context.launch?{id:context.launch.id,version:context.launch.version,status:context.launch.status,manifest:context.launch.manifest}:null,design:context.design,components};
  const canonical=JSON.stringify(manifest);const hash=await sha256(canonical);const result=await env.DB.prepare(`INSERT INTO platform_product_definition_manifests(definition_id,definition_version,manifest_json,manifest_hash,status,created_by_type,created_by_id) VALUES(?,?,?,?,?,?,?)`).bind(definition.id,definition.definition_version,canonical,hash,'compiled','system','product-compiler').run();await env.DB.prepare(`UPDATE platform_product_definitions SET status='compiled',compiled_version=?,compiled_hash=?,compiled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(definition.definition_version,hash,definition.id).run();return {definition:await getProductDefinition(env,id),manifest,manifestHash:hash,manifestId:Number(result.meta.last_row_id)};
}
export async function importProductComponents(env,actor,id,items=[]){if(!Array.isArray(items)||items.length>50)throw Object.assign(new Error('PRODUCT_IMPORT_LIMIT'),{status:400,code:'PRODUCT_IMPORT_LIMIT'});for(const item of items)await upsertProductComponent(env,actor,id,item);return getProductDefinition(env,id);}
