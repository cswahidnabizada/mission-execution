import {getProductStudio} from './product-studio.service.js';
import {getProductHealth} from './product-health.service.js';
import {listExpansionCases} from './product-expansion.service.js';

import {RELEASE_VERSION} from '../core/release.js';
import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';

export const PRODUCT_ECOSYSTEM_VERSION=RELEASE_VERSION;
const safeInt=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

async function first(env,sql,...args){return canonicalFirst(env,sql,args,'product_ecosystem')}
async function all(env,sql,...args){return canonicalAll(env,sql,args,'product_ecosystem')}

export async function getProductEcosystem(env,{countryCode='',sectorCode=''}={}){
  const country=String(countryCode||'').trim().toUpperCase();
  const sector=String(sectorCode||'').trim().toLowerCase();
  const [studio,health,expansions,definitions,launches,verification]=await Promise.all([
    getProductStudio(env,{countryCode:country,sectorCode:sector}),
    getProductHealth(env,{countryCode:country,sectorCode:sector}),
    listExpansionCases(env,{limit:12,countryCode:country}),
    all(env,`SELECT id,product_key,name,country_code,sector_code,status,definition_version,compiled_at,compiled_hash,launch_id,base_definition_id,updated_at FROM platform_product_definitions ${country?'WHERE country_code=?':''} ORDER BY updated_at DESC,id DESC LIMIT 25`,...(country?[country]:[])),
    all(env,`SELECT id,country_code,version,status,active,country_blueprint_id,updated_at FROM country_product_launches ${country?'WHERE country_code=?':''} ORDER BY updated_at DESC,id DESC LIMIT 25`,...(country?[country]:[])),
    all(env,`SELECT id,country_code,sector_code,launch_id,launch_version,status,passed_count,failed_count,blocked_count,completed_at FROM platform_product_verification_runs ${country?'WHERE country_code=?':''} ORDER BY id DESC LIMIT 12`,...(country?[country]:[]))
  ]);

  const live=launches.filter(x=>Number(x.active)===1&&String(x.status||'').toLowerCase()==='active');
  const compiled=definitions.filter(x=>x.compiled_at&&x.compiled_hash&&['compiled','active','published'].includes(String(x.status||'').toLowerCase()));
  const verified=verification.filter(x=>String(x.status||'').toLowerCase()==='succeeded');
  const blockers=[...(health?.blockers||[])].map(x=>({...x,source:'product-health'}));
  const warnings=[...(health?.warnings||[])].map(x=>({...x,source:'product-health'}));
  if(!country){
    warnings.push({code:'ECOSYSTEM_SCOPE_REQUIRED',stage:'selection',message:'Select a country to inspect a concrete product ecosystem path.',details:{}});
  }
  const readinessValid=Boolean(health?.launch?.active||live.length);
  const stages={
    definition:{status:definitions.length?'ready':'blocked',label:'Definition',source:'product-definition'},
    composition:{status:definitions.length?'ready':'blocked',label:'Composition',source:'product-definition'},
    compile:{status:compiled.length?'ready':'blocked',label:'Compile',source:'product-definition'},
    manifest:{status:compiled.length?'ready':'blocked',label:'Manifest',source:'governed-product-manifest-runtime'},
    experience:{status:definitions.some(x=>x.status&&x.compiled_at)?'ready':'warning',label:'Experience',source:'declarative-experience'},
    health:{status:health?.status||'unknown',label:'Health',source:'product-health'},
    readiness:{status:health?.launch?.id?((health?.blockers||[]).some(x=>x.stage==='launch')?'blocked':'ready'):'blocked',label:'Readiness',source:'product-launch-readiness'},
    activation:{status:live.length?'ready':launches.some(x=>String(x.status||'').toLowerCase()==='validated')?'ready':'blocked',label:'Activation',source:'country-product-launch'},
    verification:{status:verified.length?'ready':launches.length?'warning':'blocked',label:'Verification',source:'product-verification'},
    runtime:{status:live.length?'ready':'blocked',label:'Runtime',source:'governed-runtime'}
  };
  const next = blockers[0] ? {kind:'blocker',code:blockers[0].code,message:blockers[0].message,source:blockers[0].source} :
    !country ? {kind:'selection',code:'SELECT_COUNTRY',message:'Select a target country to begin a concrete product lifecycle review.',source:'ecosystem'} :
    !definitions.length ? {kind:'action',code:'CREATE_DEFINITION',message:'Create or select the governed product definition.',source:'product-definition'} :
    !compiled.length ? {kind:'action',code:'COMPILE_PRODUCT',message:'Compile the selected product definition.',source:'product-definition'} :
    !health?.launch?.id ? {kind:'action',code:'PREPARE_READINESS',message:'Prepare the product launch readiness path.',source:'product-launch-readiness'} :
    !readinessValid ? {kind:'action',code:'COMPLETE_READINESS',message:'Resolve product health and launch-readiness blockers.',source:'product-health'} :
    !launches.some(x=>String(x.status||'').toLowerCase()==='active') ? {kind:'action',code:'ACTIVATE_PRODUCT',message:'Activate the validated country product.',source:'country-product-launch'} :
    !verified.length ? {kind:'action',code:'VERIFY_PRODUCT',message:'Run canonical Product Verification for the active product.',source:'product-verification'} :
    !live.length ? {kind:'action',code:'OPEN_RUNTIME',message:'Confirm governed runtime consumption.',source:'governed-runtime'} :
    {kind:'complete',code:'PRODUCT_LIVE',message:'The product lifecycle is live and governed.',source:'governed-runtime'};

  return {
    version:PRODUCT_ECOSYSTEM_VERSION,
    scope:{countryCode:country||null,sectorCode:sector||null},
    status:blockers.length?'blocked':live.length?'live':country?'in_progress':'needs_selection',
    stages,
    next,
    blockers,
    warnings,
    counts:{definitions:definitions.length,compiled:compiled.length,launches:launches.length,live:live.length,verified:verified.length,expansions:expansions.length},
    studio:studio?{version:studio.contract?.version||null,contract:studio.contract||null}:null,
    health:health||null,
    definitions:definitions.map(x=>({...x,id:safeInt(x.id),launch_id:x.launch_id==null?null:safeInt(x.launch_id),base_definition_id:x.base_definition_id==null?null:safeInt(x.base_definition_id)})),
    launches:launches.map(x=>({...x,id:safeInt(x.id),country_blueprint_id:x.country_blueprint_id==null?null:safeInt(x.country_blueprint_id),active:Number(x.active)===1})),
    verification,
    expansions
  };
}
