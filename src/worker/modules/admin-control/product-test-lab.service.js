import {evaluateProductLaunchReadiness} from '../../security/product-launch-readiness.service.js';
import {getProductDependencyGraph,getProductPreparationWorkspace} from '../../security/product-launch-workspace.service.js';
import {lifecycleHealthForLaunch} from '../../security/sector-lifecycle.service.js';
import {RELEASE_VERSION} from '../../core/release.js';
import {listProductVerificationContracts} from './product-verification-engine.service.js';

const clean=(v,max=120)=>String(v??'').trim().slice(0,max);
const arr=v=>Array.isArray(v)?v:[];
const json=v=>{try{return JSON.parse(String(v??'null'))||{}}catch{return{}}};
const check=(key,label,passed,detail,category)=>({key,label,status:passed?'PASS':'BLOCKED',passed:Boolean(passed),detail,category});

/** Read-only pre-publication Product Test Lab. It proves contract/configuration
 * coherence; live user behavior remains owned by Product Verification Engine. */
export async function runProductTestLab(env,{launchId}={}){
 const id=Number(launchId);if(!Number.isInteger(id)||id<=0)throw Object.assign(new Error('Invalid product launch id'),{status:400,code:'COUNTRY_PRODUCT_LAUNCH_ID_INVALID'});
 const launch=await env.DB.prepare(`SELECT id,country_code,status,active,version,manifest_json,eligibility_json FROM country_product_launches WHERE id=? LIMIT 1`).bind(id).first();
 if(!launch)throw Object.assign(new Error('Product launch not found'),{status:404,code:'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND'});
 const manifest=json(launch.manifest_json),eligibility=json(launch.eligibility_json),sectors=arr(eligibility.sectors||manifest.eligibility?.sectors);
 const readiness=await evaluateProductLaunchReadiness(env,{countryCode:launch.country_code,sectorCode:sectors[0]||'general',manifest,launchId:id});
 const preparation=await getProductPreparationWorkspace(env,id);
 const lifecycle=await lifecycleHealthForLaunch(env,id,sectors.length?sectors:['general']);
 const graph=await getProductDependencyGraph(env,id);
 const defs=(await env.DB.prepare(`SELECT id,sector_code,status FROM platform_product_definitions WHERE launch_id=?`).bind(id).all()).results||[];
 const required=arr(manifest.requiredConfigurations);const configRows=required.length?(await env.DB.prepare(`SELECT domain_code,config_key,status,active FROM platform_configuration_versions WHERE active=1`).all()).results||[]:[];const activeConfigs=new Set(configRows.map(x=>`${x.domain_code}:${x.config_key}`));
 const journeyContracts=listProductVerificationContracts();
 const journeyCheck=journeyContracts.length===12 && journeyContracts.every(j=>Array.isArray(j.steps)&&j.steps.length>0);
 const checks=[
  check('country','Country active',readiness.checks?.country===true,readiness.details?.country?.name||launch.country_code,'foundation'),
  check('foundation','Country foundation',readiness.checks?.jurisdiction&&readiness.checks?.residency&&readiness.checks?.billing&&readiness.checks?.communication&&readiness.checks?.storage&&readiness.checks?.retention, 'Jurisdiction, residency, billing, communication, storage and retention','foundation'),
  check('preparation','Preparation & evidence',preparation.summary.ready,`${preparation.summary.completed}/${preparation.summary.total} required items complete`,'evidence'),
  check('definitions','Product definitions',sectors.every(s=>defs.some(d=>String(d.sector_code)===String(s)&&['compiled','active','validated'].includes(String(d.status)))),`${defs.length} definition(s) found`,'product'),
  check('lifecycle','Lifecycle contracts',lifecycle.valid,`${lifecycle.sectors?.length||0} sector lifecycle(s) checked`,'operational'),
  check('configuration','Runtime configuration',required.every(k=>activeConfigs.has(k)),`${required.length} required configuration(s)`,'configuration'),
  check('dependency-graph','Dependency graph',graph.summary?.blockedNodes===0,`${graph.summary?.nodes||0} nodes / ${graph.summary?.edges||0} edges`,'governance'),
  check('journey-contracts','Journey contracts',journeyCheck,`${journeyContracts.length} canonical verification journeys declared`,'verification'),
  check('readiness','Canonical readiness',readiness.valid===true,`${readiness.score||0}% readiness`,'release')
 ];
 const passed=checks.filter(x=>x.passed).length;const blocked=checks.filter(x=>!x.passed);return {version:RELEASE_VERSION,launchId:id,countryCode:clean(launch.country_code,2),launchVersion:launch.version,status:launch.status,mode:'pre_publish_contract',journeys:journeyContracts.map(j=>({sequence:j.sequence,code:j.code,label:j.label,steps:j.steps})),checks,summary:{total:checks.length,passed,blocked:blocked.length,score:checks.length?Math.round((passed/checks.length)*100):0,ready:blocked.length===0},blocked:blocked.map(x=>({code:`TEST_${x.key.replaceAll('-','_').toUpperCase()}_BLOCKED`,message:x.detail,nextAction:x.key}))};
}
