import {RELEASE_VERSION} from '../core/release.js';
import {recordDataLifecycleEvent,ensureDataLifecycleEvent} from './platform-data-lifecycle.service.js';
import { authorityUnavailable } from '../core/canonical-db.js';
import {beginGovernedIntake,recordGovernedIntakeItem,finishGovernedIntake,getGovernedIntake,sha256Intake,linkGovernedIntakeEntry} from './governed-intake.service.js';
/**
 * ON Mission 10.38.29 — Governed Data Entry Gate.
 *
 * Boundary only: it standardizes, validates, classifies and records provenance
 * before handing creation to an existing canonical authority. It is not a
 * second business authority and never executes arbitrary code or SQL.
 */
import {createProductDefinition} from './product-definition.service.js';
import {createCountryBlueprint} from './country-product-blueprint.service.js';
import {createCountryLaunchDraft} from './country-product-launch.service.js';
import {createExpansionCase} from './product-expansion.service.js';
import {createConfigurationDraft} from './platform-configuration.service.js';
import {REUSABLE_DATA_DEFINITIONS, listReusableDataDefinitions, createReusableData} from './platform-reusable-data.service.js';

export const PLATFORM_DATA_ENTRY_VERSION=RELEASE_VERSION;
export const DATA_ENTRY_SCHEMA_VERSION='1.0';
export const DATA_ENTRY_SOURCE_TYPES=Object.freeze(['super_admin','tenant','user','system','import','integration','external_source']);
export const DATA_ENTRY_PURPOSES=Object.freeze(['production','configuration','testing','migration','import','development','demonstration','temporary']);
export const DATA_ENTRY_CLASSIFICATIONS=Object.freeze(['CANONICAL','REFERENCE','CONFIGURATION','OPERATIONAL','USER_GENERATED','IMPORTED','SAMPLE','TEST','DRAFT','SENSITIVE']);
export const DATA_ENTRY_STATUSES=Object.freeze(['preview','validated','committed','rejected','cancelled']);
const RISK_LEVELS=Object.freeze({low:1,medium:2,high:3,critical:4});
const fail=(message,status=400,code=message)=>{const e=new Error(message);e.status=status;e.code=code;return e};
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const json=(v,f={})=>{try{return JSON.parse(String(v??''))??f}catch{return f}};
const normalizeKey=v=>clean(v,160).toLowerCase().replace(/[^a-z0-9._:-]+/g,'-');
const now=()=>new Date().toISOString();

const ENTRY_DEFINITIONS=Object.freeze({
  product_component:{label:'Product Component',risk:'low',canonicalResourceType:'product_component',purposeDefaults:['configuration','production'],required:['definitionId','componentType','componentKey'],schema:{definitionId:'number',componentType:'string',componentKey:'string',payload:'object',status:'string'}},
  product_definition:{label:'Product Definition',risk:'medium',canonicalResourceType:'product_definition',purposeDefaults:['configuration','production'],required:['productKey','name','countryCode'],countryField:'countryCode',schema:{productKey:'string',name:'string',description:'string',countryCode:'string',sectorCode:'string',launchId:'number',baseDefinitionId:'number'}},
  country_blueprint:{label:'Country Product Blueprint',risk:'high',canonicalResourceType:'country_blueprint',purposeDefaults:['configuration','production'],required:['countryCode','name'],countryField:'countryCode',schema:{countryCode:'string',name:'string',defaultLanguageCode:'string',notes:'string'}},
  country_product_launch:{label:'Country Product Launch Draft',risk:'high',canonicalResourceType:'country_product_launch',purposeDefaults:['production','configuration'],required:['countryCode'],countryField:'countryCode',schema:{countryCode:'string',blueprintId:'number',manifest:'object',reason:'string'}},
  country_product_launch_update:{label:'Country Product Launch Draft Update',risk:'high',canonicalResourceType:'country_product_launch',purposeDefaults:['configuration','production'],required:['launchId','countryCode'],countryField:'countryCode',schema:{launchId:'number',countryCode:'string',blueprintId:'number',manifest:'object',reason:'string'}},
  expansion_case:{label:'Product Expansion Case',risk:'high',canonicalResourceType:'expansion_case',purposeDefaults:['production','configuration'],required:['targetCountryCode'],countryField:'targetCountryCode',schema:{sourceDefinitionId:'number',sourceLaunchId:'number',targetCountryCode:'string',targetSectorCode:'string',expansionType:'string',notes:'string'}},
  platform_configuration_draft:{label:'Platform Configuration Draft',risk:'medium',canonicalResourceType:'platform_configuration',purposeDefaults:['configuration'],required:['domainCode','configKey'],schema:{configurationId:'number',domainCode:'string',configKey:'string',version:'string',payload:'object',reason:'string'}}
});

const REUSABLE_ENTRY_DEFINITIONS=Object.freeze(Object.fromEntries(Object.entries(REUSABLE_DATA_DEFINITIONS).map(([entryType,d])=>[entryType,{label:d.label,risk:d.risk==='high'?'high':d.risk==='medium'?'medium':'low',canonicalResourceType:entryType,purposeDefaults:d.risk==='high'?['configuration','production']:['configuration','production','testing'],required:(d.fields||[]).filter(x=>!['description','body','payload','configuration','rule','scope','regionCode','symbol','priceMinor','billingInterval','defaultSubscriptionClass','requiresReview','status','policyVersion','withdrawalEffect','requireConsent'].includes(x) && !(x==='countryCode' && !['country_blueprint','product_country'].includes(entryType))),schema:Object.fromEntries((d.fields||[]).map(x=>[x,['definitionId','priceMinor'].includes(x)?'number':['payload','configuration','rule'].includes(x)?'object':'string'])),countryField:['countryCode'].includes((d.fields||[])[0])?'countryCode':undefined}])));

function entryDefinition(type){return ENTRY_DEFINITIONS[type]||REUSABLE_ENTRY_DEFINITIONS[type]||null;}

function ensureObject(value,name='payload'){if(!value||typeof value!=='object'||Array.isArray(value))throw fail(`DATA_ENTRY_${name.toUpperCase()}_OBJECT_REQUIRED`,400,`DATA_ENTRY_${name.toUpperCase()}_OBJECT_REQUIRED`);return value;}
function hasValue(v){return v!==undefined&&v!==null&&String(v).trim()!=='';}
function forbiddenSecrets(value,path='payload'){
  if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){
    if(/(^|_)(password|secret|token|private[_-]?key|api[_-]?key)(_|$)/i.test(k))throw fail(`DATA_ENTRY_SECRET_FIELD_FORBIDDEN:${path}.${k}`,400,'DATA_ENTRY_SECRET_FIELD_FORBIDDEN');
    forbiddenSecrets(v,`${path}.${k}`);
  }
}
function normalizePayload(entryType,payload){
  const def=entryDefinition(entryType);
  const input=ensureObject(payload);
  const out={};
  for(const [key,type] of Object.entries(def.schema)){if(input[key]===undefined)continue;const v=input[key];if(type==='object'){if(!v||typeof v!=='object'||Array.isArray(v))throw fail(`DATA_ENTRY_${key.toUpperCase()}_OBJECT_REQUIRED`,400,`DATA_ENTRY_${key.toUpperCase()}_OBJECT_REQUIRED`);out[key]=v;}else if(type==='number'){if(v===''||v===null||!Number.isFinite(Number(v)))throw fail(`DATA_ENTRY_${key.toUpperCase()}_NUMBER_REQUIRED`,400,`DATA_ENTRY_${key.toUpperCase()}_NUMBER_REQUIRED`);out[key]=Number(v);}else out[key]=clean(v,type==='string'?type.length?4000:4000:4000);}
  return out;
}
async function one(env,sql,...args){try{return await env.DB.prepare(sql).bind(...args).first()}catch(error){throw Object.assign(new Error('Data Entry authority unavailable'),{status:503,code:'AUTHORITY_UNAVAILABLE',cause:error})}}
async function all(env,sql,...args){try{return (await env.DB.prepare(sql).bind(...args).all()).results||[]}catch(error){throw Object.assign(new Error('Data Entry authority unavailable'),{status:503,code:'AUTHORITY_UNAVAILABLE',cause:error})}}

function classify({payload,purpose,sourceType,requestedClassification}){
  if(requestedClassification){const c=clean(requestedClassification,40).toUpperCase();if(!DATA_ENTRY_CLASSIFICATIONS.includes(c))throw fail('DATA_ENTRY_CLASSIFICATION_INVALID',400,'DATA_ENTRY_CLASSIFICATION_INVALID');return c;}
  if(['testing','development','demonstration','temporary'].includes(purpose))return sourceType==='import'?'IMPORTED':'TEST';
  if(sourceType==='import'||sourceType==='integration'||sourceType==='external_source')return 'IMPORTED';
  if(payload?.status==='draft')return 'DRAFT';
  return 'CONFIGURATION';
}

function validatePayload(entryType,payload){
  const def=entryDefinition(entryType);if(!def)throw fail('DATA_ENTRY_TYPE_NOT_SUPPORTED',422,'DATA_ENTRY_TYPE_NOT_SUPPORTED');
  for(const key of def.required){if(!hasValue(payload[key]))throw fail(`DATA_ENTRY_REQUIRED_${key.toUpperCase()}`,400,`DATA_ENTRY_REQUIRED_${key.toUpperCase()}`);}
  if(entryType==='product_definition'){
    payload.productKey=normalizeKey(payload.productKey);
    payload.countryCode=clean(payload.countryCode,2).toUpperCase();
    payload.sectorCode=normalizeKey(payload.sectorCode||'general');
    if(!payload.productKey||!payload.name)throw fail('DATA_ENTRY_PRODUCT_DEFINITION_IDENTITY_INVALID',400,'DATA_ENTRY_PRODUCT_DEFINITION_IDENTITY_INVALID');
  }
  if(entryType==='country_blueprint')payload.countryCode=clean(payload.countryCode,2).toUpperCase();
  if(entryType==='country_product_launch')payload.countryCode=clean(payload.countryCode,2).toUpperCase();
  if(entryType==='expansion_case'){
    payload.targetCountryCode=clean(payload.targetCountryCode,2).toUpperCase();
    payload.targetSectorCode=normalizeKey(payload.targetSectorCode||'general');
    if(payload.sourceDefinitionId!=null&&(!Number.isSafeInteger(Number(payload.sourceDefinitionId))||Number(payload.sourceDefinitionId)<=0))throw fail('DATA_ENTRY_SOURCE_DEFINITION_INVALID',400,'DATA_ENTRY_SOURCE_DEFINITION_INVALID');
  }
  if(entryType==='product_component'){if(!payload.payload||typeof payload.payload!=='object'||Array.isArray(payload.payload))throw fail('DATA_ENTRY_COMPONENT_PAYLOAD_REQUIRED',400,'DATA_ENTRY_COMPONENT_PAYLOAD_REQUIRED');payload.componentType=normalizeKey(payload.componentType);payload.componentKey=normalizeKey(payload.componentKey);if(!payload.componentType||!payload.componentKey)throw fail('DATA_ENTRY_COMPONENT_IDENTITY_INVALID',400,'DATA_ENTRY_COMPONENT_IDENTITY_INVALID');}
  if(entryType==='platform_configuration_draft'){
    payload.domainCode=normalizeKey(payload.domainCode);payload.configKey=normalizeKey(payload.configKey);
    if(!payload.domainCode||!payload.configKey)throw fail('DATA_ENTRY_CONFIGURATION_IDENTITY_INVALID',400,'DATA_ENTRY_CONFIGURATION_IDENTITY_INVALID');
  }
  return payload;
}

async function dependencyCheck(env,entryType,payload){
  const result={checked:[],blockers:[],warnings:[],dependencies:[]};
  if(REUSABLE_ENTRY_DEFINITIONS[entryType]){
    if(entryType!=='product_country' && payload.countryCode){const c=await one(env,'SELECT code,name,active FROM platform_product_country_catalog WHERE code=? LIMIT 1',String(payload.countryCode).toUpperCase());result.checked.push('platform_product_country_catalog');if(!c)result.blockers.push({code:'PRODUCT_COUNTRY_NOT_FOUND',message:`Product Country ${payload.countryCode} does not exist.`});else if(Number(c.active)!==1)result.blockers.push({code:'PRODUCT_COUNTRY_INACTIVE',message:`Product Country ${payload.countryCode} is inactive.`});else result.dependencies.push({type:'product_country',id:c.code,name:c.name});}
    if(entryType==='storage'){const p=await one(env,'SELECT code,name,active FROM external_provider_registry WHERE code=? LIMIT 1',String(payload.providerCode||''));result.checked.push('external_provider_registry');if(!p)result.blockers.push({code:'PROVIDER_NOT_FOUND',message:'Selected provider does not exist.'});else if(Number(p.active)!==1)result.blockers.push({code:'PROVIDER_INACTIVE',message:'Selected provider is inactive.'});}
    if(entryType==='responsibility'){const r=await one(env,'SELECT role_code,label FROM organization_role_catalog WHERE role_code=? AND active=1 LIMIT 1',String(payload.roleCode||''));result.checked.push('organization_role_catalog');if(!r)result.blockers.push({code:'ROLE_NOT_FOUND',message:'Selected role does not exist.'});else result.dependencies.push({type:'role',id:r.role_code,name:r.label});}
    if(entryType==='country_blueprint'&&payload.defaultLanguageCode){const l=await one(env,'SELECT code,name,active FROM platform_reusable_languages WHERE code=? LIMIT 1',String(payload.defaultLanguageCode).toLowerCase());result.checked.push('platform_reusable_languages');if(!l)result.blockers.push({code:'LANGUAGE_NOT_FOUND',message:`Language ${payload.defaultLanguageCode} does not exist.`});else if(Number(l.active)!==1)result.blockers.push({code:'LANGUAGE_INACTIVE',message:`Language ${payload.defaultLanguageCode} is inactive.`});else result.dependencies.push({type:'language',id:l.code,name:l.name});}
    if(['page','guidance'].includes(entryType)&&payload.languageCode){const l=await one(env,'SELECT code,name,active FROM platform_reusable_languages WHERE code=? LIMIT 1',String(payload.languageCode).toLowerCase());result.checked.push('platform_reusable_languages');if(!l)result.blockers.push({code:'LANGUAGE_NOT_FOUND',message:`Language ${payload.languageCode} does not exist.`});else if(Number(l.active)!==1)result.blockers.push({code:'LANGUAGE_INACTIVE',message:`Language ${payload.languageCode} is inactive.`});else result.dependencies.push({type:'language',id:l.code,name:l.name});}
    if(['pricing','plan'].includes(entryType)&&payload.currency){const c=await one(env,'SELECT code,name,active FROM platform_reusable_currencies WHERE code=? LIMIT 1',String(payload.currency).toUpperCase());result.checked.push('platform_reusable_currencies');if(!c)result.blockers.push({code:'CURRENCY_NOT_FOUND',message:`Currency ${payload.currency} does not exist.`});else if(Number(c.active)!==1)result.blockers.push({code:'CURRENCY_INACTIVE',message:`Currency ${payload.currency} is inactive.`});else result.dependencies.push({type:'currency',id:c.code,name:c.name});}
    if(entryType==='component'){const d=await one(env,'SELECT id,product_key,status FROM platform_product_definitions WHERE id=? LIMIT 1',Number(payload.definitionId));result.checked.push('platform_product_definitions');if(!d)result.blockers.push({code:'DEFINITION_NOT_FOUND',message:'Target product definition does not exist.'});else result.dependencies.push({type:'product_definition',id:Number(d.id),productKey:d.product_key,status:d.status});}
    if(entryType==='configuration'&&payload.configurationId){const c=await one(env,'SELECT id,domain_code,config_key,status,active FROM platform_configuration_versions WHERE id=? LIMIT 1',Number(payload.configurationId));result.checked.push('platform_configuration_versions');if(!c)result.blockers.push({code:'CONFIGURATION_NOT_FOUND',message:'Referenced configuration does not exist.'});else if(c.domain_code!==payload.domainCode||c.config_key!==payload.configKey)result.blockers.push({code:'CONFIGURATION_SCOPE_MISMATCH',message:'Referenced configuration does not match the submitted domain and key.'});else result.dependencies.push({type:'platform_configuration',id:Number(c.id),status:c.status,active:Number(c.active)===1});}
    return result;
  }
  const countryCode=payload.countryCode||payload.targetCountryCode;
  if(countryCode){const productScoped=['country_blueprint','country_product_launch','country_product_launch_update','product_definition'].includes(entryType);const table=productScoped?'platform_product_country_catalog':'country_catalog';const c=await one(env,`SELECT code,name,active FROM ${table} WHERE code=? LIMIT 1`,String(countryCode).toUpperCase());result.checked.push(table);if(!c)result.blockers.push({code:'COUNTRY_NOT_FOUND',message:`Country ${countryCode} does not exist.`});else if(Number(c.active)!==1)result.blockers.push({code:'COUNTRY_INACTIVE',message:`Country ${countryCode} is inactive.`});else result.dependencies.push({type:'country',id:c.code,name:c.name});}
  if(entryType==='country_product_launch_update'){const l=await one(env,'SELECT id,country_code,status,active FROM country_product_launches WHERE id=? LIMIT 1',Number(payload.launchId));result.checked.push('country_product_launches');if(!l)result.blockers.push({code:'LAUNCH_NOT_FOUND',message:'Referenced product launch does not exist.'});else if(String(l.country_code)!==String(payload.countryCode))result.blockers.push({code:'LAUNCH_COUNTRY_MISMATCH',message:'Referenced launch belongs to another country.'});else if(l.status!=='draft'||Number(l.active)!==0)result.blockers.push({code:'LAUNCH_NOT_EDITABLE',message:'Only inactive draft launches can be edited.'});}
  if(entryType==='product_definition'&&payload.launchId){const l=await one(env,'SELECT id,country_code,status,active FROM country_product_launches WHERE id=? LIMIT 1',Number(payload.launchId));result.checked.push('country_product_launches');if(!l)result.blockers.push({code:'LAUNCH_NOT_FOUND',message:'Referenced product launch does not exist.'});else if(String(l.country_code)!==String(payload.countryCode))result.blockers.push({code:'LAUNCH_COUNTRY_MISMATCH',message:'Referenced launch belongs to another country.'});else result.dependencies.push({type:'country_product_launch',id:Number(l.id),status:l.status,active:Number(l.active)===1});}
  if(entryType==='country_product_launch'&&payload.blueprintId){const b=await one(env,'SELECT id,country_code,status FROM platform_country_product_blueprints WHERE id=? LIMIT 1',Number(payload.blueprintId));result.checked.push('platform_country_product_blueprints');if(!b)result.blockers.push({code:'BLUEPRINT_NOT_FOUND',message:'Referenced country blueprint does not exist.'});else if(String(b.country_code)!==String(payload.countryCode))result.blockers.push({code:'BLUEPRINT_COUNTRY_MISMATCH',message:'Referenced blueprint belongs to another country.'});else result.dependencies.push({type:'country_blueprint',id:Number(b.id),status:b.status});}
  if(entryType==='expansion_case'&&payload.sourceDefinitionId){const d=await one(env,'SELECT id,product_key,country_code,sector_code,status FROM platform_product_definitions WHERE id=? LIMIT 1',Number(payload.sourceDefinitionId));result.checked.push('platform_product_definitions');if(!d)result.blockers.push({code:'SOURCE_DEFINITION_NOT_FOUND',message:'Source product definition does not exist.'});else result.dependencies.push({type:'product_definition',id:Number(d.id),countryCode:d.country_code,sectorCode:d.sector_code,status:d.status});}
  if(entryType==='product_component'){const d=await one(env,'SELECT id,product_key,status FROM platform_product_definitions WHERE id=? LIMIT 1',Number(payload.definitionId));result.checked.push('platform_product_definitions');if(!d)result.blockers.push({code:'DEFINITION_NOT_FOUND',message:'Target product definition does not exist.'});else result.dependencies.push({type:'product_definition',id:Number(d.id),productKey:d.product_key,status:d.status});}
  if(entryType==='platform_configuration_draft'&&payload.configurationId){const c=await one(env,'SELECT id,domain_code,config_key,status,active FROM platform_configuration_versions WHERE id=? LIMIT 1',Number(payload.configurationId));result.checked.push('platform_configuration_versions');if(!c)result.blockers.push({code:'CONFIGURATION_NOT_FOUND',message:'Referenced configuration does not exist.'});else if(c.domain_code!==payload.domainCode||c.config_key!==payload.configKey)result.blockers.push({code:'CONFIGURATION_SCOPE_MISMATCH',message:'Referenced configuration does not match the submitted domain and key.'});else result.dependencies.push({type:'platform_configuration',id:Number(c.id),status:c.status,active:Number(c.active)===1});}
  if(entryType==='product_definition'){const d=await one(env,'SELECT id,status FROM platform_product_definitions WHERE product_key=? AND definition_version=(SELECT MAX(definition_version) FROM platform_product_definitions WHERE product_key=?) LIMIT 1',payload.productKey,payload.productKey);result.checked.push('product_definition_identity');if(d)result.warnings.push({code:'PRODUCT_KEY_EXISTS',message:'A product definition with this product key already exists; canonical creation will create a new governed version.'});}
  if(entryType==='country_blueprint'){const b=await one(env,"SELECT id,status FROM platform_country_product_blueprints WHERE country_code=? AND status IN ('draft','researching','preparing','ready') ORDER BY id DESC LIMIT 1",payload.countryCode);result.checked.push('country_blueprint_identity');if(b)result.warnings.push({code:'BLUEPRINT_EXISTS',message:'A current blueprint already exists for this country; canonical authority will reuse it rather than create an uncontrolled duplicate.'});}
  return result;
}

function policyCheck({entryType,purpose,classification,riskLevel,sourceType}){
  const def=entryDefinition(entryType);
  const allowedPurposes=def.purposeDefaults;
  const result={allowed:true,rules:[],blockers:[],requiresStepUp:RISK_LEVELS[riskLevel]>=RISK_LEVELS.high};
  if(!DATA_ENTRY_PURPOSES.includes(purpose))result.blockers.push({code:'PURPOSE_INVALID',message:'Purpose is not part of the governed purpose vocabulary.'});
  if(!allowedPurposes.includes(purpose)&&!['testing','migration','import'].includes(purpose))result.blockers.push({code:'PURPOSE_NOT_ALLOWED_FOR_ENTRY_TYPE',message:`Purpose ${purpose} is not approved for ${entryType}.`});
  if(classification==='SENSITIVE'&&sourceType==='external_source')result.blockers.push({code:'SENSITIVE_EXTERNAL_SOURCE_REVIEW',message:'Sensitive external-source entries require an existing governed import/integration flow.'});
  if(riskLevel==='critical')result.blockers.push({code:'CRITICAL_CODE_OWNED',message:'Critical security, authorization, lifecycle and custody state is code-owned and cannot be created through Data Entry.'});
  result.allowed=result.blockers.length===0;result.rules.push('classification-before-canonical-creation','purpose-before-canonical-creation','resource-specific-authority');
  return result;
}

function impactFor(entryType,payload,dependencies){
  const def=entryDefinition(entryType);
  return {entryType,canonicalResourceType:def.canonicalResourceType,countryCode:payload.countryCode||payload.targetCountryCode||null,resourceScope:payload.sectorCode||payload.targetSectorCode||null,dependencies:dependencies.dependencies||[],canonicalCreation:'Existing canonical service only',lifecycle:'Created record is immediately discoverable through Data Control and remains governed by Trash/lifecycle controls.'};
}

async function persistPreview(env,entry){
  const existing=entry.idempotencyKey?await one(env,'SELECT * FROM platform_data_entry_records WHERE idempotency_key=? LIMIT 1',entry.idempotencyKey):null;
  if(existing)return normalize(existing);
  const entryId=entry.entryId||`entry_${crypto.randomUUID()}`;
  try{await env.DB.prepare(`INSERT INTO platform_data_entry_records(entry_id,entry_type,source_type,source_id,actor_type,actor_id,tenant_scope,country_scope,payload_json,schema_version,classification,purpose,provenance_json,validation_json,policy_json,dependency_json,impact_json,risk_level,status,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(entryId,entry.entryType,entry.sourceType,entry.sourceId||null,entry.actorType,entry.actorId||null,entry.tenantScope||null,entry.countryScope||null,JSON.stringify(entry.payload),DATA_ENTRY_SCHEMA_VERSION,entry.classification,entry.purpose,JSON.stringify(entry.provenance),JSON.stringify(entry.validation),JSON.stringify(entry.policy),JSON.stringify(entry.dependencies),JSON.stringify(entry.impact),entry.riskLevel,'validated',entry.idempotencyKey||null).run();}catch(e){if(entry.idempotencyKey){const raced=await one(env,'SELECT * FROM platform_data_entry_records WHERE idempotency_key=? LIMIT 1',entry.idempotencyKey);if(raced)return normalize(raced);}throw e;}
  return getDataEntry(env,entryId);
}

export async function prepareDataEntry(env,actor,{entryType,payload,sourceType='super_admin',sourceId=null,tenantScope=null,countryScope=null,purpose='configuration',classification=null,idempotencyKey=null,entryId=null}={}){
  const type=clean(entryType,80);if(!String(idempotencyKey||'').trim())throw fail('DATA_ENTRY_IDEMPOTENCY_REQUIRED',400,'DATA_ENTRY_IDEMPOTENCY_REQUIRED');if(!entryDefinition(type))throw fail('DATA_ENTRY_TYPE_NOT_SUPPORTED',422,'DATA_ENTRY_TYPE_NOT_SUPPORTED');
  if(!DATA_ENTRY_SOURCE_TYPES.includes(sourceType))throw fail('DATA_ENTRY_SOURCE_TYPE_INVALID',400,'DATA_ENTRY_SOURCE_TYPE_INVALID');
  const normalized=validatePayload(type,normalizePayload(type,payload));forbiddenSecrets(normalized);
  const selectedClassification=classify({payload:normalized,purpose,sourceType,requestedClassification:classification});
  const def=entryDefinition(type);
  const riskLevel=def.risk;
  const validation={valid:true,schemaVersion:DATA_ENTRY_SCHEMA_VERSION,checkedAt:now(),required:diffRequired(def.required,normalized),unknownFields:Object.keys(ensureObject(payload)).filter(k=>!Object.hasOwn(def.schema,k))};
  const dependencies=await dependencyCheck(env,type,normalized);
  const policy=policyCheck({entryType:type,purpose,classification:selectedClassification,riskLevel,sourceType});
  validation.valid=validation.required.length===0&&dependencies.blockers.length===0;
  if(!validation.valid)validation.errors=[...validation.required.map(k=>({code:`REQUIRED_${k.toUpperCase()}`,message:`${k} is required.`})),...dependencies.blockers];
  const impact=impactFor(type,normalized,dependencies);
  const provenance={sourceType,sourceId,actorType:String(actor?.role||actor?.type||'platform_super_administrator'),actorId:actor?.id==null?null:String(actor.id),tenantScope,countryScope,capturedAt:now()};
  if(!validation.valid||!policy.allowed){
    const error=fail(policy.allowed?'DATA_ENTRY_VALIDATION_BLOCKED':'DATA_ENTRY_POLICY_BLOCKED',409,policy.allowed?'DATA_ENTRY_VALIDATION_BLOCKED':'DATA_ENTRY_POLICY_BLOCKED');
    error.details={entryType:type,validation,policy,dependencies,impact,riskLevel};
    throw error;
  }
  const entry=await persistPreview(env,{entryId,entryType:type,sourceType,sourceId,actorType:provenance.actorType,actorId:provenance.actorId,tenantScope,countryScope,payload:normalized,classification:selectedClassification,purpose,provenance,validation,policy,dependencies,impact,riskLevel,idempotencyKey});
  await recordDataLifecycleEvent(env,{resourceType:'data_entry',resourceId:entry.entry_id,stage:'DRAFT',action:'create',reasonCode:'data_entry_created',reason:'Governed Data Entry draft created.',sourceEntryId:entry.entry_id,canonicalAuthority:'platform_data_entry_records',actor,metadata:{entryType:type}}).catch(error=>{throw authorityUnavailable('platform_data_entry_lifecycle',error);});
  return entry;
}
function diffRequired(required,payload){return required.filter(k=>!hasValue(payload[k]));}

export async function previewDataEntry(env,actor,input){return prepareDataEntry(env,actor,input);}

async function commitCanonical(env,actor,entry,requestId){
  const p=json(entry.payload_json,{});
  switch(entry.entry_type){
    case 'country_blueprint': case 'product_country': case 'sector': case 'language': case 'currency': case 'region': case 'classification': case 'policy': case 'residency': case 'retention': case 'consent': case 'role': case 'capability': case 'responsibility': case 'storage': case 'provider': case 'page': case 'feature': case 'guidance': case 'plan': case 'eligibility': case 'pricing': return createReusableData(env,actor,entry.entry_type,{...p,dataEntryId:entry.entry_id},requestId);
    case 'component': {const {upsertProductComponent}=await import('./product-definition.service.js');return upsertProductComponent(env,actor,Number(p.definitionId),{componentType:p.componentType,componentKey:p.componentKey,payload:p.payload||{},status:p.status||'draft',dataEntryId:entry.entry_id});}
    case 'configuration': return createReusableData(env,actor,'configuration',{...p,dataEntryId:entry.entry_id},requestId);
    case 'product_component':{const {upsertProductComponent}=await import('./product-definition.service.js');return upsertProductComponent(env,actor,Number(p.definitionId),{componentType:p.componentType,componentKey:p.componentKey,payload:p.payload,status:p.status||'draft'});}
    case 'product_definition':return createProductDefinition(env,actor,{...p,dataEntryId:entry.entry_id});
    case 'country_product_launch':return createCountryLaunchDraft(env,actor,{...p,dataEntryId:entry.entry_id},requestId||crypto.randomUUID());
    case 'country_product_launch_update':{const {updateCountryProductLaunchDraft}=await import('./country-product-launch.service.js');return updateCountryProductLaunchDraft(env,actor,Number(p.launchId),{...p,dataEntryId:entry.entry_id},requestId||crypto.randomUUID());}
    case 'expansion_case':return createExpansionCase(env,actor,{...p,dataEntryId:entry.entry_id});
    case 'platform_configuration_draft':return createConfigurationDraft(env,actor,{configurationId:p.configurationId,domainCode:p.domainCode,configKey:p.configKey,version:p.version||'auto',payload:p.payload,reason:p.reason,dataEntryId:entry.entry_id},requestId||crypto.randomUUID());
    default:throw fail('DATA_ENTRY_COMMIT_TYPE_NOT_SUPPORTED',422,'DATA_ENTRY_COMMIT_TYPE_NOT_SUPPORTED');
  }
}
function resourceId(result){return result?.id??result?.code??result?.definition?.id??result?.blueprint?.id??result?.case?.id??result?.workspace?.case?.id??result?.workspace?.expansion?.id??result?.configuration?.id??null;}
function resourceStatus(result){return result?.status??(result?.active===1?'active':result?.definition?.status??result?.blueprint?.status??result?.workspace?.expansion?.status??result?.configuration?.status??'draft');}

async function recoverStaleCommit(env,entry){
  if(entry.status!=='validated'||!entry.commit_started_at)return entry;
  const age=Date.now()-Date.parse(String(entry.commit_started_at));
  if(!Number.isFinite(age)||age<5*60*1000)return entry;
  const key=String(entry.entry_id);
  const candidates=[
    ['product_definition','platform_product_definitions','data_entry_id','id','status'],
    ['country_blueprint','platform_country_product_blueprints','data_entry_id','id','status'],
    ['country_product_launch','country_product_launches','data_entry_id','id','status'],
    ['expansion_case','platform_product_expansion_cases','data_entry_id','id','status'],
    ['platform_configuration','platform_configuration_versions','data_entry_id','id','status']
  ].filter(x=>x[0]===entry.entry_type||x[0]==='platform_configuration'&&entry.entry_type==='platform_configuration_draft');
  const found=[];
  for(const [,table,keyColumn,idColumn,statusColumn] of candidates){
    const result=await env.DB.prepare(`SELECT ${idColumn},${statusColumn} FROM ${table} WHERE ${keyColumn}=? LIMIT 2`).bind(key).all().catch(error=>{throw Object.assign(new Error('Data-entry recovery authority unavailable'),{status:503,code:'AUTHORITY_UNAVAILABLE',cause:error});});
    for(const row of (result?.results||[]))found.push({table,id:Number(row[idColumn]),status:row[statusColumn]});
  }
  if(found.length===1){
    const resourceType=entryDefinition(entry.entry_type)?.canonicalResourceType;
    await env.DB.prepare(`UPDATE platform_data_entry_records SET status='committed',canonical_resource_type=?,canonical_resource_id=?,canonical_status=?,committed_at=COALESCE(committed_at,CURRENT_TIMESTAMP),commit_recovery_status='reconciled',commit_started_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE entry_id=? AND status='validated'`).bind(resourceType,String(found[0].id),String(found[0].status||'draft'),entry.entry_id).run();
    return await getDataEntry(env,entry.entry_id);
  }
  if(found.length===0){
    await env.DB.prepare(`UPDATE platform_data_entry_records SET commit_started_at=NULL,commit_recovery_status='reopened',commit_attempt=commit_attempt+1,rejection_code='COMMIT_RECOVERY_REOPENED',rejection_message='Stale commit lease was recovered without a canonical resource; commit may be retried safely.',updated_at=CURRENT_TIMESTAMP WHERE entry_id=? AND status='validated'`).bind(entry.entry_id).run();
    return await getDataEntry(env,entry.entry_id);
  }
  await env.DB.prepare(`UPDATE platform_data_entry_records SET commit_recovery_status='recovery_required',rejection_code='COMMIT_RECOVERY_AMBIGUOUS',rejection_message='Multiple canonical resources were found for one data entry; manual reconciliation is required.',updated_at=CURRENT_TIMESTAMP WHERE entry_id=? AND status='validated'`).bind(entry.entry_id).run();
  throw fail('DATA_ENTRY_COMMIT_RECOVERY_REQUIRED',409,'DATA_ENTRY_COMMIT_RECOVERY_REQUIRED');
}

export async function reconcileStaleDataEntryCommits(env,entryId=null){
  const evidenceRows=entryId?[await one(env,`SELECT * FROM platform_data_entry_records WHERE entry_id=? AND status='committed' AND commit_recovery_status='evidence_required' LIMIT 1`,clean(entryId,200))]:(await all(env,`SELECT * FROM platform_data_entry_records WHERE status='committed' AND commit_recovery_status='evidence_required' ORDER BY id ASC LIMIT 100`));
  const evidenceResults=[];
  for(const row of evidenceRows.filter(Boolean)){
    try{
      const authority=entryDefinition(row.entry_type)?.canonicalResourceType||row.canonical_resource_type||row.entry_type;
      await ensureDataLifecycleEvent(env,{resourceType:'data_entry',resourceId:row.entry_id,previousStage:'VALIDATED',stage:'COMMITTED',action:'commit',reasonCode:'data_entry_committed',reason:'Reconciled Data Entry commit evidence.',sourceEntryId:row.entry_id,canonicalAuthority:authority,actor:{role:row.actor_type||'system',id:row.actor_id},metadata:{entryType:row.entry_type,canonicalResourceId:row.canonical_resource_id}});
      if(row.canonical_resource_id!=null) await ensureDataLifecycleEvent(env,{resourceType:authority,resourceId:String(row.canonical_resource_id),stage:String(row.canonical_status||'COMMITTED').toUpperCase()==='ACTIVE'?'ACTIVE':'COMMITTED',action:'canonical_commit',reasonCode:'data_entry_commit',reason:'Reconciled canonical commit evidence.',sourceEntryId:row.entry_id,canonicalAuthority:authority,actor:{role:row.actor_type||'system',id:row.actor_id},metadata:{entryType:row.entry_type}});
      await env.DB.prepare(`UPDATE platform_data_entry_records SET commit_recovery_status='none',rejection_code=NULL,rejection_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE entry_id=? AND status='committed'`).bind(row.entry_id).run();
      evidenceResults.push({entryId:row.entry_id,status:'evidence_reconciled'});
    }catch(error){evidenceResults.push({entryId:row.entry_id,status:'evidence_required',errorCode:error?.code||'DATA_ENTRY_EVIDENCE_REQUIRED'});}
  }
  const rows=entryId?[await one(env,'SELECT * FROM platform_data_entry_records WHERE entry_id=? LIMIT 1',clean(entryId,200))]:(await all(env,`SELECT * FROM platform_data_entry_records WHERE status='validated' AND commit_started_at IS NOT NULL AND datetime(commit_started_at)<=datetime('now','-5 minutes') ORDER BY id ASC LIMIT 100`));
  const results=[];
  for(const row of rows.filter(Boolean)){try{results.push(await recoverStaleCommit(env,row));}catch(error){results.push({entryId:row.entry_id,status:'recovery_required',errorCode:error?.code||'DATA_ENTRY_COMMIT_RECOVERY_REQUIRED'});}}
  return [...evidenceResults,...results];
}

export async function commitDataEntry(env,actor,entryId,{requestId='',stepUpVerified=false}={}){
  let entry=await one(env,'SELECT * FROM platform_data_entry_records WHERE entry_id=? LIMIT 1',clean(entryId,200));
  if(!entry)throw fail('DATA_ENTRY_NOT_FOUND',404,'DATA_ENTRY_NOT_FOUND');
  if(entry.status==='committed')return normalize(entry);
  entry=await recoverStaleCommit(env,entry);
  if(entry.status==='committed')return normalize(entry);
  if(entry.commit_recovery_status==='recovery_required')throw fail('DATA_ENTRY_COMMIT_RECOVERY_REQUIRED',409,'DATA_ENTRY_COMMIT_RECOVERY_REQUIRED');
  if(entry.status!=='validated')throw fail(`DATA_ENTRY_NOT_COMMITTABLE:${entry.status}`,409,'DATA_ENTRY_NOT_COMMITTABLE');
  const policy=json(entry.policy_json,{});if(policy.requiresStepUp&&!stepUpVerified)throw fail('DATA_ENTRY_STEP_UP_REQUIRED',403,'DATA_ENTRY_STEP_UP_REQUIRED');
  if(json(entry.validation_json,{}).valid!==true||!policy.allowed)throw fail('DATA_ENTRY_VALIDATION_BLOCKED',409,'DATA_ENTRY_VALIDATION_BLOCKED');
  const lease=await env.DB.prepare(`UPDATE platform_data_entry_records SET commit_started_at=CURRENT_TIMESTAMP,commit_attempt=commit_attempt+1,commit_recovery_status='none',updated_at=CURRENT_TIMESTAMP WHERE entry_id=? AND status='validated' AND commit_started_at IS NULL AND commit_recovery_status IN ('none','reopened')`).bind(entry.entry_id).run();
  if(Number(lease.meta?.changes||0)!==1)throw fail('DATA_ENTRY_COMMIT_IN_PROGRESS',409,'DATA_ENTRY_COMMIT_IN_PROGRESS');
  try{
    const authority=entryDefinition(entry.entry_type)?.canonicalResourceType||entry.entry_type;
    await recordDataLifecycleEvent(env,{resourceType:'data_entry',resourceId:entry.entry_id,previousStage:'VALIDATED',stage:'VALIDATED',action:'canonical_commit_intent',reasonCode:'data_entry_commit_intent',reason:'Canonical Data Entry mutation authorized and fenced before mutation.',sourceEntryId:entry.entry_id,canonicalAuthority:authority,actor,requestId,metadata:{entryType:entry.entry_type}});
    const result=await commitCanonical(env,actor,entry,requestId);
    const id=resourceId(result),status=resourceStatus(result);
    await env.DB.prepare(`UPDATE platform_data_entry_records SET status='committed',canonical_resource_type=?,canonical_resource_id=?,canonical_status=?,committed_at=CURRENT_TIMESTAMP,commit_recovery_status='none',commit_started_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE entry_id=? AND status='validated'`).bind(authority,id==null?null:String(id),status,entry.entry_id).run();
    let evidenceStatus='complete';
    try{
      await ensureDataLifecycleEvent(env,{resourceType:'data_entry',resourceId:entry.entry_id,previousStage:'VALIDATED',stage:'COMMITTED',action:'commit',reasonCode:'data_entry_committed',reason:'Data Entry committed to its canonical authority.',sourceEntryId:entry.entry_id,canonicalAuthority:authority,actor,requestId,metadata:{entryType:entry.entry_type,canonicalResourceId:id==null?null:String(id)}});
      if(id!=null) await ensureDataLifecycleEvent(env,{resourceType:authority,resourceId:String(id),stage:String(status||'draft').toLowerCase()==='active'?'ACTIVE':'COMMITTED',action:'canonical_commit',reasonCode:'data_entry_commit',reason:'Canonical resource created from governed Data Entry.',sourceEntryId:entry.entry_id,canonicalAuthority:authority,actor,requestId,metadata:{entryType:entry.entry_type}});
    }catch(error){
      evidenceStatus='pending_reconciliation';
      await env.DB.prepare(`UPDATE platform_data_entry_records SET commit_recovery_status='evidence_required',rejection_code=?,rejection_message=?,updated_at=CURRENT_TIMESTAMP WHERE entry_id=?`).bind('DATA_ENTRY_EVIDENCE_REQUIRED',clean(error?.message||'Lifecycle evidence could not be persisted.',500),entry.entry_id).run();
    }
    await linkGovernedIntakeEntry(env,entry.entry_id,{status:'COMMITTED',resourceType:authority,resourceId:id,errorCode:evidenceStatus==='complete'?null:'DATA_ENTRY_EVIDENCE_REQUIRED',errorMessage:evidenceStatus==='complete'?null:'Lifecycle evidence awaits reconciliation'}).catch(error=>{throw authorityUnavailable('governed_intake_link',error);});
    return {...normalize(await getDataEntry(env,entry.entry_id)),result,evidenceStatus};
  }catch(e){
    await env.DB.prepare(`UPDATE platform_data_entry_records SET status='validated',rejection_code=?,rejection_message=?,commit_started_at=NULL,commit_recovery_status='none',updated_at=CURRENT_TIMESTAMP WHERE entry_id=?`).bind(clean(e?.code||'DATA_ENTRY_COMMIT_FAILED',120),clean(e?.message||'Canonical creation failed',500),entry.entry_id).run();
    try{await linkGovernedIntakeEntry(env,entry.entry_id,{status:'FAILED',errorCode:e?.code||'DATA_ENTRY_COMMIT_FAILED',errorMessage:e?.message||'Commit failed'});}catch(intakeError){throw authorityUnavailable('governed_intake_failure_link',intakeError);}
    throw e;
  }
}

export async function previewDataEntryImport(env,actor,{entryType,items=[],purpose='import',classification=null,sourceId=null,countryScope=null,idempotencyKey=null}={}){
  if(!Array.isArray(items)||!items.length)throw fail('DATA_ENTRY_IMPORT_ITEMS_REQUIRED',400,'DATA_ENTRY_IMPORT_ITEMS_REQUIRED');
  if(items.length>100)throw fail('DATA_ENTRY_IMPORT_LIMIT',400,'DATA_ENTRY_IMPORT_LIMIT');
  const sourceHash=await sha256Intake({entryType,items,purpose,classification,sourceId,countryScope});
  const batch=await beginGovernedIntake(env,actor,{intakeType:'data_entry_import',sourceType:'structured_file',sourceName:sourceId||`${entryType||'data'}-import`,sourceHash,idempotencyKey:idempotencyKey||`data-import:${sourceHash}`,countryScope:countryScope||null,manifest:{entryType,purpose,itemCount:items.length,schemaVersion:DATA_ENTRY_SCHEMA_VERSION}});
  if(batch.status==='COMMITTED'){const prior=await getGovernedIntake(env,batch.intake_id);const entries=[];for(const item of prior.items||[]){if(item.target_entry_id){const entry=await getDataEntry(env,item.target_entry_id);if(entry)entries.push(entry);}}const duplicates=(prior.items||[]).filter(x=>x.status==='DUPLICATE').map(x=>({index:Number(x.item_key),reason:'duplicate_within_import'}));const blocked=(prior.items||[]).filter(x=>['BLOCKED','FAILED'].includes(x.status)).map(x=>({index:Number(x.item_key),code:x.error_code,message:x.error_message}));return {flow:['RECEIVE','HASH','SCAN','VALIDATE','CLASSIFY','DEDUPLICATE','DEPENDENCY ANALYSIS','PREVIEW','APPROVE','COMMIT','VERIFY'],batch:prior,entryType,scanned:items.length,unique:entries.length+blocked.length,duplicates,blocked,blockers:blocked.length,entries,itemResults:(prior.items||[]).map(x=>({index:Number(x.item_key),status:x.status,entryId:x.target_entry_id||null,code:x.error_code||null}))};}
  if(batch.status==='CANCELLED')throw fail('GOVERNED_INTAKE_CANCELLED',409,'GOVERNED_INTAKE_CANCELLED');
  const seen=new Set(),previews=[],duplicates=[],blocked=[],itemResults=[];
  for(let i=0;i<items.length;i++){
    let raw;
    try{raw=ensureObject(items[i],`items[${i}]`);}catch(error){const hash=await sha256Intake(items[i]);blocked.push({index:i,code:error.code||'DATA_ENTRY_ITEM_INVALID',message:error.message});itemResults.push({index:i,status:'BLOCKED',code:error.code||'DATA_ENTRY_ITEM_INVALID'});await recordGovernedIntakeItem(env,batch.intake_id,{itemKey:String(i),itemType:entryType||'unknown',contentHash:hash,status:'BLOCKED',details:{index:i},errorCode:error.code||'DATA_ENTRY_ITEM_INVALID',errorMessage:error.message});continue;}
    const fingerprint=await sha256Intake(raw);
    if(seen.has(fingerprint)){duplicates.push({index:i,reason:'duplicate_within_import'});itemResults.push({index:i,status:'DUPLICATE'});await recordGovernedIntakeItem(env,batch.intake_id,{itemKey:String(i),itemType:entryType,contentHash:fingerprint,status:'DUPLICATE',details:{index:i,duplicateOf:'earlier_item'}});continue;}seen.add(fingerprint);
    try{
      const entry=await prepareDataEntry(env,actor,{entryType,payload:raw,sourceType:'import',sourceId:sourceId||batch.intake_id,countryScope:countryScope||raw.countryCode||raw.targetCountryCode||null,purpose,classification:classification||'IMPORTED',idempotencyKey:idempotencyKey?`${idempotencyKey}:${i}`:`${batch.intake_id}:${i}`});
      previews.push(entry);itemResults.push({index:i,status:'PREVIEWED',entryId:entry.entry_id});
      await recordGovernedIntakeItem(env,batch.intake_id,{itemKey:String(i),itemType:entryType,sourceRef:String(i),contentHash:fingerprint,status:'PREVIEWED',targetEntryId:entry.entry_id,details:{index:i,entryType,classification:entry.classification,riskLevel:entry.risk_level}});
    }catch(error){
      const details=error?.details||{};blocked.push({index:i,code:error?.code||'DATA_ENTRY_ITEM_BLOCKED',message:clean(error?.message||'Entry blocked',500),details});itemResults.push({index:i,status:'BLOCKED',code:error?.code||'DATA_ENTRY_ITEM_BLOCKED'});
      await recordGovernedIntakeItem(env,batch.intake_id,{itemKey:String(i),itemType:entryType,sourceRef:String(i),contentHash:fingerprint,status:'BLOCKED',details:{index:i,validation:details.validation||null,dependencies:details.dependencies||null},errorCode:error?.code||'DATA_ENTRY_ITEM_BLOCKED',errorMessage:error?.message||'Entry blocked'});
    }
  }
  const finalStatus=blocked.length?'BLOCKED':'PREVIEWED';
  const finished=await finishGovernedIntake(env,batch.intake_id,{status:finalStatus,summary:{scanned:items.length,previewed:previews.length,blocked:blocked.length,duplicates:duplicates.length,requiresCommitApproval:true}});
  return {flow:['RECEIVE','HASH','SCAN','VALIDATE','CLASSIFY','DEDUPLICATE','DEPENDENCY_ANALYSIS','PREVIEW','APPROVE','COMMIT','VERIFY'],batch:finished,entryType,scanned:items.length,unique:previews.length+blocked.length,duplicates,blocked,blockers:blocked.length+previews.filter(x=>(x.dependencies?.blockers||[]).length).length,entries:previews,itemResults};
}
export async function commitDataEntryImport(env,actor,entryIds=[],{requestId='',stepUpVerified=false}={}){
  if(!Array.isArray(entryIds)||!entryIds.length)throw fail('DATA_ENTRY_IMPORT_ENTRIES_REQUIRED',400,'DATA_ENTRY_IMPORT_ENTRIES_REQUIRED');
  if(entryIds.length>100)throw fail('DATA_ENTRY_IMPORT_LIMIT',400,'DATA_ENTRY_IMPORT_LIMIT');
  const results=[];
  for(const id of entryIds){try{results.push({entryId:id,status:'COMMITTED',result:await commitDataEntry(env,actor,id,{requestId,stepUpVerified})});}catch(error){results.push({entryId:id,status:'FAILED',errorCode:error?.code||'DATA_ENTRY_COMMIT_FAILED',errorMessage:clean(error?.message||'Commit failed',500)});}}
  const committed=results.filter(x=>x.status==='COMMITTED').length,failed=results.length-committed;
  return {committed,failed,status:failed?(committed?'PARTIAL':'FAILED'):'COMMITTED',results};
}

export async function getDataEntry(env,entryId){const r=await one(env,'SELECT * FROM platform_data_entry_records WHERE entry_id=? LIMIT 1',clean(entryId,200));return r?normalize(r):null;}
export async function listDataEntries(env,{status='',entryType='',limit=100}={}){const n=Math.min(250,Math.max(1,Number(limit||100)));const rows=await all(env,`SELECT * FROM platform_data_entry_records WHERE (?='' OR status=?) AND (?='' OR entry_type=?) ORDER BY created_at DESC,id DESC LIMIT ?`,clean(status,40),clean(status,40),clean(entryType,80),clean(entryType,80),n);return rows.map(normalize);}
export async function syncEntryLifecycle(env,resourceType,resourceId,lifecycleState){if(!resourceType||resourceId==null)return;await env.DB.prepare(`UPDATE platform_data_entry_records SET canonical_status=?,updated_at=CURRENT_TIMESTAMP WHERE canonical_resource_type=? AND canonical_resource_id=? AND status='committed'`).bind(clean(lifecycleState,80),clean(resourceType,80),String(resourceId)).run();}
function normalize(r){return {...r,id:Number(r.id),payload:json(r.payload_json,{}),provenance:json(r.provenance_json,{}),validation:json(r.validation_json,{}),policy:json(r.policy_json,{}),dependencies:json(r.dependency_json,{}),impact:json(r.impact_json,{}),canonical_resource_id:r.canonical_resource_id==null?null:String(r.canonical_resource_id)};}
export function dataEntryDefinition(entryType){const d=entryDefinition(String(entryType||''));return d?Object.freeze({...d}):null;}
export function listDataEntryDefinitions(){return [...Object.entries(ENTRY_DEFINITIONS).map(([key,d])=>({entryType:key,...d})),...listReusableDataDefinitions().map(d=>({...d,canonicalResourceType:d.entryType,purposeDefaults:['configuration','production','testing'],schema:Object.fromEntries((d.fields||[]).map(x=>[x,'string']))}))];}
