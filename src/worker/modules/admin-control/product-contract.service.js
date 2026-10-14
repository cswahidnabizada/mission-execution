import {RELEASE_VERSION} from '../../core/release.js';
import {getProductPreparationWorkspace,getProductDependencyGraph} from '../../security/product-launch-workspace.service.js';
import {getCountryBlueprint} from '../../security/country-product-blueprint.service.js';
import {getCountryProductFoundation} from './country-product-foundation.service.js';
import {listPlatformConfigurations} from '../../security/platform-configuration.service.js';
import {lifecycleHealthForLaunch} from '../../security/sector-lifecycle.service.js';
import {getProductControlPlaneGovernance} from '../../security/control-plane-governance.service.js';

const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const arr=v=>Array.isArray(v)?v:[];
const json=v=>{try{return JSON.parse(String(v??'null'))??{};}catch{return {};}};

const stable=(value)=>{
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
 return value;
};

const sha256=async value=>{const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');};

/**
 * Immutable, computed Product Contract projection.
 * It composes canonical authorities; it never becomes an authority itself.
 */
export async function getProductContract(env,{launchId}={}){
 const id=Number(launchId);if(!Number.isInteger(id)||id<=0)throw Object.assign(new Error('Invalid product launch id'),{status:400,code:'PRODUCT_CONTRACT_LAUNCH_ID_INVALID'});
 const launch=await env.DB.prepare(`SELECT * FROM country_product_launches WHERE id=? LIMIT 1`).bind(id).first();
 if(!launch)throw Object.assign(new Error('Product launch not found'),{status:404,code:'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND'});
 const manifest=json(launch.manifest_json),eligibility=json(launch.eligibility_json),sectors=arr(eligibility.sectors||manifest.eligibility?.sectors);
 const [blueprint,foundation,preparation,graph,configurations,lifecycle,governance,definitions]=await Promise.all([
   launch.country_blueprint_id?getCountryBlueprint(env,Number(launch.country_blueprint_id)):null,
   getCountryProductFoundation(env,launch.country_code),
   getProductPreparationWorkspace(env,id),
   getProductDependencyGraph(env,id),
   listPlatformConfigurations(env),
   lifecycleHealthForLaunch(env,id,sectors.length?sectors:['general']),
   getProductControlPlaneGovernance(env,id),
   env.DB.prepare(`SELECT id,sector_code,name,description,status,compiled_hash FROM platform_product_definitions WHERE launch_id=? ORDER BY sector_code`).bind(id).all().then(r=>r.results||[])
 ]);
 const required=arr(manifest.requiredConfigurations);const activeConfigSet=new Set(configurations.filter(x=>Number(x.active)===1).map(x=>`${x.domain_code}:${x.config_key}`));
 const contract={
   contractVersion:'product-contract.v1',releaseVersion:RELEASE_VERSION,
   identity:{launchId:id,countryCode:clean(launch.country_code,2).toUpperCase(),countryName:launch.country_name||blueprint?.country_name||null,productName:manifest.labels?.productName||manifest.productName||blueprint?.name||null,version:Number(launch.version||1),status:launch.status,active:Number(launch.active)===1},
   composition:{sectors,eligibility,capabilities:arr(manifest.capabilities),requiredConfigurations:required},
   countryFoundation:{ready:Boolean(foundation?.ready),jurisdiction:foundation?.jurisdiction||null,residency:foundation?.residency||null,billing:foundation?.billing||null,retention:arr(foundation?.retention),notifications:arr(foundation?.notifications),storage:arr(foundation?.storage)},
   preparation:{summary:preparation?.summary||null},
   definitions:definitions.map(d=>({id:Number(d.id),sectorCode:d.sector_code,name:d.name,status:d.status,compiledHash:d.compiled_hash||null,version:1})),
   lifecycle:{valid:Boolean(lifecycle?.valid),sectors:arr(lifecycle?.sectors)},
   runtimeConfiguration:{required,active:required.filter(k=>activeConfigSet.has(k)),missing:required.filter(k=>!activeConfigSet.has(k))},
   governance:{summary:governance?.summary||null,resourceCount:arr(governance?.resources).length},
   dependencies:{nodes:Number(graph?.summary?.nodes||0),edges:Number(graph?.summary?.edges||0),blockedNodes:Number(graph?.summary?.blockedNodes||0)},
   publication:{launchMessage:manifest.launchMessage||null,compiledAt:launch.compiled_at||launch.updated_at||null}
 };
 const canonical=JSON.stringify(stable(contract));
 const hash=await sha256(canonical);
 return {version:RELEASE_VERSION,contract,contractHash:hash,immutable:true,authority:'canonical-composition',canonicalJson:canonical};
}
