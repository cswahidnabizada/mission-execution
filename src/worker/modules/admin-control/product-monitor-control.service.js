import {RELEASE_VERSION} from '../../core/release.js';
import {listCountryProductLaunches} from '../../security/country-product-launch.service.js';
import {getProductHealth} from '../../security/product-health.service.js';
import {getProductBuildControl} from '../../security/product-build-control.service.js';
import {productVerificationSummary} from './product-verification-engine.service.js';
import {getAssignmentAuthorityHealth} from '../../security/mission-assignment-authority.service.js';

export const PRODUCT_MONITOR_VERSION=RELEASE_VERSION;

export async function getProductMonitor(env,{countryCode='',sectorCode=''}={}){
  const country=String(countryCode||'').trim().toUpperCase();
  const sector=String(sectorCode||'').trim().toLowerCase();
  const [build,launches,verification,assignment]=await Promise.all([
    getProductBuildControl(env,{countryCode:country,sectorCode:sector,limit:250}),
    listCountryProductLaunches(env),
    productVerificationSummary(env),
    getAssignmentAuthorityHealth(env,{limit:25})
  ]);
  const scoped=launches.filter(x=>!country||String(x.country_code||'').toUpperCase()===country).filter(x=>!sector||((x.eligibility?.sectors||[]).map(s=>String(s).toLowerCase()).includes(sector)));
  const products=[];
  for(const launch of scoped.slice(0,40)){
    const health=await getProductHealth(env,{countryCode:launch.country_code,sectorCode:sector||((launch.eligibility?.sectors||[])[0]||''),launchId:launch.id}).catch(error=>({status:'degraded',blockers:[{code:'MONITOR_HEALTH_UNAVAILABLE',severity:'blocker',message:error?.message||'Product health unavailable',stage:'monitor'}],warnings:[]}));
    products.push({id:Number(launch.id),countryCode:launch.country_code,countryName:launch.country_name,version:launch.version,status:launch.status,active:Boolean(launch.active),readiness:launch.readiness||null,health:{status:health.status||'unknown',blockers:(health.blockers||[]).length,warnings:(health.warnings||[]).length,score:health.score??null,next:health.next||null}});
  }
  const active=products.filter(x=>x.active);
  const blocked=products.filter(x=>x.health.blockers>0);
  return {
    version:PRODUCT_MONITOR_VERSION,
    authority:'projection-only: product health, launch, verification and assignment authorities remain owners',
    scope:{countryCode:country,sectorCode:sector},
    summary:{products:products.length,active:active.length,blocked:blocked.length,buildNeedsAttention:Number(build.summary?.needsAttention||0),verificationFailed:Number(verification?.failed||verification?.failedRuns||0),assignmentConflicts:Number(assignment.reconciliationConflicts||0)},
    products,
    verification,
    assignment,
    next:blocked.length?{kind:'attention',message:`${blocked.length} product${blocked.length===1?'':'s'} require attention.`}:active.length?{kind:'monitor',message:'Active products are running; continue monitoring health and evidence.'}:{kind:'build',message:'No active product in this scope. Continue Build to prepare and launch one.'}
  };
}
