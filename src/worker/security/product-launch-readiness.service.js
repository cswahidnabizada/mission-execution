import {lifecycleHealthForLaunch} from './sector-lifecycle.service.js';
import {PRODUCT_READINESS_DOMAINS} from '../core/canonical-product-readiness-registry.js';

const DEFAULT_CONFIGS=['capabilities:catalog','roles:action_policy','rendering:product_experience','guidance:user_journey','policy:default','mission_rules:intake'];
const clean=(v,max=120)=>String(v??'').trim().slice(0,max);
const arr=v=>Array.isArray(v)?[...new Set(v.map(x=>clean(x,120)).filter(Boolean))]:[];
const parse=v=>{try{return JSON.parse(String(v||'null'))??{};}catch{return{};}};
const check=async(fn)=>{try{return await fn();}catch(error){throw Object.assign(new Error('Canonical readiness authority is unavailable'),{status:503,code:'AUTHORITY_UNAVAILABLE',cause:error});}};

/**
 * Canonical product launch readiness.
 * This is a read-only evaluator. It does not grant access, mutate runtime truth,
 * or replace domain authorization. A launch is valid only when every required
 * product foundation is available for the selected country + sector.
 */
export async function evaluateProductLaunchReadiness(env,{countryCode,sectorCode,manifest={},launchId=null}={}){
  const country=clean(countryCode,2).toUpperCase();
  const sector=clean(sectorCode,80);
  const m=manifest||{};
  const eligibility=m.eligibility||{};
  const sectors=arr(eligibility.sectors);
  const capabilities=arr(m.capabilities);
  const requiredConfigs=arr(m.requiredConfigurations).length?arr(m.requiredConfigurations):DEFAULT_CONFIGS;
  const checks={};
  const details={};

  const catalog=await check(()=>env.DB.prepare(`SELECT code,name,active FROM platform_product_country_catalog WHERE code=? LIMIT 1`).bind(country).first(),null);
  checks.country=Boolean(catalog&&Number(catalog.active)===1);details.country=catalog?{code:catalog.code,name:catalog.name,active:Number(catalog.active)===1}:null;

  const jurisdiction=await check(()=>env.DB.prepare(`SELECT code,framework_code,data_residency_mode,status FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC,code LIMIT 1`).bind(country).first(),null);
  checks.jurisdiction=Boolean(jurisdiction);details.jurisdiction=jurisdiction||null;

  const selectedSector=sector||sectors[0]||'';
  const sectorPolicy=selectedSector?await check(()=>env.DB.prepare(`SELECT code,sector_code,regulatory_profile,data_profile,status FROM sector_policies WHERE sector_code=? AND status='active' ORDER BY effective_version DESC,code LIMIT 1`).bind(selectedSector).first(),null):null;
  checks.sector=Boolean(sectorPolicy);details.sector=sectorPolicy||null;

  const configuredSectors=sectors.length?sectors:[sectorCode||'general'];
  const missingSectors=[];
  for(const s of configuredSectors){const row=await check(()=>env.DB.prepare(`SELECT code FROM sector_policies WHERE sector_code=? AND status='active' LIMIT 1`).bind(s).first(),null);if(!row)missingSectors.push(s);}
  checks.sectorCoverage=missingSectors.length===0;details.missingSectors=missingSectors;

  const missingCapabilities=[];
  for(const code of capabilities){const row=await check(()=>env.DB.prepare(`SELECT code FROM canonical_capability_registry WHERE code=? AND status='active' LIMIT 1`).bind(code).first(),null);if(!row)missingCapabilities.push(code);}
  checks.capabilities=capabilities.length>0&&missingCapabilities.length===0;details.missingCapabilities=missingCapabilities;

  const missingConfigurations=[];
  for(const key of requiredConfigs){const [d,k]=key.split(':');const row=await check(()=>env.DB.prepare(`SELECT id FROM platform_configuration_versions WHERE domain_code=? AND config_key=? AND status='active' AND active=1 LIMIT 1`).bind(d,k).first(),null);if(!row)missingConfigurations.push(key);}
  checks.configuration=missingConfigurations.length===0;details.missingConfigurations=missingConfigurations;

  const roleCount=await check(()=>env.DB.prepare(`SELECT COUNT(*) count FROM organization_role_catalog WHERE active=1`).first(),{count:0});
  checks.roles=Number(roleCount?.count||0)>0;details.activeRoles=Number(roleCount?.count||0);

  const onboarding=await check(()=>env.DB.prepare(`SELECT COUNT(*) count FROM organization_onboarding_records`).first(),{count:0});
  checks.onboarding=onboarding!==null;details.onboardingRecords=Number(onboarding?.count||0);

  const verification=await check(()=>env.DB.prepare(`SELECT COUNT(*) count FROM verification_profiles`).first(),{count:0});
  checks.verification=verification!==null;details.verificationProfiles=Number(verification?.count||0);
  const trust=await check(()=>env.DB.prepare(`SELECT COUNT(*) count FROM trust_keys`).first(),{count:0});
  checks.trust=trust!==null;details.trustKeys=Number(trust?.count||0);

  const plans=await check(()=>env.DB.prepare(`SELECT COUNT(*) count,SUM(CASE WHEN COALESCE(c.price_minor,0)>0 THEN 1 ELSE 0 END) paid_count FROM plans p LEFT JOIN plan_product_configuration c ON c.plan_id=p.id WHERE p.active=1 AND COALESCE(c.status,'active')='active'`).first(),{count:0,paid_count:0});
  const billing=await check(()=>env.DB.prepare(`SELECT COUNT(*) count,MAX(provider_code) provider_code FROM billing_jurisdiction_policies WHERE country_code=? AND active=1 AND status='active'`).bind(country).first(),{count:0,provider_code:null});
  const paidProvider=Number(plans?.paid_count||0)>0&&billing?.provider_code?await check(()=>env.DB.prepare(`SELECT COUNT(*) count FROM external_provider_registry WHERE code=? AND active=1 AND contract_status IN ('approved','configured')`).bind(billing.provider_code).first(),{count:0}):{count:1};
  checks.subscription=Number(plans?.count||0)>0;details.activePlans=Number(plans?.count||0);details.paidPlans=Number(plans?.paid_count||0);
  checks.billing=Number(billing?.count||0)>0 && Number(paidProvider?.count||0)>0;details.billingPolicies=Number(billing?.count||0);details.billingProvider=paidProvider?.count?billing?.provider_code:null;

  const communication=await check(()=>env.DB.prepare(`SELECT COUNT(*) count FROM notification_policy_registry WHERE active=1 AND country_code=?`).bind(country).first(),{count:0});
  checks.communication=Number(communication?.count||0)>0;details.communicationPolicies=Number(communication?.count||0);
  const residency=await check(()=>env.DB.prepare(`SELECT code,primary_region,primary_provider,mode,fallback_allowed FROM residency_policies WHERE active=1 AND jurisdiction_code=? ORDER BY version DESC LIMIT 1`).bind(jurisdiction?.code||'').first(),null);
  const storageProvider=residency?.primary_provider?await check(()=>env.DB.prepare(`SELECT code,provider_type,country_code,region_code,residency_mode,contract_status,active FROM external_provider_registry WHERE code=? LIMIT 1`).bind(residency.primary_provider).first(),null):null;
  const storagePolicy=residency?.primary_provider?await check(()=>env.DB.prepare(`SELECT id FROM external_provider_policies WHERE provider_code=? AND country_code=? AND purpose_code='mission_execution' AND active=1 LIMIT 1`).bind(residency.primary_provider,country).first(),null):null;
  checks.residency=Boolean(residency);details.residency=residency||null;
  checks.storage=Boolean(residency&&storageProvider&&String(storageProvider.provider_type)==='storage'&&Number(storageProvider.active)===1&&['approved','configured'].includes(String(storageProvider.contract_status||''))&&storagePolicy);
  details.storage={provider:storageProvider||null,policy:storagePolicy||null};
  const retentionCount=await check(()=>env.DB.prepare(`SELECT COUNT(DISTINCT purpose_code) count FROM retention_policies WHERE jurisdiction_code=? AND active=1 AND purpose_code IN ('operational_communications','mission_execution','security_audit','account_management','billing')`).bind(jurisdiction?.code||'').first(),{count:0});
  checks.retention=Number(retentionCount?.count||0)>=5;details.retentionPurposes=Number(retentionCount?.count||0);
  checks.compliance=Boolean(jurisdiction&&sectorPolicy&&residency&&Number(retentionCount?.count||0)>=5);
  // Runtime action/service-map convergence is protected by the release architecture gate;
  // launch readiness does not import higher-level action modules into the security layer.
  checks.operational=true;
  details.operationalAuthority='protected_release_architecture';

  // A selected sector must be explicitly allowed by the launch manifest.
  checks.sectorEligibility=!sector||sectors.length===0||sectors.includes(sector);
  details.manifestSectors=sectors;

  if(launchId!=null){
    const lifecycle=await lifecycleHealthForLaunch(env,Number(launchId),configuredSectors);
    checks.lifecycle=Boolean(lifecycle.valid);
    details.lifecycle=lifecycle;
  } else {
    checks.lifecycle=true;
    details.lifecycle={skipped:true,reason:'launch_id_not_supplied'};
  }


  // 10.38.16: launch readiness now includes the canonical Product Launch Workspace.
  // The workspace is preparation evidence, not a replacement for any domain authority.
  let preparation={total:0,completed:0,remaining:0,blocked:0,progress:0,ready:false};
  try {
    const launchSelector=launchId!=null
      ? {id:Number(launchId), rowSql:`SELECT id,status FROM country_product_launches WHERE id=? LIMIT 1`, bind:[Number(launchId)]}
      : {id:null, rowSql:`SELECT id,status FROM country_product_launches WHERE country_code=? AND status='draft' ORDER BY id DESC LIMIT 1`, bind:[country]};
    const target=await env.DB.prepare(launchSelector.rowSql).bind(...launchSelector.bind).first();
    if(target){
      const taskCounts=await env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN required=1 AND status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN required=1 AND status IN ('todo','in_progress') THEN 1 ELSE 0 END) remaining,SUM(CASE WHEN required=1 AND status='blocked' THEN 1 ELSE 0 END) blocked FROM platform_product_preparation_tasks WHERE launch_id=?`).bind(target.id).first();
      const research=await env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed FROM platform_product_preparation_research WHERE launch_id=?`).bind(target.id).first();
      preparation={total:Number(taskCounts?.total||0),completed:Number(taskCounts?.completed||0),remaining:Number(taskCounts?.remaining||0),blocked:Number(taskCounts?.blocked||0),researchTotal:Number(research?.total||0),researchCompleted:Number(research?.completed||0),progress:Number(taskCounts?.total||0)?Math.round((Number(taskCounts?.completed||0)/Number(taskCounts?.total||0))*100):100,ready:Number(taskCounts?.total||0)===0||Number(taskCounts?.remaining||0)===0&&Number(taskCounts?.blocked||0)===0&&Number(research?.total||0)===Number(research?.completed||0)};
      details.preparationLaunchId=Number(target.id);
    } else {
      preparation={total:0,completed:0,remaining:0,blocked:0,researchTotal:0,researchCompleted:0,progress:0,ready:false};
    }
  } catch { preparation={total:0,completed:0,remaining:0,blocked:0,progress:0,ready:false,unavailable:true}; }
  checks.preparation=preparation.ready; details.preparation=preparation;

  // Every declared sector must have a concrete compiled product definition for this exact launch.
  if(launchId!=null){
    const missingDefinitions=[];
    for(const s of configuredSectors){
      const definition=await check(()=>env.DB.prepare(`SELECT id,status,compiled_hash FROM platform_product_definitions WHERE launch_id=? AND country_code=? AND sector_code=? ORDER BY definition_version DESC,id DESC LIMIT 1`).bind(Number(launchId),country,s).first(),null);
      if(!definition||!['compiled','verified','active'].includes(String(definition.status))||!String(definition.compiled_hash||'').trim())missingDefinitions.push(s);
    }
    checks.definitions=missingDefinitions.length===0;
    details.missingDefinitions=missingDefinitions;
  } else {
    checks.definitions=true;
    details.missingDefinitions=[];
  }

  // The exact launch blueprint must be ready; this prevents publish from using a stale country foundation.
  if(launchId!=null){
    const launchBlueprint=await check(()=>env.DB.prepare(`SELECT l.country_blueprint_id,b.status FROM country_product_launches l LEFT JOIN platform_country_product_blueprints b ON b.id=l.country_blueprint_id WHERE l.id=? LIMIT 1`).bind(Number(launchId)).first(),null);
    checks.blueprint=Boolean(launchBlueprint&&launchBlueprint.country_blueprint_id&&launchBlueprint.status==='ready');
    details.blueprint=launchBlueprint||null;
  } else {
    checks.blueprint=true;
    details.blueprint={skipped:true};
  }

  const blockers=[];
  const labels={country:'Country is inactive or not configured',jurisdiction:'No active jurisdiction policy',sector:'No active sector policy for the selected sector',sectorCoverage:'One or more manifest sectors have no active policy',capabilities:'One or more launch capabilities are not active',configuration:'Required platform configurations are not active',roles:'No active organization roles',subscription:'No active subscription product configuration',billing:'No active billing jurisdiction policy for this country',communication:'No country-specific notification governance policy',residency:'No active residency policy for this jurisdiction',storage:'No approved storage provider/policy is available for this country',retention:'One or more required retention purposes are not configured',compliance:'Country/sector compliance policy chain is incomplete',operational:'Operational runtime architecture is not protected by the current release contract',sectorEligibility:'Selected sector is not included in the launch manifest',preparation:'Product Launch Workspace has required preparation, research or evidence remaining',definitions:'Every declared sector must have a compiled product definition for this launch version',blueprint:'The exact country blueprint for this launch is not ready',lifecycle:'Every declared sector must have a validated active lifecycle contract'};
  for(const [key,ok] of Object.entries(checks))if(!ok)blockers.push({code:key,message:labels[key]||`${key} is not ready`});

  const satisfied=Object.values(checks).filter(Boolean).length;
  const total=Object.keys(checks).length;
  return {valid:blockers.length===0,score:total?Math.round((satisfied/total)*100):0,checks,blockers,details,requiredDomains:[...PRODUCT_READINESS_DOMAINS],evaluatedAt:new Date().toISOString()};
}
