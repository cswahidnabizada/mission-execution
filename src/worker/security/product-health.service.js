import {RELEASE_VERSION} from '../core/release.js';
import {getCountryBlueprint,prepareCountryBlueprintForLaunch} from './country-product-blueprint.service.js';
import {evaluateProductLaunchReadiness} from './product-launch-readiness.service.js';
import {resolveRuntimeProductManifest} from './product-manifest-runtime.service.js';
import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';

export const PRODUCT_HEALTH_VERSION=RELEASE_VERSION;
export const PRODUCT_HEALTH_DOMAINS=Object.freeze(['Definition','Composition','Dependencies','Capabilities','Experience','Journeys','Verification','Runtime']);
const EXPERIENCE_TYPES=new Set(['workspace','section','navigation','card','panel','form','empty-state','guidance']);
const parse=v=>{try{return JSON.parse(v||'{}')}catch{return null}};
const arr=v=>Array.isArray(v)?v:[];
const issue=(code,severity,message,stage,details={})=>({code,severity,message,stage,details});
const query=async(env,sql,...binds)=>canonicalFirst(env,sql,binds,'product_health');

function add(list,code,severity,message,stage,details){list.push(issue(code,severity,message,stage,details));}

export async function getProductHealth(env,{countryCode='',sectorCode='',definitionId=null,launchId=null}={}){
  const blockers=[],warnings=[],checks=[];
  const country=String(countryCode||'').trim().toUpperCase();
  const sector=String(sectorCode||'').trim().toLowerCase();
  const selectedDefinition=definitionId?await query(env,'SELECT * FROM platform_product_definitions WHERE id=? LIMIT 1',Number(definitionId)):null;
  const selectedLaunch=launchId?await query(env,'SELECT * FROM country_product_launches WHERE id=? LIMIT 1',Number(launchId)):null;
  const scopeCountry=country||String(selectedDefinition?.country_code||selectedLaunch?.country_code||'').toUpperCase();
  const scopeSector=sector||String(selectedDefinition?.sector_code||'').toLowerCase();

  const secretConfigured=Boolean(String(env.PLATFORM_SUPER_ADMIN_SECRET||'').trim());
  checks.push({key:'admin.secret',status:secretConfigured?'pass':'blocker',stage:'login'});
  if(!secretConfigured)add(blockers,'ADMIN_SECRET_NOT_CONFIGURED','blocker','Platform administrator authentication is not configured.','login');
  const ipRestricted=Boolean(String(env.PLATFORM_SUPER_ADMIN_ALLOWED_IPS||'').trim());
  checks.push({key:'admin.ip-restriction',status:ipRestricted?'pass':'warning',stage:'login'});
  if(!ipRestricted)add(warnings,'ADMIN_IP_RESTRICTION_NOT_CONFIGURED','warning','Platform administrator access has no explicit IP allowlist configured.','login');

  let catalog=null,blueprint=null,launch=null,definition=null;
  if(scopeCountry){
    catalog=await query(env,'SELECT code,name,active FROM platform_product_country_catalog WHERE code=? LIMIT 1',scopeCountry);
    if(!catalog||Number(catalog.active)!==1)add(blockers,'COUNTRY_NOT_CONFIGURED','blocker','Selected country is not active in the country catalog.','country',{countryCode:scopeCountry});
    else checks.push({key:'country.catalog',status:'pass',stage:'country'});
    blueprint=await query(env,'SELECT * FROM platform_country_product_blueprints WHERE country_code=? LIMIT 1',scopeCountry);
    if(!blueprint)add(blockers,'COUNTRY_BLUEPRINT_MISSING','blocker','No reusable country product foundation exists.','blueprint',{countryCode:scopeCountry});
    else {
      checks.push({key:'country.blueprint',status:'pass',stage:'blueprint',id:Number(blueprint.id)});
      const b=await getCountryBlueprint(env,Number(blueprint.id));
      if(b){
        const requiredSectors=arr(b.sectors).filter(x=>x.required);
        const requiredContents=arr(b.contents).filter(x=>x.required);
        const requiredLegal=arr(b.legalRequirements).filter(x=>x.required);
        const missing=[...requiredSectors.filter(x=>x.status!=='ready').map(x=>`sector:${x.sector_code}`),...requiredContents.filter(x=>!String(x.body||'').trim()||x.status!=='ready').map(x=>`content:${x.content_key}:${x.language_code}`),...requiredLegal.filter(x=>x.status!=='reviewed').map(x=>`legal:${x.requirement_key}`),...(!arr(b.languages).some(x=>x.is_primary)?['language:primary']:[])];
        if(missing.length)add(blockers,'COUNTRY_FOUNDATION_INCOMPLETE','blocker','Country foundation is not launch-ready.', 'blueprint',{missing});
        else checks.push({key:'country.foundation',status:'pass',stage:'blueprint'});
      }
    }
    launch=selectedLaunch||await query(env,"SELECT * FROM country_product_launches WHERE country_code=? AND status IN ('draft','validated','active') ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'validated' THEN 1 ELSE 2 END,id DESC LIMIT 1",scopeCountry);
    if(!launch)add(blockers,'PRODUCT_LAUNCH_MISSING','blocker','No product launch version exists for this country.','launch',{countryCode:scopeCountry});
    else {
      const manifest=parse(launch.manifest_json);
      if(!manifest)add(blockers,'LAUNCH_MANIFEST_INVALID','blocker','The selected product launch manifest is not valid JSON.','launch',{launchId:Number(launch.id)});
      else checks.push({key:'launch.manifest',status:'pass',stage:'launch',id:Number(launch.id)});
      if(blueprint&&Number(launch.country_blueprint_id||0)!==Number(blueprint.id))add(blockers,'LAUNCH_BLUEPRINT_MISMATCH','blocker','The product launch is not linked to the current country foundation.','launch',{launchId:Number(launch.id),blueprintId:Number(blueprint.id),linkedBlueprintId:launch.country_blueprint_id});
      const launchSector=scopeSector||arr(manifest?.eligibility?.sectors)[0]||'general';
      if(scopeSector&&arr(manifest?.eligibility?.sectors).length&&!arr(manifest?.eligibility?.sectors).includes(scopeSector))add(blockers,'LAUNCH_SECTOR_NOT_ALLOWED','blocker','Selected sector is not included in the product launch manifest.','launch',{sectorCode:scopeSector,sectors:arr(manifest?.eligibility?.sectors)});
      const readiness=await evaluateProductLaunchReadiness(env,{countryCode:scopeCountry,sectorCode:launchSector,manifest:manifest||{},launchId:launch?.id||null}).catch(e=>({valid:false,blockers:[{code:'READINESS_EVALUATION_FAILED',message:e.message}]}));
      checks.push({key:'launch.readiness',status:readiness.valid?'pass':'blocker',stage:'launch',score:readiness.score,blockers:readiness.blockers||[]});
      if(!readiness.valid)add(blockers,'LAUNCH_READINESS_BLOCKED','blocker','Country product launch readiness has unresolved blockers.','launch',{blockers:readiness.blockers||[]});
    }
  } else {
    add(blockers,'PRODUCT_SCOPE_NOT_SELECTED','blocker','Select a country or product definition to evaluate product health.','scope');
  }

  if(selectedDefinition){definition=selectedDefinition;}
  else if(scopeCountry){
    const launchClause=selectedLaunch?' AND launch_id=?':'';
    const binds=scopeSector?[scopeCountry,scopeSector,...(selectedLaunch?[Number(selectedLaunch.id)]:[])]:[scopeCountry,...(selectedLaunch?[Number(selectedLaunch.id)]:[])];
    definition=await query(env,`SELECT * FROM platform_product_definitions WHERE country_code=? ${scopeSector?'AND sector_code=?':''}${launchClause} ORDER BY updated_at DESC,id DESC LIMIT 1`,...binds);
  }
  if(!definition)add(blockers,'PRODUCT_DEFINITION_MISSING','blocker','No product definition exists for the selected country/sector.','definition',{countryCode:scopeCountry,sectorCode:scopeSector||null});
  else {
    const defCountry=String(definition.country_code||'').toUpperCase(),defSector=String(definition.sector_code||'').toLowerCase();
    if(scopeCountry&&defCountry!==scopeCountry)add(blockers,'DEFINITION_COUNTRY_MISMATCH','blocker','Product definition country does not match the selected scope.','definition',{definitionCountry:defCountry,scopeCountry});
    if(scopeSector&&defSector!==scopeSector)add(blockers,'DEFINITION_SECTOR_MISMATCH','blocker','Product definition sector does not match the selected scope.','definition',{definitionSector:defSector,scopeSector});
    if(launch&&Number(definition.launch_id||0)!==Number(launch.id||0))add(blockers,'DEFINITION_LAUNCH_MISMATCH','blocker','Product definition is not linked to the selected product launch version.','definition',{definitionLaunchId:definition.launch_id,launchId:launch.id});
    const components=(await canonicalAll(env,`SELECT * FROM platform_product_definition_components WHERE definition_id=? AND version=(SELECT MAX(c2.version) FROM platform_product_definition_components c2 WHERE c2.definition_id=platform_product_definition_components.definition_id AND c2.component_type=platform_product_definition_components.component_type AND c2.component_key=platform_product_definition_components.component_key) ORDER BY component_type,component_key`,[Number(definition.id)],'product_health')).results||[];
    const componentTypes=new Set(components.map(c=>c.component_type));
    if(!componentTypes.has('identity'))add(blockers,'DEFINITION_IDENTITY_MISSING','blocker','Product definition has no identity component.','definition');
    const bad=components.filter(c=>c.status==='blocked');
    const draft=components.filter(c=>c.status==='draft');
    if(bad.length)add(blockers,'DEFINITION_COMPONENT_BLOCKED','blocker','One or more product definition components are blocked.','composition',{components:bad.map(x=>`${x.component_type}:${x.component_key}`)});
    if(draft.length)add(warnings,'DEFINITION_COMPONENTS_DRAFT','warning','One or more product definition components remain in draft status.','composition',{components:draft.map(x=>`${x.component_type}:${x.component_key}`)});
    const experiences=components.filter(c=>c.component_type==='experience').flatMap(c=>{const p=parse(c.payload_json);return p?[p]:[]});
    if(!experiences.length)add(blockers,'EXPERIENCE_MISSING','blocker','No declarative experience component is present.','experience');
    else {
      const unsupported=experiences.flatMap(x=>arr(x.sections).filter(s=>s?.type&&!EXPERIENCE_TYPES.has(String(s.type))).map(s=>String(s.type)));
      if(unsupported.length)add(blockers,'EXPERIENCE_PRIMITIVE_UNTRUSTED','blocker','Experience contains a UI primitive outside the trusted renderer vocabulary.','experience',{types:[...new Set(unsupported)]});
      else checks.push({key:'experience.trusted',status:'pass',stage:'experience'});
    }
    if(!definition.compiled_hash||!definition.compiled_version)add(blockers,'DEFINITION_NOT_COMPILED','blocker','Product definition has not produced a compiled manifest.','compile');
    else {
      const manifestRow=await query(env,'SELECT id,definition_version,manifest_json,manifest_hash,status FROM platform_product_definition_manifests WHERE definition_id=? AND definition_version=? AND manifest_hash=? ORDER BY id DESC LIMIT 1',Number(definition.id),Number(definition.compiled_version),String(definition.compiled_hash));
      if(!manifestRow)add(blockers,'COMPILED_MANIFEST_MISSING','blocker','Compiled hash exists but its manifest record cannot be found.','compile');
      else {
        const manifest=parse(manifestRow.manifest_json);
        if(!manifest)add(blockers,'COMPILED_MANIFEST_INVALID','blocker','Compiled product manifest is not valid JSON.','compile');
        else {
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(manifest)));
          const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
          if(hash!==String(manifestRow.manifest_hash)||hash!==String(definition.compiled_hash))add(blockers,'COMPILED_MANIFEST_INTEGRITY_FAILED','blocker','Compiled manifest integrity hash does not match the canonical definition.','compile');
          else checks.push({key:'compile.integrity',status:'pass',stage:'compile',manifestId:Number(manifestRow.id)});
        }
      }
    }
  }

  if(scopeCountry&&launch&&String(launch.status)==='active'){
    const runtime=await resolveRuntimeProductManifest(env,{countryCode:scopeCountry,role:'tenant_admin'},{countryCode:scopeCountry,sectorCode:scopeSector||undefined}).catch(e=>({available:false,reason:'RUNTIME_HEALTH_CHECK_FAILED',error:e.message}));
    if(runtime.available)checks.push({key:'runtime.available',status:'pass',stage:'runtime',integrity:runtime.integrity||null});
    else add(warnings,'RUNTIME_NOT_AVAILABLE_FOR_ADMIN_CONTEXT','warning',`Runtime is not consumable from the current administrative test context (${runtime.reason||'unknown'}).`,'runtime',{reason:runtime.reason});
    const verified=await query(env,`SELECT id,status,launch_version,passed_count,failed_count,blocked_count,completed_at FROM platform_product_verification_runs WHERE country_code=? AND sector_code=? AND launch_id=? ORDER BY id DESC LIMIT 1`,scopeCountry,scopeSector||'general',Number(launch.id));
    if(!verified||verified.status!=='succeeded')add(blockers,'PRODUCT_VERIFICATION_MISSING','blocker','No successful product verification run exists for the active launch and sector.','verification',{launchId:Number(launch.id),latestStatus:verified?.status||null});
    else checks.push({key:'verification.latest',status:'pass',stage:'verification',runId:Number(verified.id)});
  } else if(launch){
    add(warnings,'RUNTIME_NOT_ACTIVE','warning','Runtime consumption is not expected until the selected launch is active.','runtime',{launchStatus:launch.status});
  }

  const stageOrder=['definition','composition','compile','manifest','experience','health','readiness','activation','verification','runtime'];
  const stageState={};
  const stageBlockers={...Object.fromEntries(stageOrder.map(x=>[x,[]]))};
  for(const b of blockers){if(stageBlockers[b.stage])stageBlockers[b.stage].push(b);}
  for(const w of warnings){if(stageBlockers[w.stage])stageBlockers[w.stage].push(w);}
  if(stageBlockers.manifest&&stageBlockers.manifest.length===0)checks.push({key:'manifest.runtime-bound',status:'pass',stage:'manifest'});
  if(stageBlockers.health&&stageBlockers.health.length===0)checks.push({key:'health.observed',status:'pass',stage:'health'});
  if(stageBlockers.readiness&&stageBlockers.readiness.length===0)checks.push({key:'readiness.observed',status:'pass',stage:'readiness'});
  if(stageBlockers.activation&&stageBlockers.activation.length===0)checks.push({key:'activation.observed',status:launch?.active?'pass':'warning',stage:'activation'});
  for(const stage of stageOrder){const b=stageBlockers[stage]?.filter(x=>x.severity==='blocker').length||0;const w=stageBlockers[stage]?.filter(x=>x.severity!=='blocker').length||0;stageState[stage]={status:b?'blocked':w?'warning':'ready',blockers:b,warnings:w};}
  const score=Math.max(0,Math.round(((stageOrder.length-blockers.filter(x=>stageOrder.includes(x.stage)).length)/stageOrder.length)*100));
  return {version:PRODUCT_HEALTH_VERSION,scope:{countryCode:scopeCountry||null,sectorCode:scopeSector||null,definitionId:definition?Number(definition.id):null,launchId:launch?Number(launch.id):null},status:blockers.length?'blocked':warnings.length?'warning':'healthy',score,blockers,warnings,checks,stages:stageState,definition:definition?{id:Number(definition.id),productKey:definition.product_key,name:definition.name,status:definition.status,version:Number(definition.definition_version),compiledVersion:definition.compiled_version,compiledHash:definition.compiled_hash}:null,launch:launch?{id:Number(launch.id),version:launch.version,status:launch.status,active:Boolean(launch.active),countryCode:launch.country_code}:null,evaluatedAt:new Date().toISOString()};
}
