import {RELEASE_VERSION} from '../core/release.js';
import {canonicalFirst} from '../core/canonical-db.js';
import {getCountryProductLaunch,evaluateCountryEligibility} from './country-product-launch.service.js';

export const PRODUCT_RUNTIME_VERSION=RELEASE_VERSION;
const EXPERIENCE_TYPES=new Set(['workspace','section','navigation','card','panel','form','empty-state','guidance']);
const safeJson=(v,f={})=>{try{return JSON.parse(v||'{}')}catch{return f}};
const clone=v=>JSON.parse(JSON.stringify(v));
const arr=v=>Array.isArray(v)?v:[];
const publicContent=items=>arr(items).slice(0,200).map(x=>({key:String(x.key||''),title:String(x.title||''),body:String(x.body||''),languageCode:String(x.languageCode||''),category:String(x.category||'')})).filter(x=>x.key);

function sanitizeExperience(items){
  return arr(items).filter(x=>x&&EXPERIENCE_TYPES.has(String(x.type||''))).slice(0,100).map(x=>({
    key:String(x.key||''),type:String(x.type||''),
    sections:arr(x.sections).slice(0,50).map(s=>({key:String(s?.key||''),type:String(s?.type||''),capability:String(s?.capability||''),contentKey:String(s?.contentKey||''),visible:s?.visible!==false})),
    presentation:x.presentation&&typeof x.presentation==='object'&&!Array.isArray(x.presentation)?x.presentation:{},
    navigation:arr(x.navigation).slice(0,50).map(n=>({key:String(n?.key||''),labelKey:String(n?.labelKey||''),capability:String(n?.capability||''),visible:n?.visible!==false}))
  })).filter(x=>x.key);
}

function extractPublicManifest(manifest){
  const components=manifest?.components||{};
  const experiences=sanitizeExperience(components.experience);
  const vocab=arr(components.vocabulary).slice(0,200).map(x=>({key:String(x.key||''),label:String(x.label||''),description:String(x.description||''),translations:x.translations&&typeof x.translations==='object'?x.translations:{}})).filter(x=>x.key);
  const content=publicContent(components.content);
  const capabilities=arr(components.capability).map(x=>({key:String(x.key||''),enabled:x.enabled!==false,configuration:x.configuration&&typeof x.configuration==='object'&&!Array.isArray(x.configuration)?x.configuration:{}})).filter(x=>x.key);
  const labels={};const show={};const guidance={};
  for(const x of experiences){
    if(x.presentation?.labels&&typeof x.presentation.labels==='object')Object.assign(labels,x.presentation.labels);
    if(x.presentation?.show&&typeof x.presentation.show==='object')Object.assign(show,x.presentation.show);
    if(x.presentation?.guidance&&typeof x.presentation.guidance==='object')Object.assign(guidance,x.presentation.guidance);
  }
  return {
    version:manifest?.manifestVersion||PRODUCT_RUNTIME_VERSION,
    definition:manifest?.definition||null,
    composition:manifest?.composition||null,
    presentation:{labels,show,guidance,vocabulary:vocab,content,experiences},
    capabilities,
    runtime:{source:'compiled-product-definition',configurationAuthority:'product-definition-manifest',executionAuthority:'canonical-capabilities',authorizationAuthority:'canonical-authorization'}
  };
}

async function resolveCompanyContext(env,session){
  const companyId=Number(session?.tenantId||0);
  if(!companyId)return {organizationType:'company',sectorCode:'general',registrationNumber:null,email:session?.login||null,userClass:session?.role==='driver'?'driver':session?.role==='executor'?'independent_executor':'tenant_admin'};
  const row=await canonicalFirst(env,`SELECT organization_type,sector_code,registration_number FROM company_management_profiles WHERE company_id=? LIMIT 1`,[companyId],'governed_product_manifest_runtime');
  return {organizationType:String(row?.organization_type||'company'),sectorCode:String(row?.sector_code||'general'),registrationNumber:row?.registration_number||null,email:session?.login||null,userClass:session?.role==='driver'?'driver':'tenant_admin'};
}

export async function resolveRuntimeProductManifest(env,session,{countryCode=null,sectorCode=null}={}){
  const country=String(countryCode||session?.countryCode||'ZZ').trim().toUpperCase();
  if(!country||country==='ZZ')return {available:false,reason:'COUNTRY_UNRESOLVED',manifest:null};
  const launch=await getCountryProductLaunch(env,country,{publicOnly:true});
  if(!launch||launch.status!=='active'||launch.active!==true)return {available:false,reason:'COUNTRY_PRODUCT_NOT_ACTIVE',manifest:null,launch:{id:Number(launch?.id||0),version:String(launch?.version||''),status:String(launch?.status||''),active:Boolean(launch?.active),countryCode:country,countryName:launch?.country_name||null,launchMessage:launch?.manifest?.launchMessage||null}};
  const company=await resolveCompanyContext(env,session);
  const sector=String(sectorCode||company.sectorCode||launch.eligibility?.sectors?.[0]||'general').trim().toLowerCase();
  const eligibility=await evaluateCountryEligibility(env,{countryCode:country,companyId:session?.tenantId||null,organizationType:company.organizationType,sectorCode:sector,registrationNumber:company.registrationNumber,email:company.email,userClass:company.userClass});
  if(!eligibility.allowed)return {available:false,reason:eligibility.reason||'PRODUCT_NOT_ELIGIBLE',manifest:null,launch:{id:Number(launch.id),version:String(launch.version),status:launch.status,active:Boolean(launch.active),countryCode:country,countryName:launch.country_name||null,launchMessage:launch.manifest?.launchMessage||null}};
  const row=await canonicalFirst(env,`SELECT id,product_key,name,country_code,sector_code,status,definition_version,compiled_version,compiled_hash FROM platform_product_definitions WHERE launch_id=? AND country_code=? AND sector_code=? AND status='compiled' AND compiled_hash IS NOT NULL ORDER BY definition_version DESC,id DESC LIMIT 1`,[Number(launch.id),country,sector],'governed_product_manifest_runtime');
  if(!row)return {available:false,reason:'PRODUCT_DEFINITION_NOT_COMPILED',manifest:null,launch:{id:Number(launch.id),version:String(launch.version),status:launch.status,active:Boolean(launch.active),countryCode:country,countryName:launch.country_name||null,launchMessage:launch.manifest?.launchMessage||null}};
  const manifestRow=await canonicalFirst(env,`SELECT id,definition_version,manifest_json,manifest_hash,status,created_at FROM platform_product_definition_manifests WHERE definition_id=? AND definition_version=? AND manifest_hash=? AND status IN ('compiled','verified','active') ORDER BY id DESC LIMIT 1`,[Number(row.id),Number(row.compiled_version||row.definition_version),String(row.compiled_hash)],'governed_product_manifest_runtime');
  if(!manifestRow)return {available:false,reason:'PRODUCT_MANIFEST_NOT_FOUND',manifest:null,launch:{id:Number(launch.id),version:String(launch.version),status:launch.status,active:Boolean(launch.active),countryCode:country,countryName:launch.country_name||null,launchMessage:launch.manifest?.launchMessage||null}};
  const manifest=safeJson(manifestRow.manifest_json,null);
  if(!manifest)return {available:false,reason:'PRODUCT_MANIFEST_INVALID',manifest:null};
  if(String(manifest?.composition?.countryCode||'').toUpperCase()!==country||String(manifest?.composition?.sectorCode||'').toLowerCase()!==sector)return {available:false,reason:'PRODUCT_MANIFEST_SCOPE_MISMATCH',manifest:null};
  const canonical=JSON.stringify(manifest);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==String(manifestRow.manifest_hash)||hash!==String(row.compiled_hash))return {available:false,reason:'PRODUCT_MANIFEST_INTEGRITY_FAILED',manifest:null};
  return {available:true,reason:'READY',manifest:extractPublicManifest(manifest),integrity:{manifestId:Number(manifestRow.id),hash,definitionId:Number(row.id),definitionVersion:Number(row.definition_version),compiledAt:row.compiled_at||manifestRow.created_at},launch:{id:Number(launch.id),version:String(launch.version),status:launch.status,active:Boolean(launch.active),countryCode:country,countryName:launch.country_name||null,launchMessage:launch.manifest?.launchMessage||null},eligibility:{sectorCode:sector,userClass:company.userClass}};
}

export function mergeGovernedProductContext(configuration,runtime){
  const out=clone(configuration||{});if(!runtime?.available||!runtime.manifest)return out;
  const p=runtime.manifest.presentation||{};
  out.rendering={...(out.rendering||{}),labels:{...(out.rendering?.labels||{}),...(p.labels||{})},show:{...(out.rendering?.show||{}),...(p.show||{})}};
  if(Object.keys(p.guidance||{}).length)out.guidance={...(out.guidance||{}),...p.guidance};
  const enabled=arr(out.capabilities?.enabled);const configured=runtime.manifest.capabilities.filter(x=>x.enabled).map(x=>x.key);if(configured.length)out.capabilities={...(out.capabilities||{}),enabled:[...new Set([...enabled,...configured])]};
  return out;
}
