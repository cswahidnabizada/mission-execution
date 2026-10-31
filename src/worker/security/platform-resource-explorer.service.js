/* ON Mission 12.2.0 — Super Admin Resource Explorer.
 * Read/graph projection over canonical authorities. It never becomes a second truth store.
 * Mutations are delegated to the existing Data Control / domain authorities.
 */
import {RELEASE_VERSION} from '../core/release.js';
import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';
import {listReusableData} from './platform-reusable-data.service.js';

export const PLATFORM_RESOURCE_EXPLORER_VERSION=`${RELEASE_VERSION}-resource-explorer`;
const clean=(v,max=240)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max);
const n=v=>Number(v||0);
async function one(env,sql,...a){return canonicalFirst(env,sql,a,'platform_resource_explorer')}
async function all(env,sql,...a){return canonicalAll(env,sql,a,'platform_resource_explorer')}
function like(q){return `%${clean(q,120).replace(/[%_]/g,'')}%`}
function node(type,id,label,status='UNKNOWN',metadata={}){return {id:`${type}:${id}`,type,key:String(id),label:clean(label,180),status:clean(status,80),metadata}}
function edge(from,to,relation,label,metadata={}){return {id:`${from.id}->${to.id}:${relation}`,from,to,relation,label:clean(label,180),metadata}}

const SEARCH_DOMAINS=Object.freeze([
  'tenant','user','mission','country','sector','product','launch','operation','subscription','billing','data_entry','configuration','ui','content','expansion','country_blueprint','product_country','language','currency','region','classification','policy','residency','retention','consent','role','capability','responsibility','storage','provider','component','page','feature','guidance','plan','eligibility','pricing','sector_lifecycle','translation_bundle','mission_plan','mission_plan_evaluation'
]);

export async function searchResourceExplorer(env,{q='',limit=30}={}){
  const query=clean(q,120); if(query.length<2)return {version:PLATFORM_RESOURCE_EXPLORER_VERSION,query,results:[],unavailableAuthorities:[]};
  const max=Math.min(50,Math.max(1,n(limit)||30)), s=like(query);
  const reads=await Promise.all([
    canonicalAll(env,`SELECT c.id,c.name,c.deletion_status,cmp.legal_name,cmp.trading_name,cmp.country_code,cmp.sector_code,cmp.status management_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.name LIKE ? OR COALESCE(cmp.legal_name,'') LIKE ? OR COALESCE(cmp.trading_name,'') LIKE ? ORDER BY c.id DESC LIMIT ?`,[s,s,s,max],'resource_search_tenants'),
    canonicalAll(env,`SELECT ai.id,ai.company_id,ai.login,ai.email,ai.display_name,ai.role,ai.active,c.name company_name FROM auth_identities ai JOIN companies c ON c.id=ai.company_id WHERE ai.login LIKE ? OR COALESCE(ai.email,'') LIKE ? OR COALESCE(ai.display_name,'') LIKE ? ORDER BY ai.id DESC LIMIT ?`,[s,s,s,max],'resource_search_users'),
    canonicalAll(env,`SELECT id,company_id,reference,status,country_code,sector_code,updated_at,created_at FROM missions WHERE reference LIKE ? OR country_code LIKE ? OR sector_code LIKE ? ORDER BY id DESC LIMIT ?`,[s,s,s,max],'resource_search_missions'),
    canonicalAll(env,`SELECT code,name,active FROM country_catalog WHERE code LIKE ? OR name LIKE ? ORDER BY name LIMIT ?`,[s,s,max],'resource_search_countries'),
    canonicalAll(env,`SELECT id,blueprint_id,sector_code,sector_name,status,updated_at FROM platform_country_product_sectors WHERE sector_code LIKE ? OR sector_name LIKE ? ORDER BY id DESC LIMIT ?`,[s,s,max],'resource_search_country_sectors'),
    canonicalAll(env,`SELECT id,product_key,name,country_code,sector_code,status,definition_version,updated_at FROM platform_product_definitions WHERE product_key LIKE ? OR name LIKE ? OR country_code LIKE ? OR sector_code LIKE ? ORDER BY id DESC LIMIT ?`,[s,s,s,s,max],'resource_search_products'),
    canonicalAll(env,`SELECT id,country_code,version,status,active,created_at,updated_at FROM country_product_launches WHERE country_code LIKE ? OR version LIKE ? OR status LIKE ? ORDER BY id DESC LIMIT ?`,[s,s,s,max],'resource_search_launches'),
    canonicalAll(env,`SELECT id,operation_key,action_code,resource_type,resource_id,status,scope_key,updated_at,created_at FROM platform_admin_operations WHERE operation_key LIKE ? OR action_code LIKE ? OR resource_type LIKE ? OR resource_id LIKE ? ORDER BY id DESC LIMIT ?`,[s,s,s,s,max],'resource_search_operations'),
    canonicalAll(env,`SELECT id,company_id,status,plan_id,created_at,updated_at FROM subscriptions WHERE CAST(id AS TEXT) LIKE ? OR CAST(company_id AS TEXT) LIKE ? OR status LIKE ? ORDER BY id DESC LIMIT ?`,[s,s,s,max],'resource_search_subscriptions'),
    canonicalAll(env,`SELECT id,company_id,status,created_at,updated_at FROM billing_identities WHERE CAST(id AS TEXT) LIKE ? OR CAST(company_id AS TEXT) LIKE ? OR status LIKE ? ORDER BY id DESC LIMIT ?`,[s,s,s,max],'resource_search_billing'),
    canonicalAll(env,`SELECT id,entry_id,entry_type,status,canonical_resource_type,canonical_resource_id,country_scope,updated_at,created_at FROM platform_data_entry_records WHERE entry_id LIKE ? OR entry_type LIKE ? OR canonical_resource_type LIKE ? OR COALESCE(canonical_resource_id,'') LIKE ? ORDER BY id DESC LIMIT ?`,[s,s,s,s,max],'resource_search_data_entry'),
    canonicalAll(env,`SELECT id,configuration_id,domain_code,config_key,version,status,updated_at,created_at FROM platform_configuration_versions WHERE configuration_id LIKE ? OR domain_code LIKE ? OR config_key LIKE ? OR version LIKE ? ORDER BY id DESC LIMIT ?`,[s,s,s,s,max],'resource_search_configuration'),
    canonicalAll(env,`SELECT c.id,c.definition_id,c.component_type,c.component_key,c.status,d.name product_name,d.country_code,d.sector_code FROM platform_product_definition_components c JOIN platform_product_definitions d ON d.id=c.definition_id WHERE c.component_key LIKE ? OR c.component_type LIKE ? OR c.payload_json LIKE ? ORDER BY c.id DESC LIMIT ?`,[s,s,s,max],'resource_search_components'),
    canonicalAll(env,`SELECT id,expansion_key,target_country_code,target_sector_code,status,stage,updated_at FROM platform_product_expansion_cases WHERE expansion_key LIKE ? OR target_country_code LIKE ? OR target_sector_code LIKE ? ORDER BY id DESC LIMIT ?`,[s,s,s,max],'resource_search_expansions'),
    canonicalAll(env,`SELECT mp.id,mp.company_id,mp.mission_id,mp.plan_key,mp.plan_hash,mp.status,mp.source_version,mp.created_at,mp.updated_at,m.reference mission_reference,m.country_code,m.sector_code FROM mission_plans mp JOIN missions m ON m.id=mp.mission_id AND m.company_id=mp.company_id WHERE mp.plan_key LIKE ? OR mp.plan_hash LIKE ? OR CAST(mp.mission_id AS TEXT) LIKE ? OR m.reference LIKE ? ORDER BY mp.id DESC LIMIT ?`,[s,s,s,s,max],'resource_search_mission_plans'),
    canonicalAll(env,`SELECT e.id,e.company_id,e.mission_id,e.plan_id,e.status,e.evaluation_hash,e.expires_at,e.created_at,mp.plan_key,m.reference mission_reference FROM mission_plan_evaluations e JOIN mission_plans mp ON mp.id=e.plan_id AND mp.company_id=e.company_id JOIN missions m ON m.id=e.mission_id AND m.company_id=e.company_id WHERE e.evaluation_hash LIKE ? OR CAST(e.plan_id AS TEXT) LIKE ? OR CAST(e.mission_id AS TEXT) LIKE ? OR m.reference LIKE ? ORDER BY e.id DESC LIMIT ?`,[s,s,s,s,max],'resource_search_mission_plan_evaluations')
  ]);
  const results=[];const unavailable=[];
  const add=(rows,type,map)=>{for(const r of rows||[])results.push(map(r))};
  add(reads[0],'tenant',r=>resource('tenant',r.id,r.legal_name||r.name,r.management_status||r.deletion_status,{country:r.country_code,sector:r.sector_code,workspace:'companies',authority:'Organization Lifecycle',actions:['MANAGE','EDIT','STOP','TRASH','PURGE']}));
  add(reads[1],'user',r=>resource('user',r.id,r.display_name||r.login,r.active?'active':'inactive',{company:r.company_name,role:r.role,workspace:'roles',authority:'Identity Authority',actions:['MANAGE','EDIT','STOP','TRASH','PURGE']}));
  add(reads[2],'mission',r=>resource('mission',r.id,r.reference||`Mission #${r.id}`,r.status,{companyId:r.company_id,country:r.country_code,sector:r.sector_code,workspace:'missions',authority:'Mission Authority',actions:['MANAGE','OPEN']}));
  add(reads[3],'country',r=>resource('country',r.code,r.name,r.active?'active':'inactive',{code:r.code,workspace:'countries',authority:'Country Product Foundation',actions:['MANAGE','EDIT','STOP','TRASH','PURGE']}));
  add(reads[4],'country_sector',r=>resource('country_sector',r.id,r.sector_name,r.status,{code:r.sector_code,blueprintId:r.blueprint_id,workspace:'product-publisher',authority:'Country Blueprint Sector Authority',actions:['MANAGE','OPEN']}));
  add(reads[5],'product',r=>resource('product',r.id,r.name||r.product_key,r.status,{country:r.country_code,sector:r.sector_code,version:r.definition_version,workspace:'product-publisher',authority:'Product Definition Authority',actions:['MANAGE','OPEN']}));
  add(reads[6],'launch',r=>resource('launch',r.id,`${r.country_code} · v${r.version}`,r.status,{country:r.country_code,active:Boolean(r.active),workspace:'launch-center',authority:'Country Product Launch Authority',actions:['MANAGE','OPEN']}));
  add(reads[7],'operation',r=>resource('operation',r.id,r.operation_key,r.status,{action:r.action_code,target:`${r.resource_type||''} ${r.resource_id||''}`.trim(),workspace:'operations',authority:'Platform Administrative Operation',actions:['MANAGE','OPEN']}));
  add(reads[8],'subscription',r=>resource('subscription',r.id,`Subscription #${r.id}`,r.status,{companyId:r.company_id,planId:r.plan_id,workspace:'subscriptions',authority:'Subscription Authority',actions:['MANAGE','OPEN']}));
  add(reads[9],'billing',r=>resource('billing',r.id,`Billing #${r.id}`,r.status,{companyId:r.company_id,workspace:'billing',authority:'Billing Authority',actions:['MANAGE','OPEN']}));
  add(reads[10],'data_entry',r=>resource('data_entry',r.entry_id,r.entry_id,r.status,{entryType:r.entry_type,canonicalType:r.canonical_resource_type,canonicalId:r.canonical_resource_id,country:r.country_scope,workspace:'data-entry',authority:'Data Entry Authority',actions:['MANAGE','OPEN']}));
  add(reads[11],'configuration',r=>resource('configuration',r.id,`${r.domain_code}:${r.config_key}`,r.status,{configurationId:r.configuration_id,version:r.version,workspace:'product-publisher',authority:'Configuration Authority',actions:['MANAGE','OPEN']}));
  add(reads[12],'component',r=>resource('component',r.id,`${r.component_type} · ${r.component_key}`,r.status,{definitionId:r.definition_id,product:r.product_name,country:r.country_code,sector:r.sector_code,workspace:'data-studio',authority:'Product Component Authority',actions:['MANAGE','OPEN','TRASH','PURGE']}));
  add(reads[13],'expansion',r=>resource('expansion',r.id,r.expansion_key,r.status,{country:r.target_country_code,sector:r.target_sector_code,stage:r.stage,workspace:'launch-center',authority:'Product Expansion Authority',actions:['MANAGE','OPEN','TRASH','PURGE']}));
  add(reads[14],'mission_plan',r=>resource('mission_plan',r.id,r.plan_key||`Mission Plan #${r.id}`,r.status,{companyId:r.company_id,missionId:r.mission_id,missionReference:r.mission_reference,country:r.country_code,sector:r.sector_code,planHash:r.plan_hash,workspace:'missions',authority:'Mission Planning Authority',actions:['OPEN']}));
  add(reads[15],'mission_plan_evaluation',r=>resource('mission_plan_evaluation',r.id,`Evaluation #${r.id} · ${r.mission_reference||r.mission_id}`,r.status,{companyId:r.company_id,missionId:r.mission_id,planId:r.plan_id,evaluationHash:r.evaluation_hash,expiresAt:r.expires_at,workspace:'missions',authority:'Mission Plan Evaluation Authority',actions:['OPEN']}));
  const reusable=await listReusableData(env,{q:query,limit:max});
  const reusableActions={
    // Expose quarantine only for types explicitly supported by platform-trash.service.
    // PURGE is intentionally not exposed as a direct resource action: it must be
    // initiated from the governed Trash record after dependency/provenance/hold checks.
    country_blueprint:['MANAGE','EDIT','TRASH'],product_country:['MANAGE','EDIT','STOP','TRASH'],sector:['MANAGE','EDIT','STOP','TRASH'],
    language:['MANAGE','EDIT','STOP','TRASH'],currency:['MANAGE','EDIT','STOP','TRASH'],region:['MANAGE','EDIT','STOP','TRASH'],classification:['MANAGE','EDIT','STOP','TRASH'],
    feature:['MANAGE','EDIT','STOP','TRASH'],guidance:['MANAGE','EDIT','STOP','TRASH'],eligibility:['MANAGE','EDIT','STOP','TRASH'],pricing:['MANAGE','EDIT','STOP','TRASH'],
    policy:['MANAGE','EDIT','TRASH'],residency:['MANAGE','EDIT','TRASH'],retention:['MANAGE','EDIT','TRASH'],consent:['MANAGE','EDIT','TRASH'],role:['MANAGE','EDIT','TRASH'],capability:['MANAGE','EDIT','TRASH'],responsibility:['MANAGE','EDIT','TRASH'],
    storage:['MANAGE','EDIT','TRASH'],provider:['MANAGE','EDIT','TRASH'],component:['MANAGE','EDIT','TRASH'],page:['MANAGE','EDIT','TRASH'],configuration:['MANAGE','EDIT','TRASH'],sector_lifecycle:['MANAGE','EDIT'],translation_bundle:['MANAGE','EDIT'],plan:['MANAGE','EDIT','TRASH']
  };
  for(const [type,list] of Object.entries(reusable.data||{})) for(const r of (Array.isArray(list)?list:[])){if(!reusableMatches(r,query))continue;const id=String(r.code??r.role_code??r.id??'');if(!id)continue;results.push(resource(type,id,r.name||r.label||r.title||r.code||`${type} ${id}`,r.status??(r.active===0?'inactive':'active'),{code:r.code||r.role_code,authority:({country_blueprint:'countryProductBlueprintAuthority',product_country:'productCountryCatalog',sector:'sectorCatalog',language:'languageCatalog',currency:'currencyCatalog',region:'regionCatalog',classification:'classificationCatalog',policy:'policyCatalog',residency:'policyCatalog',retention:'policyCatalog',consent:'consentPolicyAuthority',role:'organizationRoleCatalog',capability:'canonicalCapabilityRegistry',responsibility:'responsibilityCatalog',storage:'storageCatalog',provider:'externalProviderRegistry',component:'productComponentAuthority',page:'pageCatalog',feature:'featureCatalog',configuration:'platformConfigurationAuthority',sector_lifecycle:'platformConfigurationAuthority',translation_bundle:'platformConfigurationAuthority',guidance:'guidanceCatalog',plan:'subscriptionPlanAuthority',eligibility:'eligibilityCatalog',pricing:'pricingCatalog'})[type]||type,actions:reusableActions[type]||['MANAGE','EDIT']}));}
  const deduped=[...new Map(results.map(r=>[`${r.type}:${r.id}`,r])).values()];
  return {version:PLATFORM_RESOURCE_EXPLORER_VERSION,query,results:deduped.slice(0,max),unavailableAuthorities:unavailable.concat(reusable.projectionErrors||[]),domains:SEARCH_DOMAINS};
}
function resource(type,id,name,status,meta){return {type,id:String(id),name:clean(name,180),status:clean(status||'UNKNOWN',80),subtitle:Object.entries(meta||{}).filter(([k,v])=>v!=null&&['workspace','authority','actions'].indexOf(k)<0).map(([k,v])=>`${k}: ${v}`).join(' · '),workspace:meta.workspace,authority:meta.authority,actions:meta.actions||[],meta:meta||{}}}
const reusableSearchFields=['name','label','title','code','role_code','description','domain_code','country_code','country_name','provider_code','config_key','product_key','component_key','entry_id','purpose_code'];
function reusableMatches(row,q){const needle=String(q||'').toLowerCase();return reusableSearchFields.some(k=>{const v=row?.[k];return v!=null&&String(v).toLowerCase().includes(needle);});}

async function readReusableExact(env,type,id){
 const key=String(id);
 // Detail reads are deliberately direct canonical reads. Search/list projections are not
 // re-used as a second authority because a resource already selected by search must have
 // one deterministic detail reader. This also prevents projection-readiness differences
 // from turning a valid search hit into a generic 500 in the workspace.
 const readers={
  country_blueprint:['SELECT b.id,b.country_code,c.name country_name,b.name,b.default_language_code,b.status,b.created_at,b.updated_at FROM platform_country_product_blueprints b JOIN platform_product_country_catalog c ON c.code=b.country_code WHERE b.id=?',n(id)],
  product_country:['SELECT code,name,active,requires_review,default_subscription_class,created_at,updated_at FROM platform_product_country_catalog WHERE code=?',key.toUpperCase()],
  sector:['SELECT code,name,description,active,created_at,updated_at,data_entry_id FROM platform_reusable_sectors WHERE code=?',key],
  language:['SELECT code,name,active,created_at,updated_at,data_entry_id FROM platform_reusable_languages WHERE code=?',key.toLowerCase()],
  currency:['SELECT code,name,symbol,active,created_at,updated_at,data_entry_id FROM platform_reusable_currencies WHERE code=?',key.toUpperCase()],
  region:['SELECT code,name,country_code,active,created_at,updated_at,data_entry_id FROM platform_reusable_regions WHERE code=?',key],
  classification:['SELECT code,name,domain,active,created_at,updated_at,data_entry_id FROM platform_reusable_classifications WHERE code=?',key],
  policy:['SELECT code,name,policy_type,scope,configuration_json,active,created_at,updated_at,data_entry_id FROM platform_reusable_policies WHERE code=? AND policy_type=?',key,'policy'],
  residency:['SELECT code,name,policy_type,scope,configuration_json,active,created_at,updated_at,data_entry_id FROM platform_reusable_policies WHERE code=? AND policy_type=?',key,'residency'],
  retention:['SELECT code,name,policy_type,scope,configuration_json,active,created_at,updated_at,data_entry_id FROM platform_reusable_policies WHERE code=? AND policy_type=?',key,'retention'],
  consent:['SELECT id,country_code,purpose_code,policy_version,title,policy_text,require_consent,withdrawal_effect,active,created_at,updated_at FROM consent_policy_versions WHERE id=?',n(id)],
  role:['SELECT role_code code,label name,description,scope_type,active,system_managed,created_at,updated_at FROM organization_role_catalog WHERE role_code=?',key],
  capability:['SELECT code,label name,domain_code,description,status,version,created_at,updated_at FROM canonical_capability_registry WHERE code=?',key],
  responsibility:['SELECT code,name,role_code,description,active,created_at,updated_at,data_entry_id FROM platform_reusable_responsibilities WHERE code=?',key],
  storage:['SELECT code,name,provider_code,region_code,purpose,residency_mode,active,created_at,updated_at,data_entry_id FROM platform_storage_registry WHERE code=?',key],
  provider:['SELECT id,code,name,provider_type,country_code,region_code,contract_status,active,version,data_entry_id FROM external_provider_registry WHERE code=? OR id=? LIMIT 1',key,n(id)],
  component:['SELECT c.id,c.definition_id,c.component_type,c.component_key,c.status,c.created_at,c.updated_at,d.product_key,d.country_code,d.sector_code FROM platform_product_definition_components c JOIN platform_product_definitions d ON d.id=c.definition_id WHERE c.id=?',n(id)],
  page:['SELECT id,code,name,page_type,language_code,country_code,status,updated_at FROM platform_reusable_pages WHERE id=? OR code=? LIMIT 1',n(id),key],
  feature:['SELECT code,name,description,active,created_at,updated_at,data_entry_id FROM platform_reusable_features WHERE code=?',key],
  configuration:['SELECT id,domain_code,config_key,version,status,active,created_at,updated_at,payload_json FROM platform_configuration_versions WHERE id=?',n(id)],
  sector_lifecycle:[`SELECT id,domain_code,config_key,version,status,active,created_at,updated_at,payload_json FROM platform_configuration_versions WHERE id=? AND domain_code='mission.lifecycle'`,n(id)],
  translation_bundle:[`SELECT id,domain_code,config_key,version,status,active,created_at,updated_at,payload_json FROM platform_configuration_versions WHERE id=? AND domain_code='i18n.catalog'`,n(id)],
  guidance:['SELECT code,name,body,language_code,active,created_at,updated_at,data_entry_id FROM platform_reusable_guidance WHERE code=?',key],
  plan:['SELECT p.id,p.code,p.name,p.active,pc.price_minor,pc.currency,pc.billing_interval FROM plans p LEFT JOIN plan_product_configuration pc ON pc.plan_id=p.id WHERE p.id=? OR p.code=? LIMIT 1',n(id),key],
  mission_plan:['SELECT mp.id,mp.company_id,mp.mission_id,mp.plan_key,mp.context_hash,mp.state_token,mp.objective_json,mp.plan_json,mp.plan_hash,mp.status,mp.source_version,mp.created_at,mp.updated_at,mp.expires_at,m.reference mission_reference,m.country_code,m.sector_code FROM mission_plans mp JOIN missions m ON m.id=mp.mission_id AND m.company_id=mp.company_id WHERE mp.id=?',n(id)],
  mission_plan_evaluation:['SELECT e.id,e.company_id,e.mission_id,e.plan_id,e.plan_hash,e.context_hash,e.state_token,e.status,e.evaluation_hash,e.findings_json,e.evidence_json,e.decision_json,e.source_version,e.expires_at,e.created_at,mp.plan_key,m.reference mission_reference FROM mission_plan_evaluations e JOIN mission_plans mp ON mp.id=e.plan_id AND mp.company_id=e.company_id JOIN missions m ON m.id=e.mission_id AND m.company_id=e.company_id WHERE e.id=?',n(id)],
  eligibility:['SELECT code,name,rule_json,active,created_at,updated_at,data_entry_id FROM platform_reusable_eligibility WHERE code=?',key],
  pricing:['SELECT code,name,currency,price_minor,billing_interval,active,created_at,updated_at,data_entry_id FROM platform_reusable_pricing WHERE code=?',key]
 };
 const spec=readers[type]; if(!spec)return null;
 return one(env,spec[0],...spec.slice(1));
}

async function baseResource(env,type,id){
 const key=String(id);
 if(type==='tenant'){const r=await one(env,`SELECT c.id,c.name,c.deletion_status,c.created_at,cmp.legal_name,cmp.trading_name,cmp.country_code,cmp.sector_code,cmp.status management_status,cmp.compliance_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.id=?`,n(id));return r&&resource('tenant',r.id,r.legal_name||r.name,r.management_status||r.deletion_status,{country:r.country_code,sector:r.sector_code,authority:'Organization Lifecycle',workspace:'companies',actions:['MANAGE','EDIT','STOP','TRASH','PURGE'],record:r})}
 if(type==='user'){const r=await one(env,`SELECT ai.id,ai.company_id,ai.login,ai.email,ai.display_name,ai.role,ai.active,ai.created_at,ai.updated_at,c.name company_name FROM auth_identities ai JOIN companies c ON c.id=ai.company_id WHERE ai.id=?`,n(id));return r&&resource('user',r.id,r.display_name||r.login,r.active?'active':'inactive',{companyId:r.company_id,company:r.company_name,authority:'Identity Authority',workspace:'roles',actions:['MANAGE','EDIT','STOP','TRASH','PURGE'],record:r})}
 if(type==='mission'){const r=await one(env,`SELECT * FROM missions WHERE id=?`,n(id));return r&&resource('mission',r.id,r.reference||`Mission #${r.id}`,r.status,{companyId:r.company_id,country:r.country_code,sector:r.sector_code,authority:'Mission Authority',workspace:'missions',actions:['MANAGE','OPEN'],record:r})}
 if(type==='country'){const r=await one(env,`SELECT * FROM country_catalog WHERE code=?`,key.toUpperCase());return r&&resource('country',r.code,r.name,r.active?'active':'inactive',{authority:'Country Product Foundation',workspace:'countries',actions:['MANAGE','EDIT','STOP','TRASH','PURGE'],record:r})}
 if(type==='country_sector'){const r=await one(env,`SELECT * FROM platform_country_product_sectors WHERE id=?`,n(id));return r&&resource('country_sector',r.id,r.sector_name,r.status,{code:r.sector_code,blueprintId:r.blueprint_id,authority:'Country Blueprint Sector Authority',workspace:'product-publisher',actions:['MANAGE','OPEN'],record:r})}
 const reusableTypes=new Set(['country_blueprint','product_country','sector','language','currency','region','classification','policy','residency','retention','consent','role','capability','responsibility','storage','provider','component','page','feature','configuration','guidance','plan','eligibility','pricing']);
 if(reusableTypes.has(type)){const r=await readReusableExact(env,type,id);if(!r)return null;const rid=String(r.code??r.role_code??r.id);const authority=({country_blueprint:'countryProductBlueprintAuthority',product_country:'productCountryCatalog',sector:'sectorCatalog',language:'languageCatalog',currency:'currencyCatalog',region:'regionCatalog',classification:'classificationCatalog',policy:'policyCatalog',residency:'policyCatalog',retention:'policyCatalog',consent:'consentPolicyAuthority',role:'organizationRoleCatalog',capability:'canonicalCapabilityRegistry',responsibility:'responsibilityCatalog',storage:'storageCatalog',provider:'externalProviderRegistry',component:'productComponentAuthority',page:'pageCatalog',feature:'featureCatalog',configuration:'platformConfigurationAuthority',sector_lifecycle:'platformConfigurationAuthority',translation_bundle:'platformConfigurationAuthority',guidance:'guidanceCatalog',plan:'subscriptionPlanAuthority',eligibility:'eligibilityCatalog',pricing:'pricingCatalog'})[type]||type;const stoppableTypes=new Set(['country_blueprint','product_country','sector','language','currency','region','classification','policy','residency','retention','consent','role','capability','responsibility','storage','provider','component','page','feature','configuration','guidance','plan','eligibility','pricing']);const actions=['MANAGE','EDIT',...(stoppableTypes.has(type)?['STOP']:[])]; /* Stop is exposed only where the canonical Data Control authority implements it. Trash/purge stay unavailable until a type-specific dependency-safe deletion contract exists. */ return resource(type,rid,r.name||r.label||r.title||r.code||`${type} ${rid}`,r.status??(r.active===0?'inactive':'active'),{authority,workspace:'data-studio',actions,record:r});}
 if(type==='product'){const r=await one(env,`SELECT * FROM platform_product_definitions WHERE id=?`,n(id));return r&&resource('product',r.id,r.name||r.product_key,r.status,{country:r.country_code,sector:r.sector_code,authority:'Product Definition Authority',workspace:'product-publisher',actions:['MANAGE','OPEN'],record:r})}
 if(type==='launch'){const r=await one(env,`SELECT * FROM country_product_launches WHERE id=?`,n(id));return r&&resource('launch',r.id,`${r.country_code} · v${r.version}`,r.status,{country:r.country_code,authority:'Country Product Launch Authority',workspace:'launch-center',actions:['MANAGE','OPEN'],record:r})}
 if(type==='operation'){const r=await one(env,`SELECT * FROM platform_admin_operations WHERE id=?`,n(id));return r&&resource('operation',r.id,r.operation_key,r.status,{authority:'Platform Administrative Operation',workspace:'operations',actions:['MANAGE','OPEN'],record:r})}
 if(type==='subscription'){const r=await one(env,`SELECT * FROM subscriptions WHERE id=?`,n(id));return r&&resource('subscription',r.id,`Subscription #${r.id}`,r.status,{companyId:r.company_id,authority:'Subscription Authority',workspace:'subscriptions',actions:['MANAGE','OPEN'],record:r})}
 if(type==='billing'){const r=await one(env,`SELECT * FROM billing_identities WHERE id=?`,n(id));return r&&resource('billing',r.id,`Billing #${r.id}`,r.status,{companyId:r.company_id,authority:'Billing Authority',workspace:'billing',actions:['MANAGE','OPEN'],record:r})}
 if(type==='data_entry'){const r=await one(env,`SELECT * FROM platform_data_entry_records WHERE entry_id=?`,key);return r&&resource('data_entry',r.entry_id,r.entry_id,r.status,{canonicalType:r.canonical_resource_type,canonicalId:r.canonical_resource_id,authority:'Data Entry Authority',workspace:'data-entry',actions:['MANAGE','OPEN'],record:r})}
 if(type==='configuration'){const r=await one(env,`SELECT * FROM platform_configuration_versions WHERE id=?`,n(id));return r&&resource('configuration',r.id,`${r.domain_code}:${r.config_key}`,r.status,{authority:'Configuration Authority',workspace:'product-publisher',actions:['MANAGE','OPEN'],record:r})}
 if(type==='sector_lifecycle'||type==='translation_bundle'){const domain=type==='sector_lifecycle'?'mission.lifecycle':'i18n.catalog';const r=await one(env,`SELECT * FROM platform_configuration_versions WHERE id=? AND domain_code=?`,n(id),domain);if(!r)return null;const payload=(()=>{try{return JSON.parse(r.payload_json||'{}')}catch{return {}}})();return resource(type,r.id,r.config_key,r.status,{authority:'platformConfigurationAuthority',workspace:'data-studio',sectorCode:payload.sectorCode||null,localeCode:payload.localeCode||null,fallbackLocale:payload.fallbackLocale||null,version:r.version,record:r})}
 if(type==='component'){const r=await one(env,`SELECT c.*,d.name product_name,d.country_code,d.sector_code FROM platform_product_definition_components c JOIN platform_product_definitions d ON d.id=c.definition_id WHERE c.id=?`,n(id));return r&&resource('component',r.id,`${r.component_type} · ${r.component_key}`,r.status,{definitionId:r.definition_id,product:r.product_name,country:r.country_code,sector:r.sector_code,authority:'Product Component Authority',workspace:'data-studio',actions:['MANAGE','OPEN','TRASH','PURGE'],record:r})}
 if(type==='expansion'){const r=await one(env,`SELECT * FROM platform_product_expansion_cases WHERE id=?`,n(id));return r&&resource('expansion',r.id,r.expansion_key,r.status,{country:r.target_country_code,sector:r.target_sector_code,authority:'Product Expansion Authority',workspace:'launch-center',actions:['MANAGE','OPEN','TRASH','PURGE'],record:r})}
 if(type==='mission_plan'){const r=await one(env,`SELECT mp.id,mp.company_id,mp.mission_id,mp.plan_key,mp.context_hash,mp.state_token,mp.objective_json,mp.plan_json,mp.plan_hash,mp.status,mp.source_version,mp.created_at,mp.updated_at,mp.expires_at,m.reference mission_reference,m.country_code,m.sector_code FROM mission_plans mp JOIN missions m ON m.id=mp.mission_id AND m.company_id=mp.company_id WHERE mp.id=?`,n(id));return r&&resource('mission_plan',r.id,r.plan_key||`Mission Plan #${r.id}`,r.status,{companyId:r.company_id,missionId:r.mission_id,missionReference:r.mission_reference,country:r.country_code,sector:r.sector_code,authority:'Mission Planning Authority',workspace:'missions',actions:['OPEN'],record:r})}
 if(type==='mission_plan_evaluation'){const r=await one(env,`SELECT e.id,e.company_id,e.mission_id,e.plan_id,e.plan_hash,e.context_hash,e.state_token,e.status,e.evaluation_hash,e.findings_json,e.evidence_json,e.decision_json,e.source_version,e.expires_at,e.created_at,mp.plan_key,m.reference mission_reference FROM mission_plan_evaluations e JOIN mission_plans mp ON mp.id=e.plan_id AND mp.company_id=e.company_id JOIN missions m ON m.id=e.mission_id AND m.company_id=e.company_id WHERE e.id=?`,n(id));return r&&resource('mission_plan_evaluation',r.id,`Evaluation #${r.id} · ${r.mission_reference||r.mission_id}`,r.status,{companyId:r.company_id,missionId:r.mission_id,planId:r.plan_id,evaluationHash:r.evaluation_hash,expiresAt:r.expires_at,authority:'Mission Plan Evaluation Authority',workspace:'missions',actions:['OPEN'],record:r})}
 return null;
}

async function tenantGraph(env,id){
 const root=await baseResource(env,'tenant',id);if(!root)throw Object.assign(new Error('RESOURCE_NOT_FOUND'),{status:404,code:'RESOURCE_NOT_FOUND'});
 const rootNode=node('tenant',id,root.name,root.status);
 const rows=[
  ['user','Users','auth_identities','company_id',`SELECT id,display_name,login,active FROM auth_identities WHERE company_id=? ORDER BY id LIMIT 100`,r=>node('user',r.id,r.display_name||r.login,r.active?'active':'inactive')],
  ['mission','Missions','missions','company_id',`SELECT id,reference,status FROM missions WHERE company_id=? ORDER BY id LIMIT 100`,r=>node('mission',r.id,r.reference||`Mission #${r.id}`,r.status)],
  ['file','Mission files','mission_files','company_id',`SELECT id,status FROM mission_files WHERE company_id=? ORDER BY id LIMIT 100`,r=>node('file',r.id,`Mission file #${r.id}`,r.status||'linked')],
  ['subscription','Subscriptions','subscriptions','company_id',`SELECT id,status FROM subscriptions WHERE company_id=? ORDER BY id LIMIT 100`,r=>node('subscription',r.id,`Subscription #${r.id}`,r.status)],
  ['billing','Billing identities','billing_identities','company_id',`SELECT id,status FROM billing_identities WHERE company_id=? ORDER BY id LIMIT 100`,r=>node('billing',r.id,`Billing #${r.id}`,r.status)]
 ];
 const nodes=[rootNode],edges=[],unavailableAuthorities=[];
 for(const [type,label,,col,sql,map] of rows){
  let rs=[];
  try{rs=await all(env,sql,id)}catch(error){
   unavailableAuthorities.push({type,label,authority:`${type}_authority`,status:'AUTHORITY_UNAVAILABLE',code:error?.code||'AUTHORITY_UNAVAILABLE'});
   continue;
  }
  for(const r of rs){const child=map(r);nodes.push(child);edges.push(edge(rootNode,child,'contains',label));}
 }
 return {root:rootNode,nodes,edges,unavailableAuthorities,completeness:unavailableAuthorities.length?'DEGRADED':'COMPLETE',summary:{directDependencies:nodes.length-1,blockedBy:unavailableAuthorities.length,dependents:nodes.length-1}};
}

async function userGraph(env,id){
 const root=await baseResource(env,'user',id);if(!root)throw Object.assign(new Error('RESOURCE_NOT_FOUND'),{status:404,code:'RESOURCE_NOT_FOUND'});
 const rootNode=node('user',id,root.name,root.status),nodes=[rootNode],edges=[];
 const company=await one(env,`SELECT c.id,c.name,c.deletion_status FROM auth_identities ai JOIN companies c ON c.id=ai.company_id WHERE ai.id=?`,n(id));
 if(company){const cn=node('tenant',company.id,company.name,company.deletion_status);nodes.push(cn);edges.push(edge(rootNode,cn,'member_of','Organization'))}
 const pu=await all(env,`SELECT id,account_state FROM platform_users WHERE principal_type='tenant' AND principal_id=? ORDER BY id`,n(id));
 for(const r of pu){const pn=node('platform_user',r.id,`Platform user #${r.id}`,r.account_state);nodes.push(pn);edges.push(edge(rootNode,pn,'projects_to','Platform identity'));
  const roles=await all(env,`SELECT pur.id,pur.role_code FROM platform_user_roles pur WHERE pur.platform_user_id=?`,r.id);for(const rr of roles){const rn=node('role',`${r.id}:${rr.id}`,rr.role_code,'assigned');nodes.push(rn);edges.push(edge(pn,rn,'has_role','Role'))}
 }
 const ver=await all(env,`SELECT id,review_status FROM verification_profiles WHERE identity_type='tenant' AND identity_id=?`,n(id));for(const r of ver){const vn=node('verification',r.id,`Verification #${r.id}`,r.review_status);nodes.push(vn);edges.push(edge(rootNode,vn,'verified_by','Verification'))}
 return {root:rootNode,nodes,edges,summary:{directDependencies:nodes.length-1,blockedBy:0,dependents:company?1:0}};
}

async function genericGraph(env,type,id,root){
 const rootNode=node(type,id,root.name,root.status),nodes=[rootNode],edges=[];
 if(type==='sector_lifecycle'&&root.meta.sectorCode){const sector=await baseResource(env,'sector',root.meta.sectorCode);if(sector){const sn=node('sector',sector.id,sector.name,sector.status);nodes.push(sn);edges.push(edge(sn,rootNode,'defines_lifecycle','Sector lifecycle'));}}
 if(type==='translation_bundle'&&root.meta.fallbackLocale){const fallback=await one(env,'SELECT code,name,active FROM platform_reusable_languages WHERE code=? LIMIT 1',String(root.meta.fallbackLocale).toLowerCase());if(fallback){const ln=node('language',fallback.code,fallback.name,Number(fallback.active)===1?'active':'inactive');nodes.push(ln);edges.push(edge(ln,rootNode,'fallback_locale','Translation fallback'));}}
 if(type==='product'){
  const comps=await all(env,`SELECT id,component_key,status,component_type FROM platform_product_definition_components WHERE definition_id=? ORDER BY id LIMIT 100`,n(id));for(const r of comps){const x=node('component',r.id,`${r.component_type} · ${r.component_key}`,r.status);nodes.push(x);edges.push(edge(rootNode,x,'contains','Product components'));}
  const launches=await all(env,`SELECT id,country_code,version,status FROM country_product_launches WHERE version IS NOT NULL AND country_code=? ORDER BY id LIMIT 100`,root.meta.country||'');for(const r of launches){const x=node('launch',r.id,`${r.country_code} · v${r.version}`,r.status);nodes.push(x);edges.push(edge(rootNode,x,'used_by','Country product launches'));}
 }
 if(type==='launch'){
  const graphRows=await all(env,`SELECT e.id,e.relation,fn.node_type from_node_type,fn.node_key from_node_key,fn.label from_label,fn.status from_status,tn.node_type to_node_type,tn.node_key to_node_key,tn.label to_label,tn.status to_status FROM platform_product_dependency_edges e JOIN platform_product_dependency_nodes fn ON fn.id=e.from_node_id JOIN platform_product_dependency_nodes tn ON tn.id=e.to_node_id WHERE e.launch_id=? ORDER BY e.id LIMIT 200`,n(id));
  for(const r of graphRows){const a=node(r.from_node_type,r.from_node_key,r.from_label||r.from_node_key,r.from_status),b=node(r.to_node_type,r.to_node_key,r.to_label||r.to_node_key,r.to_status);nodes.push(a,b);edges.push(edge(a,b,r.relation,r.relation));}
 }
 if(type==='data_entry' && root.meta.canonicalId){const x=await baseResource(env,String(root.meta.canonicalType||'').replace('product_definition','product'),root.meta.canonicalId);if(x){const cn=node(x.type,x.id,x.name,x.status);nodes.push(cn);edges.push(edge(rootNode,cn,'materializes','Canonical resource'));}}
 if(type==='component' && root.meta.definitionId){const p=await baseResource(env,'product',root.meta.definitionId);if(p){const pn=node('product',p.id,p.name,p.status);nodes.push(pn);edges.push(edge(pn,rootNode,'contains','Product component'));}}
 if(type==='subscription'&&root.meta.companyId){const c=await baseResource(env,'tenant',root.meta.companyId);if(c){const cn=node('tenant',c.id,c.name,c.status);nodes.push(cn);edges.push(edge(cn,rootNode,'owns','Subscription'));}}
 if(type==='billing'&&root.meta.companyId){const c=await baseResource(env,'tenant',root.meta.companyId);if(c){const cn=node('tenant',c.id,c.name,c.status);nodes.push(cn);edges.push(edge(cn,rootNode,'owns','Billing'));}}
 if(type==='mission_plan'){const m=await baseResource(env,'mission',root.meta.missionId);if(m){const mn=node('mission',m.id,m.name,m.status);nodes.push(mn);edges.push(edge(mn,rootNode,'has_plan','Mission plan'));}const es=await all(env,`SELECT id,status FROM mission_plan_evaluations WHERE company_id=? AND mission_id=? AND plan_id=? ORDER BY id DESC LIMIT 20`,root.meta.companyId,root.meta.missionId,n(id));for(const e of es){const en=node('mission_plan_evaluation',e.id,`Evaluation #${e.id}`,e.status);nodes.push(en);edges.push(edge(rootNode,en,'evaluated_by','Plan evaluation'));}}
 if(type==='mission_plan_evaluation'){const p=await baseResource(env,'mission_plan',root.meta.planId);if(p){const pn=node('mission_plan',p.id,p.name,p.status);nodes.push(pn);edges.push(edge(pn,rootNode,'has_evaluation','Plan evaluation'));}const m=await baseResource(env,'mission',root.meta.missionId);if(m){const mn=node('mission',m.id,m.name,m.status);nodes.push(mn);edges.push(edge(mn,rootNode,'evaluated_for','Mission'));}}
 return {root:rootNode,nodes:[...new Map(nodes.map(x=>[x.id,x])).values()],edges:[...new Map(edges.map(x=>[x.id,x])).values()],summary:{directDependencies:Math.max(0,nodes.length-1),blockedBy:0,dependents:0}};
}


export async function listRecentResourceExplorer(env,{limit=24}={}){
  const max=Math.min(60,Math.max(1,n(limit)||24));
  const out=[];
  const push=(type,row,name,status,id,updatedAt,subtitle)=>{if(id==null)return;out.push({type,id:String(id),name:clean(name||`${type} ${id}`,180),status:clean(status||'UNKNOWN',80),updatedAt:updatedAt||null,subtitle:clean(subtitle||type,180)});};
  const sources=[
    ['organizations',()=>all(env,`SELECT c.id,c.name,c.deletion_status AS status,COALESCE(cmp.updated_at,c.created_at) AS updated_at,c.created_at FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id ORDER BY COALESCE(cmp.updated_at,c.created_at) DESC,c.id DESC LIMIT ?`,max)],
    ['missions',()=>all(env,`SELECT id,reference,status,updated_at,created_at,country_code,sector_code FROM missions ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT ?`,max)],
    ['products',()=>all(env,`SELECT id,product_key,name,status,updated_at,created_at,country_code,sector_code FROM platform_product_definitions ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT ?`,max)],
    ['market_launches',()=>all(env,`SELECT id,country_code,version,status,updated_at,created_at FROM country_product_launches ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT ?`,max)],
    ['admin_operations',()=>all(env,`SELECT id,operation_key,status,updated_at,created_at FROM platform_admin_operations ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT ?`,max)],
    ['subscriptions',()=>all(env,`SELECT id,status,updated_at,created_at FROM subscriptions ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT ?`,max)],
    ['billing',()=>all(env,`SELECT id,status,updated_at,created_at FROM billing_identities ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT ?`,max)],
    ['reusable_data',()=>listReusableData(env,{limit:max})],
    ['mission_plans',()=>all(env,`SELECT id,plan_key,status,updated_at,created_at,mission_id FROM mission_plans ORDER BY COALESCE(updated_at,created_at) DESC,id DESC LIMIT ?`,max)],
    ['plan_evaluations',()=>all(env,`SELECT id,status,created_at,mission_id,plan_id FROM mission_plan_evaluations ORDER BY created_at DESC,id DESC LIMIT ?`,max)]
  ];
  // A failed source must not erase all healthy inventory, but must be explicitly reported.
  // No fallback authority is queried and partial results are never represented as complete.
  const settled=await Promise.allSettled(sources.map(([,read])=>read()));
  const unavailableAuthorities=[];
  const values=settled.map((result,index)=>{if(result.status==='fulfilled')return result.value;unavailableAuthorities.push({authority:sources[index][0],code:clean(result.reason?.code||result.reason?.message||'AUTHORITY_UNAVAILABLE',120)});return index===7?{data:{}}:[];});
  const [companies,missions,products,launches,operations,subscriptions,billing,reusable,plans,evaluations]=values;
  for(const r of companies)push('tenant',r,r.name,r.status,r.id,r.updated_at||r.created_at,'Organization');
  for(const r of missions)push('mission',r,r.reference||`Mission #${r.id}`,r.status,r.id,r.updated_at||r.created_at,`Mission · ${r.country_code||'—'} · ${r.sector_code||'—'}`);
  for(const r of products)push('product',r,r.name||r.product_key,r.status,r.id,r.updated_at||r.created_at,`Product · ${r.country_code||'—'} · ${r.sector_code||'—'}`);
  for(const r of launches)push('launch',r,`${r.country_code||'—'} · v${r.version||'—'}`,r.status,r.id,r.updated_at||r.created_at,'Product Launch');
  for(const r of operations)push('operation',r,r.operation_key||`Operation #${r.id}`,r.status,r.id,r.updated_at||r.created_at,'Administrative Operation');
  for(const r of subscriptions)push('subscription',r,`Subscription #${r.id}`,r.status,r.id,r.updated_at||r.created_at,'Subscription');
  for(const r of billing)push('billing',r,`Billing #${r.id}`,r.status,r.id,r.updated_at||r.created_at,'Billing');
  for(const [type,list] of Object.entries(reusable.data||{}))for(const r of (Array.isArray(list)?list:[])){const id=r.id??r.code??r.role_code;if(id!=null)push(type,r,r.name||r.label||r.code||`${type} ${id}`,r.status??(r.active===0?'inactive':'active'),id,r.updated_at||r.created_at,labelForRecent(type));}
  for(const r of (plans||[]))push('mission_plan',r,r.plan_key||`Mission Plan #${r.id}`,r.status,r.id,r.updated_at||r.created_at,`Mission Plan · mission ${r.mission_id}`);
  for(const r of (evaluations||[]))push('mission_plan_evaluation',r,`Evaluation #${r.id}`,r.status,r.id,r.created_at,`Plan Evaluation · plan ${r.plan_id}`);
  out.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  return {version:PLATFORM_RESOURCE_EXPLORER_VERSION,resources:out.slice(0,max),inventoryState:unavailableAuthorities.length?'PARTIAL':'COMPLETE',unavailableAuthorities};
}
function labelForRecent(type){return clean(String(type||'resource').replaceAll('_',' '),120);}

export async function getResourceExplorer(env,{resourceType,resourceId}={}){
 const root=await baseResource(env,clean(resourceType,60),resourceId);if(!root)throw Object.assign(new Error('RESOURCE_NOT_FOUND'),{status:404,code:'RESOURCE_NOT_FOUND'});
 const graph=root.type==='tenant'?await tenantGraph(env,resourceId):root.type==='user'?await userGraph(env,resourceId):await genericGraph(env,root.type,resourceId,root);
 // Merge governed platform relationship edges into the existing read-only Asset 360 graph.
 // The relationship table is additive evidence; domain-owned graph edges remain untouched.
 try{
  const relationType=root.type==='product'?'product_definition':root.type;
  const rows=await all(env,`SELECT from_resource_type,from_resource_id,to_resource_type,to_resource_id,relation_type,status,reason,updated_at FROM platform_resource_relationships WHERE status='active' AND ((from_resource_type=? AND from_resource_id=?) OR (to_resource_type=? AND to_resource_id=?)) ORDER BY id DESC LIMIT 500`,relationType,String(resourceId),relationType,String(resourceId));
  const nodes=new Map((graph.nodes||[]).map(x=>[x.id,x])),edges=new Map((graph.edges||[]).map(x=>[x.id,x]));
  for(const row of rows){
   const fromType=row.from_resource_type==='product_definition'?'product':row.from_resource_type;
   const toType=row.to_resource_type==='product_definition'?'product':row.to_resource_type;
   const from=node(fromType,row.from_resource_id,`${fromType} ${row.from_resource_id}`);
   const to=node(toType,row.to_resource_id,`${toType} ${row.to_resource_id}`);
   nodes.set(from.id,from);nodes.set(to.id,to);
   const e=edge(from,to,row.relation_type,row.reason,{source:'platform_resource_relationships',updatedAt:row.updated_at});
   edges.set(e.id,e);
  }
  graph.nodes=[...nodes.values()];graph.edges=[...edges.values()];
  graph.summary={...(graph.summary||{}),directDependencies:Math.max(0,graph.nodes.length-1),persistedRelationshipCount:rows.length};
 }catch(error){
  graph.unavailableAuthorities=[...(graph.unavailableAuthorities||[]),{type:'resource_relationships',authority:'Canonical Resource Relationship Engine',status:'AUTHORITY_UNAVAILABLE',code:error?.code||'RESOURCE_RELATIONSHIP_STORAGE_UNAVAILABLE'}];
  graph.completeness='DEGRADED';
 }
 const dependencyState=graph.edges.map(e=>({relation:e.relation,target:e.to.id===graph.root.id?e.from:e.to,label:e.label}));
 const trashType=root.type==='component'?'ui':root.type;
 const trash=await canonicalFirst(env,`SELECT id,trashed_at,evidence_status,legal_hold,restored_at,purged_at,reason_code FROM platform_trash_items WHERE resource_type=? AND resource_id=? ORDER BY id DESC LIMIT 1`,[trashType,String(resourceId)],'resource_explorer_trash_state');
 const actions=[...(root.actions||[])];
 if(trash&&!trash.restored_at&&!trash.purged_at&&!actions.includes('RESTORE'))actions.push('RESTORE');
 if(trash&&trash.restored_at){}
 const resource={...root,actions,trashState:trash?{id:Number(trash.id),trashedAt:trash.trashed_at,evidenceStatus:trash.evidence_status,legalHold:Boolean(Number(trash.legal_hold)),restoredAt:trash.restored_at,purgedAt:trash.purged_at,reasonCode:trash.reason_code}:null};
 return {version:PLATFORM_RESOURCE_EXPLORER_VERSION,resource,graph,dependencyState,mutationBoundary:'Mutations remain delegated to canonical authorities. This explorer never writes domain truth directly.',trash:resource.trashState};
}


export async function getResourceActivity(env,{resourceType,resourceId,limit=24}={}){
 const type=clean(resourceType,80),id=String(resourceId??'');
 if(!type||!id)throw Object.assign(new Error('RESOURCE_ACTIVITY_TARGET_REQUIRED'),{status:422,code:'RESOURCE_ACTIVITY_TARGET_REQUIRED'});
 const max=Math.min(60,Math.max(1,n(limit)||24));
 const aliases=new Set([type]);
 if(type==='component')aliases.add('ui');
 if(type==='content')aliases.add('ui');
 const placeholders=[...aliases].map(()=>'?').join(',');
 const rows=await all(env,`SELECT id,event_id,actor_role,action,resource_type,resource_id,target_company_id,request_id,metadata,created_at FROM admin_control_audit_events WHERE resource_type IN (${placeholders}) AND CAST(resource_id AS TEXT)=? ORDER BY id DESC LIMIT ?`,[...aliases,id,max]);
 return {version:PLATFORM_RESOURCE_EXPLORER_VERSION,resourceType:type,resourceId:id,events:rows.map(r=>({id:Number(r.id),eventId:r.event_id,actorRole:r.actor_role,action:r.action,resourceType:r.resource_type,resourceId:r.resource_id==null?null:String(r.resource_id),targetCompanyId:r.target_company_id==null?null:Number(r.target_company_id),requestId:r.request_id,metadata:r.metadata,createdAt:r.created_at}))};
}
