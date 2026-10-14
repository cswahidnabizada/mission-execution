import {auditAdminControl} from './admin-control-audit.service.js';
import {listPlans} from '../repositories/subscription.repository.js';
import {evaluateProductLaunchReadiness} from './product-launch-readiness.service.js';
import {ensureProductPreparationWorkspace} from './product-launch-workspace.service.js';
import {listProductDefinitions,compileProductDefinition} from './product-definition.service.js';
import {prepareCountryBlueprintForLaunch} from './country-product-blueprint.service.js';
import {blueprintLaunchManifest,getCountryBlueprint} from './country-product-blueprint.service.js';

import { authorityUnavailable } from '../core/canonical-db.js';
const DEFAULT_USER_CLASSES=['tenant_admin','driver','independent_executor'];
const DEFAULT_ORG_TYPES=['company'];
const DEFAULT_SECTORS=['general'];
const clean=(v,max=200)=>String(v??'').trim().slice(0,max);
const arr=(v)=>Array.isArray(v)?[...new Set(v.map(x=>clean(x,120)).filter(Boolean))]:[];
const json=(v,f)=>{try{return JSON.parse(v||'null')??f}catch{return f}};
const fail=(m,s=400)=>{const e=new Error(m);e.status=s;return e};

export async function listCountryProductLaunches(env){
 const rows=(await env.DB.prepare(`SELECT l.*,c.name country_name,c.active product_country_catalog_active FROM country_product_launches l JOIN platform_product_country_catalog c ON c.code=l.country_code ORDER BY c.name,l.version DESC,l.id DESC`).all()).results||[];
 return rows.map(normalizeRow);
}
export async function getCountryProductLaunch(env,countryCode,{publicOnly=false}={}){
 const q=publicOnly?`SELECT l.*,c.name country_name FROM country_product_launches l JOIN platform_product_country_catalog c ON c.code=l.country_code WHERE l.country_code=? AND l.status='active' AND l.active=1 ORDER BY l.id DESC LIMIT 1`:`SELECT l.*,c.name country_name,c.active product_country_catalog_active FROM country_product_launches l JOIN platform_product_country_catalog c ON c.code=l.country_code WHERE l.country_code=? ORDER BY CASE WHEN l.status='active' AND l.active=1 THEN 0 ELSE 1 END,l.id DESC LIMIT 1`;
 const row=await env.DB.prepare(q).bind(clean(countryCode,2).toUpperCase()).first();
 return row?normalizeRow(row):null;
}
export async function getCountryProductLaunchById(env,id){
 const row=await env.DB.prepare(`SELECT l.*,c.name country_name,c.active product_country_catalog_active FROM country_product_launches l JOIN platform_product_country_catalog c ON c.code=l.country_code WHERE l.id=? LIMIT 1`).bind(Number(id)).first();
 return row?normalizeRow(row):null;
}
function normalizeRow(r){return {...r,id:Number(r.id),active:Number(r.active)===1,manifest:json(r.manifest_json,{}),eligibility:json(r.eligibility_json,{}),readiness:json(r.readiness_json,{})};}

export async function publicLaunchCountries(env){
 const rows=(await env.DB.prepare(`SELECT l.country_code code,c.name FROM country_product_launches l JOIN platform_product_country_catalog c ON c.code=l.country_code WHERE l.status='active' AND l.active=1 AND c.active=1 ORDER BY c.name`).all()).results||[];
 return rows;
}

export async function createCountryLaunchDraft(env,actor,input,requestId){
 const code=clean(input.countryCode,2).toUpperCase();
 if(input.dataEntryId){const fenced=await env.DB.prepare(`SELECT id FROM country_product_launches WHERE data_entry_id=? LIMIT 1`).bind(String(input.dataEntryId)).first();if(fenced)return getCountryProductLaunchById(env,fenced.id);}
 const country=await env.DB.prepare(`SELECT code,name,active FROM platform_product_country_catalog WHERE code=? LIMIT 1`).bind(code).first();
 if(!country)throw fail('Country does not exist',404);
 if(Number(country.active)!==1)throw fail('Country catalog entry is inactive',422);
 const version=await nextVersion(env,code);
 let blueprintManifest=null;
 if(input.blueprintId){ const blueprint=await getCountryBlueprint(env,Number(input.blueprintId)); if(!blueprint)throw fail('Country blueprint not found',404); if(blueprint.country_code!==code)throw fail('Country blueprint does not belong to selected country',409); blueprintManifest={blueprintId:Number(input.blueprintId),languageCode:blueprint.default_language_code,labels:{countryName:blueprint.country_name,productName:blueprint.contents.find(x=>x.content_key==='product-name')?.body||blueprint.name},eligibility:{sectors:blueprint.sectors.filter(x=>x.status==='ready').map(x=>x.sector_code),organizationTypes:['company'],userClasses:['tenant_admin','driver','independent_executor']},countryContent:{languages:blueprint.languages,contents:blueprint.contents,legalRequirements:blueprint.legalRequirements}}; }
 const rawManifest=input.manifest||{};
 const manifest=normalizeManifest({...blueprintManifest,...rawManifest,labels:{...(blueprintManifest?.labels||{}),...(rawManifest.labels||{})},guidance:{...(blueprintManifest?.guidance||{}),...(rawManifest.guidance||{})},countryContent:rawManifest.countryContent ?? blueprintManifest?.countryContent ?? null});
 const payload=JSON.stringify(manifest);
 const res=await env.DB.prepare(`INSERT INTO country_product_launches(country_code,version,status,manifest_json,eligibility_json,readiness_json,active,created_by_type,created_by_id,data_entry_id) VALUES(?,?, 'draft',?,?,?,0,?,?,?)`).bind(code,version,payload,JSON.stringify(manifest.eligibility),JSON.stringify({}),actor.role,actor.id||null,input.dataEntryId==null?null:String(input.dataEntryId)).run();
 const id=res.meta?.last_row_id||res.last_row_id;
 await ensureProductPreparationWorkspace(env,id);
 await env.DB.prepare(`INSERT INTO country_product_launch_change_requests(request_id,launch_id,stage,requested_by_type,requested_by_id,reason) VALUES(?,?, 'draft',?,?,?)`).bind(requestId||crypto.randomUUID(),id,actor.role,actor.id||null,clean(input.reason,500)||null).run();
 await auditAdminControl(env,{actor,action:'admin.country-product-launch.draft-created',resourceType:'country_product_launch',resourceId:id,requestId,metadata:{countryCode:code,version}});
 return getCountryProductLaunchById(env,id);
}
async function nextVersion(env,code){const r=await env.DB.prepare(`SELECT MAX(CAST(version AS INTEGER)) v FROM country_product_launches WHERE country_code=?`).bind(code).first();return String(Number(r?.v||0)+1)}
function normalizeManifest(m){
 const eligibility=m.eligibility||{};
 return {
  capabilities:arr(m.capabilities),
  requiredConfigurations:arr(m.requiredConfigurations),
  eligibility:{
   organizationTypes:arr(eligibility.organizationTypes||DEFAULT_ORG_TYPES),
   sectors:arr(eligibility.sectors||DEFAULT_SECTORS),
   userClasses:arr(eligibility.userClasses||DEFAULT_USER_CLASSES),
   companyIds:arr(eligibility.companyIds),
   registrationNumbers:arr(eligibility.registrationNumbers),
   emailDomains:arr(eligibility.emailDomains).map(x=>x.toLowerCase().replace(/^@/,'')),
   companyMode:eligibility.companyMode==='allowlist'?'allowlist':'rules',
   userMode:eligibility.userMode==='allowlist'?'allowlist':'rules',
   emailAllowlist:arr(eligibility.emailAllowlist).map(x=>x.toLowerCase())
  },
  labels:m.labels||{},
  launchMessage:clean(m.launchMessage,500)||'ON Mission is available for this country.',
  guidance:m.guidance||{},
  governance:{
    countryContent:m.countryContent&&typeof m.countryContent==='object'&&!Array.isArray(m.countryContent)?{
      languages:Array.isArray(m.countryContent.languages)?m.countryContent.languages.slice(0,100):[],
      contents:Array.isArray(m.countryContent.contents)?m.countryContent.contents.slice(0,500):[],
      legalRequirements:Array.isArray(m.countryContent.legalRequirements)?m.countryContent.legalRequirements.slice(0,200):[]
    }:null
  }
 };
}


export async function updateCountryProductLaunchDraft(env,actor,id,input={},requestId='') {
 const row=await env.DB.prepare(`SELECT * FROM country_product_launches WHERE id=? LIMIT 1`).bind(Number(id)).first();
 if(!row)throw fail('Country launch not found',404);
 if(row.status!=='draft'||Number(row.active)!==0)throw fail('Only inactive draft country launches can be edited',409);
 const manifest=normalizeManifest(input.manifest||json(row.manifest_json,{}));
 const countryCode=clean(input.countryCode||row.country_code,2).toUpperCase();
 if(countryCode!==String(row.country_code).toUpperCase())throw fail('Draft country cannot be changed after creation; create a new governed draft instead',409);
 const blueprintId=input.blueprintId==null?row.country_blueprint_id:Number(input.blueprintId)||null;
 if(blueprintId){const blueprint=await getCountryBlueprint(env,blueprintId);if(!blueprint)throw fail('Country blueprint not found',404);if(String(blueprint.country_code)!==countryCode)throw fail('Country blueprint does not belong to selected country',409);}
 const version=row.version;
 await env.DB.prepare(`UPDATE country_product_launches SET country_blueprint_id=?,manifest_json=?,eligibility_json=?,readiness_json='{}',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft' AND active=0`).bind(blueprintId,JSON.stringify(manifest),JSON.stringify(manifest.eligibility),Number(id)).run();
 await env.DB.prepare(`INSERT INTO country_product_launch_change_requests(request_id,launch_id,stage,requested_by_type,requested_by_id,reason) VALUES(?,?, 'draft',?,?,?)`).bind(requestId||crypto.randomUUID(),Number(id),actor.role,actor.id||null,clean(input.reason||'Draft edited through governed Data Entry.',500)).run();
 await ensureProductPreparationWorkspace(env,Number(id));
 await auditAdminControl(env,{actor,action:'admin.country-product-launch.draft-updated',resourceType:'country_product_launch',resourceId:id,requestId,metadata:{countryCode,version}}).catch(error=>{throw authorityUnavailable('country_product_launch_audit',error);});
 return getCountryProductLaunchById(env,Number(id));
}

export async function validateCountryProductLaunch(env,actor,id,requestId){
 const row=await env.DB.prepare(`SELECT * FROM country_product_launches WHERE id=? LIMIT 1`).bind(Number(id)).first();
 if(!row)throw fail('Country launch not found',404);
 if(row.status!=='draft')throw fail('Only draft country launches can be validated',409);
 const workspace=await ensureProductPreparationWorkspace(env,id);
 const manifest=normalizeManifest(json(row.manifest_json,{}));
 if(row.country_blueprint_id)await prepareCountryBlueprintForLaunch(env,actor,Number(row.country_blueprint_id));
 const configuredSectors=arr(manifest.eligibility.sectors);
 if(!configuredSectors.length)throw fail('At least one sector is required before validation',422);
 const definitions=await listProductDefinitions(env,{countryCode:row.country_code,limit:250});
 for(const sector of configuredSectors){
   const definition=definitions.find(d=>Number(d.launch_id)===Number(id)&&String(d.sector_code)===String(sector));
   if(!definition)throw fail(`Product definition is missing for sector ${sector}`,422);
   if(!['compiled','verified','active'].includes(String(definition.status))||!String(definition.compiled_hash||'').trim())await compileProductDefinition(env,actor,Number(definition.id));
 }
 const readiness=await evaluateProductLaunchReadiness(env,{countryCode:row.country_code,sectorCode:configuredSectors[0]||'general',manifest,launchId:id});
 const checks={...readiness.checks,message:Boolean(manifest.launchMessage),preparation:workspace.summary.ready};
 const blockers=[...readiness.blockers];
 if(!workspace.summary.ready){blockers.push({code:'product_preparation_incomplete',message:'Product preparation workspace is not complete. Finish every required preparation item and research evidence before validation.'});}
 if(!checks.message)blockers.push({code:'message',message:'Launch message is required'});
 const valid=blockers.length===0;
 const finalReadiness={...readiness,valid,checks,blockers,manifestSectors:manifest.eligibility.sectors};
 await env.DB.prepare(`UPDATE country_product_launches SET status=?,readiness_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft'`).bind(valid?'validated':'draft',JSON.stringify(finalReadiness),Number(id)).run();
 await env.DB.prepare(`UPDATE country_product_launch_change_requests SET stage=?,impact_json=?,updated_at=CURRENT_TIMESTAMP WHERE launch_id=? AND stage='draft'`).bind(valid?'validated':'draft',JSON.stringify(finalReadiness),Number(id)).run();
 await auditAdminControl(env,{actor,action:'admin.country-product-launch.validated',resourceType:'country_product_launch',resourceId:id,requestId,metadata:{countryCode:row.country_code,valid,score:finalReadiness.score,blockers:blockers.map(x=>x.code)}});
 return getCountryProductLaunch(env,row.country_code);
}
export async function activateCountryProductLaunch(env,actor,id,requestId,guard={}){
 const row=await env.DB.prepare(`SELECT * FROM country_product_launches WHERE id=? LIMIT 1`).bind(Number(id)).first();
 if(!row)throw fail('Country launch not found',404); if(row.status!=='validated')throw fail('Country launch must pass readiness validation before activation',409);
 const readiness=json(row.readiness_json,{}); if(readiness.valid!==true)throw fail('Country launch is not ready',409);
 const current=await env.DB.prepare(`SELECT id,version,status,active FROM country_product_launches WHERE country_code=? AND active=1 LIMIT 1`).bind(row.country_code).first();
 if(guard.expectedActiveLaunchId!=null&&Number(guard.expectedActiveLaunchId)!==Number(current?.id||0))throw fail('COUNTRY_PRODUCT_ACTIVE_VERSION_CHANGED',409);
 if(guard.expectedActiveVersion!=null&&String(guard.expectedActiveVersion)!==String(current?.version||''))throw fail('COUNTRY_PRODUCT_ACTIVE_VERSION_CHANGED',409);
 const manifest=normalizeManifest(json(row.manifest_json,{}));
 await env.DB.batch([
  env.DB.prepare(`UPDATE country_product_launches SET status='retired',active=0,updated_at=CURRENT_TIMESTAMP WHERE country_code=? AND active=1`).bind(row.country_code),
  env.DB.prepare(`UPDATE country_product_launches SET status='active',active=1,effective_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(id)),
 ]);
 await env.DB.prepare(`UPDATE country_product_launch_change_requests SET stage='activated',updated_at=CURRENT_TIMESTAMP WHERE launch_id=? AND stage='validated'`).bind(Number(id)).run();
 await auditAdminControl(env,{actor,action:'admin.country-product-launch.activated',resourceType:'country_product_launch',resourceId:id,requestId,metadata:{countryCode:row.country_code,version:row.version,eligibility:manifest.eligibility}});
 return getCountryProductLaunch(env,row.country_code);
}
export async function retireCountryProductLaunch(env,actor,id,requestId){
 const row=await env.DB.prepare(`SELECT * FROM country_product_launches WHERE id=? LIMIT 1`).bind(Number(id)).first(); if(!row)throw fail('Country launch not found',404);
 const results=await env.DB.batch([
  env.DB.prepare(`UPDATE country_product_launches SET status='retired',active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='retired'`).bind(Number(id)),
  env.DB.prepare(`UPDATE country_product_launch_change_requests SET stage='retired',updated_at=CURRENT_TIMESTAMP WHERE launch_id=? AND stage='activated'`).bind(Number(id))
 ]);
 if(Number(results?.[0]?.meta?.changes||0)!==1)throw fail('Country launch retirement did not change the active record',409);
 await auditAdminControl(env,{actor,action:'admin.country-product-launch.retired',resourceType:'country_product_launch',resourceId:id,requestId,metadata:{countryCode:row.country_code}});
 return getCountryProductLaunch(env,row.country_code);
}

export async function evaluateCountryEligibility(env,{countryCode,companyId,organizationType,sectorCode,registrationNumber,email,userClass}){
 const launch=await getCountryProductLaunch(env,countryCode,{publicOnly:true});
 if(!launch)return {allowed:false,reason:'COUNTRY_NOT_LAUNCHED',launch:null};
 const e=launch.eligibility||{};
 if(e.companyMode==='allowlist'){
  const ids=e.companyIds||[], regs=e.registrationNumbers||[];
  const idOk=companyId!=null&&ids.includes(String(companyId));
  const regOk=registrationNumber&&regs.includes(String(registrationNumber));
  if(!idOk&&!regOk)return {allowed:false,reason:'COMPANY_NOT_ALLOWED',launch};
 }
 if(e.userMode==='allowlist'){
  const emailOk=email&&e.emailAllowlist?.includes(String(email).toLowerCase());
  if(!emailOk)return {allowed:false,reason:'USER_NOT_ALLOWED',launch};
 }
 if(e.organizationTypes?.length&&!e.organizationTypes.includes(String(organizationType||'')))return {allowed:false,reason:'ORGANIZATION_TYPE_NOT_ALLOWED',launch};
 if(e.sectors?.length&&!e.sectors.includes(String(sectorCode||'')))return {allowed:false,reason:'SECTOR_NOT_ALLOWED',launch};
 if(e.userClasses?.length&&!e.userClasses.includes(String(userClass||'')))return {allowed:false,reason:'USER_CLASS_NOT_ALLOWED',launch};
 if(e.emailDomains?.length){const domain=String(email||'').toLowerCase().split('@')[1]||'';if(!e.emailDomains.includes(domain))return {allowed:false,reason:'EMAIL_DOMAIN_NOT_ALLOWED',launch};}
 return {allowed:true,reason:'ALLOWED',launch};
}
