/* ON Mission 10.71.4 — Data Studio orchestration boundary.
 * Data Studio never becomes a truth owner. It reads canonical projections,
 * prepares governed edits through Data Entry validation, then dispatches the
 * mutation to the existing canonical authority. Lifecycle + audit remain evidence.
 */
import {RELEASE_VERSION} from '../core/release.js';
import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';
import {listReusableData,createReusableData,listReusableDataDefinitions} from './platform-reusable-data.service.js';
import {updateProductCountry} from './product-country-catalog.service.js';
import {prepareDataEntry,getDataEntry} from './platform-data-entry.service.js';
import {getDataLifecycle,recordDataLifecycleEvent,ensureDataLifecycleEvent} from './platform-data-lifecycle.service.js';
import {prepareCriticalAudit,completeCriticalAudit} from './critical-audit.service.js';
import {updateCountryBlueprint} from './country-product-blueprint.service.js';
import {auditAdminControl} from './admin-control-audit.service.js';

export const PLATFORM_DATA_STUDIO_VERSION=RELEASE_VERSION;
const fail=(m,s=400,c=m)=>Object.assign(new Error(m),{status:s,code:c});
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const json=v=>{try{return JSON.parse(String(v??'{}'))||{}}catch{return {}}};
const REUSABLE_TYPES=new Set(['country_blueprint','product_country','sector','language','currency','region','classification','policy','residency','retention','consent','role','capability','responsibility','storage','provider','component','page','feature','configuration','guidance','plan','eligibility','pricing','sector_lifecycle','translation_bundle']);
const DATA_STUDIO_EDIT_TYPES=new Set(['country_blueprint','product_country','sector','language','currency','region','classification','policy','residency','retention','role','capability','responsibility','storage','provider','component','page','feature','configuration','guidance','plan','eligibility','pricing','sector_lifecycle','translation_bundle']);

const keyOf=(type,row)=>String(row?.code??row?.role_code??row?.id??'');
function matches(type,row,id){return keyOf(type,row)===String(id);}

async function normalizeEntry(r){return r?{...r,payload:json(r.payload_json),provenance:json(r.provenance_json),validation:json(r.validation_json),policy:json(r.policy_json),dependencies:json(r.dependency_json),impact:json(r.impact_json)}:null;}
async function linkedEntry(env,resourceType,resourceId){
  const r=await canonicalFirst(env,`SELECT * FROM platform_data_entry_records WHERE canonical_resource_type=? AND canonical_resource_id=? AND status='committed' ORDER BY id DESC LIMIT 1`,[resourceType,String(resourceId)],'data_studio.entry_link');
  return normalizeEntry(r);
}
async function entryHistory(env,resourceType,resourceId){
  const rows=await canonicalAll(env,`SELECT id,entry_id,entry_type,status,actor_type,actor_id,classification,purpose,risk_level,created_at,updated_at,committed_at,canonical_resource_type,canonical_resource_id,payload_json,validation_json,dependency_json,impact_json FROM platform_data_entry_records WHERE canonical_resource_type=? AND canonical_resource_id=? AND status='committed' ORDER BY COALESCE(committed_at,updated_at,created_at) DESC,id DESC LIMIT 50`,[resourceType,String(resourceId)],'data_studio.entry_history');
  return rows.map((r,i)=>({id:Number(r.id),entry_id:r.entry_id,entry_type:r.entry_type,status:r.status,actor_type:r.actor_type,actor_id:r.actor_id,classification:r.classification,purpose:r.purpose,risk_level:r.risk_level,created_at:r.created_at,updated_at:r.updated_at,committed_at:r.committed_at,revision:rows.length-i,payload:json(r.payload_json),validation:json(r.validation_json),dependencies:json(r.dependency_json),impact:json(r.impact_json)}));
}
function definitionFor(type){return listReusableDataDefinitions().find(x=>x.entryType===type)||null;}
// Basic and Advanced are two views over the same record. A request may contain
// only the fields visible in the active view, so merge it with the owning
// authority's current schema fields before validating. This prevents hidden
// advanced fields from being accidentally dropped or treated as missing.
function mergeCanonicalFields(type,record,payload){
  const def=definitionFor(type);const out={};
  for(const field of (def?.fields||[])){
    const snake=String(field).replace(/[A-Z]/g,m=>`_${m.toLowerCase()}`);
    let value=record?.[field];if(value===undefined)value=record?.[snake];
    if(value===undefined&&field==='payload')value=record?.payload_json;
    if(value===undefined&&field==='configuration')value=record?.configuration_json;
    if(value===undefined&&field==='rule')value=record?.rule_json;
    if(value!==undefined){if(typeof value==='string'&&['payload','configuration','rule','states','transitions','prerequisites','evidenceRequirements','recoveryPaths','translations'].includes(field)){try{value=JSON.parse(value)}catch{}}out[field]=value;}
  }
  return {...out,...(payload&&typeof payload==='object'?payload:{})};
}
function capabilitiesFor(type){const editable=DATA_STUDIO_EDIT_TYPES.has(type);const versioned=['configuration','sector_lifecycle','translation_bundle'].includes(type);const supportedControl=['tenant','user','country','sector','ui','content','country_blueprint','product_definition','country_product_launch','expansion_case','data_entry'].includes(type);return {inspect:true,edit:editable,preview:editable,json:true,history:true,dependencies:true,governance:true,mutationMode:versioned?'NEW_IMMUTABLE_VERSION':editable?'CANONICAL_OWNER_UPDATE':'INSPECT_ONLY',actions:[...(editable?['EDIT','VALIDATE','SAVE']:[]),'PREVIEW','DEPENDENCIES','HISTORY',...(type==='page'||type==='component'?['LAYOUT_STUDIO']:[]),...(type==='product_country'||type==='country_blueprint'||type==='sector'||type==='sector_lifecycle'||type==='translation_bundle'?['MARKET_STUDIO']:[]),...(supportedControl?['OPEN_DATA_CONTROL']:[])],quarantine:false,purge:false,uiPreview:type==='page'||type==='component'};}

async function currentReusable(env,type,id){
  const result=await listReusableData(env,{type,limit:250});
  const rows=Array.isArray(result.data?.[type])?result.data[type]:[];
  let row=rows.find(x=>matches(type,x,id));
  if(!row){
    if(result.projectionErrors?.some(x=>x.type===type))throw Object.assign(new Error(`Canonical ${type} projection is unavailable.`),{status:503,code:'AUTHORITY_UNAVAILABLE'});
    throw fail('DATA_STUDIO_RECORD_NOT_FOUND',404,'DATA_STUDIO_RECORD_NOT_FOUND');
  }
  if(type==='country_blueprint') row=await canonicalFirst(env,`SELECT b.*,c.name country_name FROM platform_country_product_blueprints b JOIN platform_product_country_catalog c ON c.code=b.country_code WHERE b.id=? LIMIT 1`,[Number(id)],'data_studio.country_blueprint')||row;
  if(type==='component') row=await canonicalFirst(env,`SELECT c.*,d.product_key,d.country_code,d.sector_code FROM platform_product_definition_components c JOIN platform_product_definitions d ON d.id=c.definition_id WHERE c.id=? LIMIT 1`,[Number(id)],'data_studio.component')||row;
  if(type==='configuration') row=await canonicalFirst(env,`SELECT * FROM platform_configuration_versions WHERE id=? LIMIT 1`,[Number(id)],'data_studio.configuration')||row;
  return row;
}

export async function inspectDataStudioRecord(env,{resourceType,resourceId}={}){
  const type=clean(resourceType,100),id=String(resourceId??'');
  if(!type||!id)throw fail('DATA_STUDIO_RESOURCE_REQUIRED',400,'DATA_STUDIO_RESOURCE_REQUIRED');
  let record,authority=type,capability='structured';
  if(REUSABLE_TYPES.has(type)){record=await currentReusable(env,type,id);authority=({country_blueprint:'countryProductBlueprintAuthority',product_country:'productCountryCatalog',sector:'sectorCatalog',language:'languageCatalog',currency:'currencyCatalog',region:'regionCatalog',classification:'classificationCatalog',policy:'policyCatalog',residency:'policyCatalog',retention:'policyCatalog',consent:'consentPolicyAuthority',role:'organizationRoleCatalog',capability:'canonicalCapabilityRegistry',responsibility:'responsibilityCatalog',storage:'storageCatalog',provider:'externalProviderRegistry',component:'productComponentAuthority',page:'pageCatalog',feature:'featureCatalog',configuration:'platformConfigurationAuthority',sector_lifecycle:'platformConfigurationAuthority',translation_bundle:'platformConfigurationAuthority',guidance:'guidanceCatalog',plan:'subscriptionPlanAuthority',eligibility:'eligibilityCatalog',pricing:'pricingCatalog'})[type]||type;
    if(type==='page'||type==='component')capability='ui';
  } else if(type==='data_entry'){
    record=await getDataEntry(env,id);if(!record)throw fail('DATA_STUDIO_RECORD_NOT_FOUND',404,'DATA_STUDIO_RECORD_NOT_FOUND');authority='platform_data_entry_records';
  } else if(type==='tenant'){
    record=await canonicalFirst(env,`SELECT c.id,c.name,c.deletion_status,c.created_at,c.updated_at,cmp.legal_name,cmp.trading_name,cmp.country_code,cmp.region_code,cmp.organization_type,cmp.organization_size,cmp.sector_code,cmp.compliance_status,cmp.status management_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.id=? LIMIT 1`,[Number(id)],'data_studio.company');
    if(!record)throw fail('DATA_STUDIO_RECORD_NOT_FOUND',404,'DATA_STUDIO_RECORD_NOT_FOUND');authority='organizationManagement';
  } else if(type==='user'){
    record=await canonicalFirst(env,`SELECT ai.id,ai.company_id,ai.role,ai.login,ai.email,ai.display_name,ai.active,ai.created_at,ai.updated_at,c.name company_name FROM auth_identities ai JOIN companies c ON c.id=ai.company_id WHERE ai.id=? LIMIT 1`,[Number(id)],'data_studio.identity');
    if(!record)throw fail('DATA_STUDIO_RECORD_NOT_FOUND',404,'DATA_STUDIO_RECORD_NOT_FOUND');authority='identityAuthority';
  } else if(type==='country'){
    record=await canonicalFirst(env,`SELECT code,name,active,created_at,updated_at FROM country_catalog WHERE code=? LIMIT 1`,[id.toUpperCase()],'data_studio.registration_country');
    if(!record)throw fail('DATA_STUDIO_RECORD_NOT_FOUND',404,'DATA_STUDIO_RECORD_NOT_FOUND');authority='registrationCountryCatalog';
  } else if(type==='ui'||type==='content'){
    record=await canonicalFirst(env,`SELECT c.id,c.definition_id,c.component_type,c.component_key,c.status,c.payload_json,c.created_at,c.updated_at,d.product_key,d.country_code,d.sector_code FROM platform_product_definition_components c JOIN platform_product_definitions d ON d.id=c.definition_id WHERE c.id=? LIMIT 1`,[Number(id)],'data_studio.product_component');
    if(!record)throw fail('DATA_STUDIO_RECORD_NOT_FOUND',404,'DATA_STUDIO_RECORD_NOT_FOUND');authority='productComponentAuthority';capability='ui';
  } else {
    throw fail('DATA_STUDIO_RESOURCE_NOT_SUPPORTED',422,'DATA_STUDIO_RESOURCE_NOT_SUPPORTED');
  }
  const entry=await linkedEntry(env,type,id);
  const history=await entryHistory(env,type,id);
  const lifecycle=await getDataLifecycle(env,type,id,{limit:100});
  const revision=Math.max(1,history.length+1,(lifecycle.events||[]).filter(x=>['edit','canonical_edit','canonical_commit'].includes(String(x.action))).length+1);
  const definition=definitionFor(type);
  const capabilities=capabilitiesFor(type);
  return {success:true,version:PLATFORM_DATA_STUDIO_VERSION,record:{resourceType:type,resourceId:id,displayName:record.name||record.label||record.title||record.display_name||record.login||record.code||`${type} ${id}`,authority,capability,revision,riskLevel:definition?.risk||null,category:definition?.category||null,definition,capabilities,record,entry,history:{entries:history,total:history.length},lifecycle}};
}

export async function prepareDataStudioEdit(env,actor,{resourceType,resourceId,payload,reason=''}={}){
  const inspected=await inspectDataStudioRecord(env,{resourceType,resourceId});
  if(!DATA_STUDIO_EDIT_TYPES.has(resourceType))throw fail('DATA_STUDIO_EDIT_OWNER_REQUIRED',409,'DATA_STUDIO_EDIT_OWNER_REQUIRED');
  if(!clean(reason,1000))throw fail('DATA_STUDIO_CHANGE_REASON_REQUIRED',422,'DATA_STUDIO_CHANGE_REASON_REQUIRED');
  const input=mergeCanonicalFields(resourceType,inspected.record.record,payload);
  if(resourceType==='country_blueprint')input.countryCode=input.countryCode||inspected.record.record.country_code;
  // Preview and commit must validate the same canonical identity. The basic editor
  // intentionally renders identity codes read-only and therefore omits them from
  // form payloads. Derive the immutable code from the owning record, never from a
  // renamed display name (which could otherwise validate as a different resource).
  const immutableCodeTypes=new Set(['product_country','sector','language','currency','region','classification','policy','residency','retention','role','capability','responsibility','storage','provider','page','feature','guidance','eligibility','pricing']);
  if(immutableCodeTypes.has(resourceType)){
    const canonicalCode=String(inspected.record.record.code??inspected.record.record.role_code??inspected.record.resourceId??'');
    if(!canonicalCode)throw fail('DATA_STUDIO_CANONICAL_IDENTITY_MISSING',409,'DATA_STUDIO_CANONICAL_IDENTITY_MISSING');
    input.code=resourceType==='product_country'?canonicalCode.toUpperCase():canonicalCode;
  }
  const entry=await prepareDataEntry(env,actor,{entryType:resourceType,payload:input,purpose:'configuration',classification:'CONFIGURATION',sourceType:'super_admin',sourceId:`data-studio:${resourceType}:${resourceId}`,countryScope:input.countryCode||inspected.record.record.country_code||null,idempotencyKey:`studio_preview_${crypto.randomUUID()}`});
  return {success:true,version:PLATFORM_DATA_STUDIO_VERSION,record:inspected.record,entry,reason};
}

async function markEditEntry(env,entry,resourceType,resourceId,actor,requestId,result){
  const canonicalStatus=String(result?.status||(result?.active===1?'active':'committed'));
  await env.DB.prepare(`UPDATE platform_data_entry_records SET status='committed',canonical_resource_type=?,canonical_resource_id=?,canonical_status=?,committed_at=CURRENT_TIMESTAMP,commit_recovery_status='none',updated_at=CURRENT_TIMESTAMP WHERE entry_id=?`).bind(resourceType,String(resourceId),canonicalStatus,entry.entry_id).run();
  let evidenceStatus='complete';
  try{
    await ensureDataLifecycleEvent(env,{resourceType,resourceId:String(resourceId),stage:canonicalStatus.toUpperCase()==='ACTIVE'?'ACTIVE':'COMMITTED',action:'canonical_edit',reasonCode:'data_studio_edit',reason:'Governed edit committed from Data Studio.',sourceEntryId:entry.entry_id,canonicalAuthority:resourceType,actor,requestId,dependencySnapshot:entry.dependencies||{},metadata:{source:'Data Studio',entryType:resourceType}});
  }catch(error){
    evidenceStatus='pending_reconciliation';
    await env.DB.prepare(`UPDATE platform_data_entry_records SET commit_recovery_status='evidence_required',rejection_code=?,rejection_message=?,updated_at=CURRENT_TIMESTAMP WHERE entry_id=?`).bind('DATA_STUDIO_EVIDENCE_REQUIRED',clean(error?.message||'Lifecycle evidence could not be persisted.',500),entry.entry_id).run();
  }
  try{await auditAdminControl(env,{actor,action:'platform.data_studio.edit',resourceType,resourceId:String(resourceId),targetCompanyId:null,requestId,metadata:{entryId:entry.entry_id,evidenceStatus}});}catch(error){
    evidenceStatus='pending_reconciliation';
    await env.DB.prepare(`UPDATE platform_data_entry_records SET commit_recovery_status='evidence_required',rejection_code=?,rejection_message=?,updated_at=CURRENT_TIMESTAMP WHERE entry_id=?`).bind('DATA_STUDIO_AUDIT_REQUIRED',clean(error?.message||'Administrative audit could not be persisted.',500),entry.entry_id).run();
  }
  return {evidenceStatus};
}

export async function commitDataStudioEdit(env,actor,{resourceType,resourceId,payload,reason='',requestId='',expectedUpdatedAt=null}={}){
  const inspected=await inspectDataStudioRecord(env,{resourceType,resourceId});
  if(!clean(reason,1000))throw fail('DATA_STUDIO_CHANGE_REASON_REQUIRED',422,'DATA_STUDIO_CHANGE_REASON_REQUIRED');
  if(!DATA_STUDIO_EDIT_TYPES.has(resourceType))throw fail('DATA_STUDIO_EDIT_OWNER_REQUIRED',409,'DATA_STUDIO_EDIT_OWNER_REQUIRED');
  const scopeKey=`data-studio:${clean(resourceType,100)}:${String(resourceId??'')}`;
  return withPlatformMutationLease(env,{scopeKey,actorType:actor?.role||actor?.type||'platform_super_administrator',actorId:actor?.id||actor?.identityId||null},async()=>{
    // Re-read after acquiring the lease. This closes the check-then-write race.
    const current=await inspectDataStudioRecord(env,{resourceType,resourceId});
    const canonicalUpdatedAt=String(current.record.record.updated_at||'');
    const expected=expectedUpdatedAt==null?canonicalUpdatedAt:String(expectedUpdatedAt);
    if(expected&&canonicalUpdatedAt!==expected)throw fail('DATA_STUDIO_STALE_RECORD',409,'DATA_STUDIO_STALE_RECORD');
    const input=mergeCanonicalFields(resourceType,current.record.record,payload);
    if(resourceType==='country_blueprint')input.countryCode=input.countryCode||current.record.record.country_code;
    // Code-keyed reusable assets must keep their canonical identity during edits.
    // A changed code would otherwise upsert a second row and leave the original behind.
    const immutableCodeTypes=new Set(['product_country','sector','language','currency','region','classification','policy','residency','retention','role','capability','responsibility','storage','provider','page','feature','guidance','eligibility','pricing']);
    if(immutableCodeTypes.has(resourceType)){
      const canonicalCode=String(current.record.record.code??current.record.record.role_code??current.record.resourceId??'');
      if(!canonicalCode)throw fail('DATA_STUDIO_CANONICAL_IDENTITY_MISSING',409,'DATA_STUDIO_CANONICAL_IDENTITY_MISSING');
      input.code=resourceType==='product_country'?canonicalCode.toUpperCase():canonicalCode;
    }
    const entry=await prepareDataEntry(env,actor,{entryType:resourceType,payload:input,purpose:'configuration',classification:'CONFIGURATION',sourceType:'super_admin',sourceId:`data-studio:${resourceType}:${resourceId}`,countryScope:input.countryCode||current.record.record.country_code||null,idempotencyKey:`studio_edit_${crypto.randomUUID()}`});
    const auditEventId=await prepareCriticalAudit(env,{session:actor,action:'platform.data_studio.edit',resourceType,resourceId:String(resourceId),requestId,metadata:{entryId:entry.entry_id,expectedUpdatedAt:expected||null}});
    let result;
    try{
      await recordDataLifecycleEvent(env,{resourceType,resourceId:String(resourceId),stage:'VALIDATED',action:'canonical_edit_intent',reasonCode:'data_studio_edit_intent',reason:'Canonical Data Studio mutation authorized and fenced before mutation.',sourceEntryId:entry.entry_id,canonicalAuthority:resourceType,actor,requestId,dependencySnapshot:entry.dependencies||{},metadata:{source:'Data Studio',entryType:resourceType}});
      if(resourceType==='country_blueprint') result=await updateCountryBlueprint(env,actor,Number(resourceId),{...input,dataEntryId:entry.entry_id,expectedUpdatedAt:expected});
      else if(resourceType==='product_country') result=await updateProductCountry(env,actor,String(resourceId),{...input,dataEntryId:entry.entry_id,expectedUpdatedAt:expected});
      else result=await createReusableData(env,actor,resourceType,{...input,dataEntryId:entry.entry_id,expectedUpdatedAt:expected},requestId||crypto.randomUUID());
      const canonicalId=String(result?.id??result?.code??result?.country?.code??result?.blueprint?.id??resourceId);
      let readAfterWriteVerified=false;
      try {
        const reread=await inspectDataStudioRecord(env,{resourceType,resourceId:canonicalId});
        const canonicalRecord=reread?.record?.record||{};
        const sameIdentity=Boolean(reread?.record&&String(reread.record.resourceId)===canonicalId);
        // Verify persisted values, not merely that a record with this ID exists.
        const fieldMap={requiresReview:'requires_review',defaultSubscriptionClass:'default_subscription_class',description:'description',name:'name',code:'code',symbol:'symbol',countryCode:'country_code',domain:'domain',scopeType:'scope_type',providerCode:'provider_code',regionCode:'region_code',purpose:'purpose',residencyMode:'residency_mode',providerType:'provider_type',pageType:'page_type',languageCode:'language_code',body:'body',rule:'rule_json',currency:'currency',priceMinor:'price_minor',billingInterval:'billing_interval'};
        const checkedFields=Object.keys(input).filter(k=>fieldMap[k]||Object.prototype.hasOwnProperty.call(canonicalRecord,k));
        const valueMatches=(a,b)=>{
          if(a===undefined||b===undefined||a===null||b===null)return a==null&&b==null;
          if(typeof a==='boolean')return Number(b)===Number(a)||String(b)===String(a);
          if(typeof a==='object')return JSON.stringify(a)===JSON.stringify(typeof b==='string'?json(b):b);
          if(typeof a==='number')return Number(a)===Number(b);
          return String(a).trim()===String(b).trim();
        };
        const fieldsMatch=checkedFields.every(k=>{
          const col=(k==='code'&&resourceType==='role'?'role_code':fieldMap[k]||k);let expected=input[k],actual=canonicalRecord[col];
          if(k==='requiresReview'){expected=expected?1:0;actual=actual===undefined?canonicalRecord.requiresReview:actual;}
          if(k==='rule'&&typeof actual==='string')actual=json(actual);
          if(k==='code'&&resourceType==='product_country'){expected=String(expected).toUpperCase();actual=String(actual||'').toUpperCase();}
          return valueMatches(expected,actual);
        });
        readAfterWriteVerified=sameIdentity&&fieldsMatch;
      } catch { readAfterWriteVerified=false; }
      const evidence=await markEditEntry(env,entry,resourceType,canonicalId,actor,requestId,result?.country||result?.blueprint||result);
      if(!readAfterWriteVerified){
        await env.DB.prepare(`UPDATE platform_data_entry_records SET commit_recovery_status='evidence_required',rejection_code='DATA_STUDIO_READ_AFTER_WRITE_REQUIRED',rejection_message='Canonical mutation returned, but independent read-after-write verification is pending.',updated_at=CURRENT_TIMESTAMP WHERE entry_id=?`).bind(entry.entry_id).run();
      }
      let auditStatus='complete';
      try{
        const completed=await completeCriticalAudit(env,auditEventId,{success:true});
        if(completed?.status&&completed.status!=='complete')auditStatus='pending_reconciliation';
      }catch(error){
        auditStatus='pending_reconciliation';
      }
      if(auditStatus!=='complete'){
        await env.DB.prepare(`UPDATE platform_data_entry_records SET commit_recovery_status='evidence_required',rejection_code=?,rejection_message=?,updated_at=CURRENT_TIMESTAMP WHERE entry_id=? AND status='committed'`).bind('DATA_STUDIO_AUDIT_COMPLETION_REQUIRED','Critical audit completion requires reconciliation.',entry.entry_id).run();
      }
      const finalEntry=await getDataEntry(env,entry.entry_id);
      const evidenceStatus=!readAfterWriteVerified||evidence.evidenceStatus==='pending_reconciliation'||auditStatus==='pending_reconciliation'?'pending_reconciliation':'complete';
      return {success:true,committed:true,verified:readAfterWriteVerified&&evidenceStatus==='complete',version:PLATFORM_DATA_STUDIO_VERSION,entry:finalEntry,result,resourceType,resourceId:canonicalId,revision:(current.record.revision||1)+1,reason,evidenceStatus,readAfterWriteVerified};
    }catch(error){
      try{await completeCriticalAudit(env,auditEventId,{success:false,errorCode:error?.code||'DATA_STUDIO_COMMIT_FAILED'});}catch{}
      throw error;
    }
  });
}
