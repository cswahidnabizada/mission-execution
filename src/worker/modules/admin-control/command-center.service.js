import {RELEASE_VERSION} from '../../core/release.js';
import {productVerificationSummary} from './product-verification-engine.service.js';
import {getControlPlane} from './control-plane.service.js';
import {getProductBuildControl} from '../../security/product-build-control.service.js';
import {getProductMonitor} from './product-monitor-control.service.js';
import {evaluateProductLaunchReadiness} from '../../security/product-launch-readiness.service.js';
import {clean} from './admin-control.utils.js';
import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';

const parseJson=v=>{try{return JSON.parse(String(v??'{}'))??{};}catch{return {};}};
const observe=async(authority,fn)=>{
  try{return {status:'ready',authority,data:await fn()};}
  catch(error){return {status:'unavailable',authority,code:error?.code||'AUTHORITY_UNAVAILABLE',message:'Canonical authority could not be read; no empty state was inferred.'};}
};
const countBy=(rows,key='status')=>Object.fromEntries((rows||[]).map(x=>[String(x[key]||'unknown'),Number(x.count||0)]));

export const COMMAND_CENTER_VERSION=RELEASE_VERSION;

/**
 * Unified Control Plane projection.
 * This service composes canonical authorities; it does not own domain truth.
 */
export async function getPlatformCommandCenter(env,filters={}){
  const country=clean(filters.countryCode,2).toUpperCase();
  const sector=clean(filters.sectorCode,80).toLowerCase();
  const where=[];const binds=[];
  if(country){where.push('cmp.country_code=?');binds.push(country)}
  if(sector){where.push('cmp.sector_code=?');binds.push(sector)}
  const scoped=where.length?`WHERE ${where.join(' AND ')}`:'';

  const [companies,countries,launches,configs,plans,reviews,activePolicies,operations,verification,latestLaunches,controlPlane,build,monitor]=await Promise.all([
    observe('company_management',()=>canonicalFirst(env,`SELECT COUNT(DISTINCT c.id) count, SUM(CASE WHEN cmp.compliance_status='compliant' THEN 1 ELSE 0 END) compliant FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.deletion_status='active'${country?' AND cmp.country_code=?':''}${sector?' AND cmp.sector_code=?':''}`,binds,'admin.command_center.company_summary')),
    observe('product_country_catalog',()=>canonicalFirst(env,`SELECT COUNT(*) count FROM platform_product_country_catalog WHERE active=1`,[],'admin.command_center.product_country_summary')),
    observe('country_product_launch',()=>canonicalAll(env,`SELECT status,COUNT(*) count FROM country_product_launches ${country?'WHERE country_code=?':''} GROUP BY status`,country?[country]:[],'admin.command_center.launch_summary')),
    observe('platform_configuration',()=>canonicalAll(env,`SELECT domain_code,config_key,active,status,version,updated_at FROM platform_configuration_versions WHERE active=1 ORDER BY domain_code,config_key,version DESC`,[],'admin.command_center.configuration_summary')),
    observe('plans',()=>canonicalFirst(env,`SELECT COUNT(*) count FROM plans WHERE active=1`,[],'admin.command_center.plan_summary')),
    observe('verification_profiles',()=>canonicalFirst(env,`SELECT COUNT(*) count FROM verification_profiles WHERE review_status='pending'`,[],'admin.command_center.verification_summary')),
    observe('jurisdiction_policy',()=>canonicalFirst(env,`SELECT COUNT(*) count FROM jurisdiction_policies WHERE status='active'`,[],'admin.command_center.policy_summary')),
    observe('platform_admin_operations',()=>canonicalAll(env,`SELECT id,action_code,resource_type,resource_id,status,error_code,started_at,completed_at,updated_at FROM platform_admin_operations ORDER BY id DESC LIMIT 16`,[],'admin.command_center.operations')),
    observe('product_verification',()=>productVerificationSummary(env)),
    observe('country_product_launch_listing',()=>canonicalAll(env,`SELECT id,country_code,country_name,status,version,active,updated_at,created_at FROM country_product_launches ${country?'WHERE country_code=?':''} ORDER BY active DESC,id DESC LIMIT 24`,country?[country]:[],'admin.command_center.launch_listing')),
    observe('control_plane',()=>getControlPlane(env)),
    observe('product_build_control',()=>getProductBuildControl(env,{countryCode:country,sectorCode:sector,limit:120})),
    observe('product_monitor',()=>getProductMonitor(env,{countryCode:country,sectorCode:sector}))
  ]);

  const launchRows=launches.status==='ready'?(launches.data?.results||[]):[];
  const launchMap=countBy(launchRows);
  const activeConfigs=configs.status==='ready'?(configs.data?.results||[]).filter(x=>Number(x.active)===1):[];
  const required=['capabilities:catalog','roles:action_policy','rendering:product_experience','guidance:user_journey','policy:default','mission_rules:intake'];
  const activeConfigKeys=new Set(activeConfigs.map(x=>`${x.domain_code}:${x.config_key}`));
  const missingConfigurations=required.filter(k=>!activeConfigKeys.has(k));
  const readyConfigs=required.length-missingConfigurations.length;
  const readiness=Math.round((readyConfigs/required.length)*100);
  const activeCountries=await canonicalFirst(env,`SELECT COUNT(DISTINCT country_code) count FROM country_product_launches WHERE status='active' AND active=1`,[],'admin.command_center.active_countries');
  const activeCountrySectors=await canonicalFirst(env,`SELECT COUNT(*) count FROM country_product_launches WHERE status='active' AND active=1`,[],'admin.command_center.active_country_sectors');
  const latestVerification=(verification.status==='ready'?(verification.data?.latest||[])[0]:null)||null;
  const hasSuccessfulVerification=Number(activeCountries?.count||0)>0&&verification.status==='ready'&&(verification.data?.latest||[]).some(x=>x.status==='succeeded');
  const verificationOpen=Number(activeCountries?.count||0)>0&&!hasSuccessfulVerification;
  const pendingReviews=reviews.status==='ready'?Number(reviews.data?.count||0):null;
  const draftLaunches=Number(launchMap.draft||0);
  const validatedLaunches=Number(launchMap.validated||0);
  const openWork=(pendingReviews??0)+draftLaunches+validatedLaunches+(readiness<100?1:0)+(verificationOpen?1:0);
  const productStatus=Number(activeCountries?.count||0)>0?'OPERATING':readiness===100?'READY TO LAUNCH':'IN PREPARATION';
  const activeProductCount=Number(activeCountrySectors?.count||0);
  const recentOperations=operations.status==='ready'?(operations.data?.results||[]).map(x=>({...x,id:Number(x.id)})):[];
  const operationInFlight=recentOperations.filter(x=>['preparing','executing','verifying'].includes(x.status)).length;
  const operationFailures=recentOperations.filter(x=>['failed','reconciliation_required'].includes(x.status)).length;
  const buildSummary=build.status==='ready'?(build.data?.summary||{}):null;
  const monitorSummary=monitor.status==='ready'?(monitor.data?.summary||{}):null;
  const verificationData=verification.status==='ready'?verification.data:null;
  const control=controlPlane.status==='ready'?controlPlane.data:null;

  const action=readiness<100?{key:'product-publisher',label:'CONTINUE PRODUCT BUILD',reason:`${required.length-readyConfigs} required product configuration authorities are not active.`,result:'Complete the canonical configuration needed for governed product release.'}
    :draftLaunches>0?{key:'product-publisher',label:'VALIDATE PRODUCT DRAFT',reason:'A product draft is waiting for validation.',result:'Move the governed release toward authorization.'}
    :validatedLaunches>0?{key:'product-publisher',label:'ACTIVATE VALIDATED PRODUCT',reason:'A validated product version is waiting for activation.',result:'Activate only the validated release through the canonical launch authority.'}
    :verificationOpen?{key:'product-verification',label:'RUN PRODUCT VERIFICATION',reason:'An active product requires successful live verification.',result:'Prove the live product end-to-end and persist evidence.'}
    :(pendingReviews||0)>0?{key:'verification',label:'RESOLVE VERIFICATION WORK',reason:'Pending trust decisions remain.',result:'Complete governed verification decisions.'}
    :operationFailures>0?{key:'system-health',label:'RECONCILE FAILED OPERATIONS',reason:'Recent administrative operations require review.',result:'Resolve interrupted or failed operations without bypassing canonical authorities.'}
    :{key:'product-health',label:'OPEN PRODUCT MONITOR',reason:'No immediate blocking work is detected.',result:'Monitor active product health and evidence.'};

  const next=draftLaunches>0?{key:'product-publisher',label:'OPEN COUNTRY PRODUCT',reason:'Draft product versions must be validated before activation.'}
    :validatedLaunches>0?{key:'product-publisher',label:'OPEN RELEASE WORKSPACE',reason:'Validated product versions are candidates for governed activation.'}
    :verificationOpen?{key:'product-verification',label:'OPEN VERIFICATION',reason:'Live verification is part of the release proof chain.'}
    :(pendingReviews||0)>0?{key:'verification',label:'OPEN VERIFICATION',reason:'Pending verification decisions remain.'}
    :{key:'product-health',label:'OPEN PRODUCT MONITOR',reason:'Review live product health and evidence.'};

  // The frontend owns workspace vocabulary, grouping and descriptions.
  // The Control Plane returns only canonical dynamic state keyed by workspace route.
  const unavailable=[companies,countries,launches,configs,plans,reviews,activePolicies,operations,verification,latestLaunches,controlPlane,build,monitor].filter(x=>x.status==='unavailable');
  const workspaceStates=[
    {key:'product-publisher',status:readiness===100?'READY':'ATTENTION',count:buildSummary?.total??null,action:'product-publisher'},
    {key:'data-catalog',status:'CATALOG',count:control?.overview?.productCountryCount??null,action:'data-catalog'},
    {key:'countries',status:'FOUNDATION',count:control?.countries?.length??null,action:'countries'},
    {key:'product-verification',status:verification.status==='ready'?(verificationData?.status||'READY').toUpperCase():'UNAVAILABLE',count:verificationData?.totalRuns??verificationData?.runs??null,action:'product-verification'},
    {key:'product-health',status:monitor.status==='ready'?(monitorSummary?.blocked?'ATTENTION':'HEALTHY'):'UNAVAILABLE',count:monitorSummary?.products??null,action:'product-health'},
    {key:'system-health',status:operationFailures?'ATTENTION':'LIVE',count:recentOperations.length,action:'system-health'},
    {key:'companies',status:'CANONICAL',count:control?.overview?.companyCount??null,action:'companies'},
    {key:'roles',status:'CANONICAL',count:control?.roles?.length??null,action:'roles'},
    {key:'subscriptions',status:'COMMERCIAL',count:control?.plans?.length??null,action:'subscriptions'},
    {key:'billing',status:'GOVERNED',count:null,action:'billing'},
    {key:'policies',status:'CANONICAL',count:activePolicies?.count==null?null:Number(activePolicies.count),action:'policies'},
    {key:'consent',status:'CANONICAL',count:control?.consentPolicies?.length??null,action:'consent'},
    {key:'residency',status:'CANONICAL',count:control?.residency?.length??null,action:'residency'},
    {key:'providers',status:'GOVERNED',count:null,action:'providers'},
    {key:'analytics-governance',status:'GOVERNED',count:null,action:'analytics-governance'},
    {key:'privacy-rights',status:'GOVERNED',count:null,action:'privacy-rights'},
    {key:'certification',status:unavailable.length?'UNAVAILABLE':'CHECK',count:null,action:'certification'},
    {key:'audit',status:'AUDIT',count:control?.audit?.length??null,action:'audit'},
    {key:'security',status:unavailable.length?'CHECK':'PROTECTED',count:null,action:'security'},
    {key:'backup-recovery',status:'RECOVERY',count:null,action:'backup-recovery'},
    {key:'trash',status:'CONTROLLED',count:null,action:'trash'},
    {key:'data-control',status:'CONTROLLED',count:null,action:'data-control'},
    {key:'data-entry',status:'CANONICAL',count:null,action:'data-entry'},
    {key:'verification',status:pendingReviews?'ATTENTION':'READY',count:pendingReviews,action:'verification'},
    {key:'notifications',status:'GOVERNED',count:null,action:'notifications'},
    {key:'missions',status:'CANONICAL',count:null,action:'missions'}
  ];

  const lifecycle=[
    {key:'draft',label:'DRAFT',count:draftLaunches},
    {key:'validated',label:'VALIDATED',count:validatedLaunches},
    {key:'authorized',label:'AUTHORIZED',count:Number(launchMap.authorized||0)},
    {key:'published',label:'PUBLISHED',count:Number(launchMap.published||0)},
    {key:'verified',label:'VERIFIED',count:Number(launchMap.verified||0)},
    {key:'live',label:'LIVE',count:Number(launchMap.live||launchMap.active||0)}
  ];

  const launchListing=latestLaunches.status==='ready'?(latestLaunches.data?.results||[]).map(x=>({id:Number(x.id),countryCode:x.country_code,countryName:x.country_name,status:x.status,version:x.version,active:Boolean(x.active),updatedAt:x.updated_at||x.created_at})):[];
  const readinessQueue=readiness<100?[{type:'platform',title:'Product preparation',status:'attention',label:'Continue build',action:'product-publisher',reason:`${required.length-readyConfigs} required product configuration authorities are not active.`}]:[];
  const queue=[
    ...readinessQueue,
    ...launchListing.filter(x=>['draft','validated','authorized','published','verified'].includes(x.status)).slice(0,8).map(x=>({type:'product',title:`${x.countryName||x.countryCode} · v${x.version}`,status:x.status,label:x.status==='draft'?'Validate':x.status==='validated'?'Activate':x.status==='authorized'?'Publish':x.status==='published'?'Verify':'Go Live',action:'product-publisher',resourceId:x.id})),
    ...(verificationData?.latest||[]).slice(0,4).map(x=>({type:'verification',title:`Verification run #${x.id}`,status:x.status,label:x.status==='succeeded'?'Verified':'Review',action:'product-verification',resourceId:x.id})),
    ...recentOperations.filter(x=>['failed','reconciliation_required','preparing','executing','verifying'].includes(x.status)).slice(0,6).map(x=>({type:'operation',title:x.action_code||'Administrative operation',status:x.status,label:x.status==='reconciliation_required'?'Reconcile':'Inspect',action:'system-health',resourceId:x.id}))
  ].slice(0,16);

  const surfaceStatus=unavailable.length?'DEGRADED':(operationFailures?'DEGRADED':(verificationOpen||readiness<100?'ATTENTION':'HEALTHY'));
  const surface={
    status:surfaceStatus,
    version:COMMAND_CENTER_VERSION,
    stats:[
      {key:'active-countries',label:'Active countries',value:Number(activeCountries?.count||0),action:'countries'},
      {key:'active-products',label:'Active products',value:activeProductCount,action:'product-health'},
      {key:'readiness',label:'Platform readiness',value:`${readiness}%`,action:'product-publisher'},
      {key:'open-work',label:'Open work',value:openWork,action:action.key},
      {key:'organizations',label:'Organizations',value:companies.status==='ready'?Number(companies.data?.count||0):null,action:'companies'},
      {key:'in-flight',label:'In-flight operations',value:operationInFlight,action:'system-health'}
    ],
    workspaceStates,
    lifecycle,
    queue,
    preview:{productStatus,activeCountries:Number(activeCountries?.count||0),activeProducts:activeProductCount,readinessPercent:readiness,pendingReviews,latestVerification,buildSummary,monitorSummary},
    scope:{countryCode:country||null,sectorCode:sector||null},
    unavailableAuthorities:unavailable.map(x=>({authority:x.authority,code:x.code||'AUTHORITY_UNAVAILABLE'})),
    configurationGaps:{required:required.length,active:readyConfigs,missing:missingConfigurations}
  };

  let productLens={countryCode:country||null,sectorCode:sector||null,availability:'PLATFORM',launchStatus:'—',productState:'SELECT A SCOPE',organizationCount:0,compliantOrganizations:0,result:'Select a country and sector.',readiness:null};
  if(country||sector){
    const organizationCount=companies.status==='ready'?Number(companies.data?.count||0):0;
    const compliantOrganizations=companies.status==='ready'?Number(companies.data?.compliant||0):0;
    const activeLaunch=country?await canonicalFirst(env,`SELECT id,status,version,manifest_json FROM country_product_launches WHERE status='active' AND active=1 AND country_code=? ORDER BY id DESC LIMIT 1`,[country],'admin.command_center.active_launch'):null;
    const countryExists=country?await canonicalFirst(env,`SELECT code,name FROM platform_product_country_catalog WHERE code=? AND active=1 LIMIT 1`,[country],'admin.command_center.country'):null;
    const manifest=activeLaunch?parseJson(activeLaunch.manifest_json):{};
    const manifestSectors=Array.isArray(manifest?.eligibility?.sectors)?manifest.eligibility.sectors:[];
    const sectorAllowed=!sector||manifestSectors.length===0||manifestSectors.includes(sector);
    const readinessResult=country?await evaluateProductLaunchReadiness(env,{countryCode:country,sectorCode:sector||manifestSectors[0]||'general',manifest,launchId:activeLaunch?.id||null}):null;
    const activeForScope=Boolean(activeLaunch&&sectorAllowed);
    productLens={countryCode:country||null,sectorCode:sector||null,availability:activeForScope?'AVAILABLE':countryExists?'CONFIGURED — NOT LAUNCHED':'NOT CONFIGURED',launchStatus:activeForScope?`v${activeLaunch.version} active`:(activeLaunch&&!sectorAllowed?'Country active, selected sector not enabled':countryExists?'No active product launch':'Country not configured'),productState:activeForScope&&organizationCount>0?'OPERATING PRODUCT':activeForScope?'AVAILABLE PRODUCT':countryExists?'PREPARE PRODUCT':'OUTSIDE PRODUCT SCOPE',organizationCount,compliantOrganizations,result:activeForScope&&readinessResult?.valid===true?'The selected country + sector is connected to an active, readiness-validated product surface.':readinessResult?.blockers?.length?`${readinessResult.blockers.length} launch readiness blocker${readinessResult.blockers.length===1?'':'s'} remain before this scope can be considered fully ready.`:'The selected scope is not yet an active product surface.',readiness:readinessResult};
  }

  return {
    surface,now:{productStatus,productReason:productStatus==='OPERATING'?'At least one country product is active.':'No active country product is currently exposed.',activeCountries:Number(activeCountries?.count||0),activeCountrySectors:activeProductCount,openWork,pendingReviews,draftLaunches,readinessPercent:readiness,activeConfigurations:activeConfigs.length,missingConfigurations,activePlans:plans.status==='ready'?Number(plans.data?.count||0):null,verificationSummary:verificationData,latestVerification,action:action.reason,actionKey:action.key,actionLabel:action.label,reason:action.reason,result:action.result},next:{action:next.label,actionKey:next.key,actionLabel:next.label,reason:next.reason,result:'Move one governed product state forward without bypassing canonical authorities.'},future:{result:'Expand product country by country and sector by sector with governed configuration and evidence.',reason:'Every expansion should create a measurable product result rather than another administrative screen.',expansion:'Platform capability → policy → country → sector → eligible users → operational result'},productVerification:verificationData,productLens,recentOperations,metadata:{workspaceGovernance:RELEASE_VERSION,activePolicyCount:Number(activePolicies?.data?.count||0),countryCount:Number(countries?.data?.count||0),openAdministrativeOperations:operationInFlight},authorities:{controlPlane:controlPlane.status,build:build.status,monitor:monitor.status,verification:verification.status}
  };
}
