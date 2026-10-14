import {RELEASE_VERSION} from '../core/release.js';
import {listPlatformConfigurations} from './platform-configuration.service.js';
import {listCountryBlueprints,getCountryBlueprint} from './country-product-blueprint.service.js';
import {listCountryProductLaunches} from './country-product-launch.service.js';
import {getProductPreparationWorkspace,getProductDependencyGraph} from './product-launch-workspace.service.js';
import {canonicalAll} from '../core/canonical-db.js';

const DESIGN_KEYS=[
  ['capabilities','catalog'],
  ['roles','action_policy'],
  ['rendering','product_experience'],
  ['guidance','user_journey'],
  ['policy','default'],
  ['mission_rules','intake']
];

async function readVerificationSummary(env){
  const rows=await canonicalAll(env,`SELECT status,COUNT(*) count FROM platform_product_verification_runs GROUP BY status`,[], 'product_verification_summary');
  const counts={succeeded:0,failed:0,blocked:0,executing:0,preparing:0,verifying:0};
  for(const r of rows)if(counts[r.status]!=null)counts[r.status]=Number(r.count||0);
  const latest=await canonicalAll(env,`SELECT id,country_code,sector_code,company_id,status,passed_count,failed_count,blocked_count,completed_at FROM platform_product_verification_runs ORDER BY id DESC LIMIT 10`,[], 'product_verification_summary');
  return {engineVersion:RELEASE_VERSION,counts,latest:latest.map(x=>({...x,id:Number(x.id),company_id:x.company_id==null?null:Number(x.company_id)}))};
}

export async function getProductStudio(env,{countryCode='',blueprintId=null,launchId=null}={}){
  const [configurations,blueprints,launches,verification]=await Promise.all([
    listPlatformConfigurations(env),
    listCountryBlueprints(env,{query:'',limit:250}),
    listCountryProductLaunches(env),
    readVerificationSummary(env)
  ]);
  const code=String(countryCode||'').trim().toUpperCase();
  let blueprint=null;
  if(blueprintId) blueprint=await getCountryBlueprint(env,Number(blueprintId));
  if(!blueprint&&code){const b=blueprints.find(x=>String(x.country_code||'').toUpperCase()===code);if(b) blueprint=await getCountryBlueprint(env,Number(b.id));}
  const countryLaunches=code?launches.filter(x=>String(x.country_code||'').toUpperCase()===code):launches;
  let launch=null;
  if(launchId) launch=launches.find(x=>Number(x.id)===Number(launchId))||null;
  if(!launch&&code) launch=countryLaunches.find(x=>x.status==='active')||countryLaunches[0]||null;
  let workspace=null,dependencyGraph=null;
  if(launch?.id){
    [workspace,dependencyGraph]=await Promise.all([
      getProductPreparationWorkspace(env,Number(launch.id)),
      getProductDependencyGraph(env,Number(launch.id))
    ]);
  }
  const activeConfigs=Object.fromEntries(DESIGN_KEYS.map(([domain,key])=>{
    const row=configurations.find(x=>x.domain_code===domain&&x.config_key===key&&x.active);
    return [`${domain}:${key}`,row||null];
  }));
  return {
    contract:{version:RELEASE_VERSION,model:'country-foundation → product-design → product-version → readiness → launch → verification → health',authority:'canonical-authorities'},
    country:{code:code||null,blueprint,blueprints:blueprints.map(x=>({id:x.id,country_code:x.country_code,country_name:x.country_name,status:x.status,default_language_code:x.default_language_code}))},
    design:{active:activeConfigs},
    products:{all:launches,country:countryLaunches,selected:launch},
    readiness:{workspace,dependencyGraph},
    verification,
    presentation:{
      labels:activeConfigs['rendering:product_experience']?.payload?.labels||{},
      show:activeConfigs['rendering:product_experience']?.payload?.show||{},
      content:(blueprint?.contents||[]).filter(x=>x.status==='ready').map(x=>({key:x.content_key,title:x.title,body:x.body,languageCode:x.language_code,category:x.category})),
      languages:(blueprint?.languages||[]).filter(x=>x.enabled).map(x=>({code:x.language_code,name:x.language_name,primary:Boolean(x.is_primary)})),
      sectors:(blueprint?.sectors||[]).map(x=>({code:x.sector_code,name:x.sector_name,status:x.status,required:Boolean(x.required)}))
    }
  };
}

export {DESIGN_KEYS};
