import {RELEASE_VERSION} from '../../core/release.js';
import {auditAdminControl} from './admin-control.audit.js';
import {listProductCountries,createProductCountry,setProductCountryActive} from '../../security/product-country-catalog.service.js';
import {createCountryBlueprint,getCountryBlueprint,prepareCountryBlueprintForLaunch,upsertBlueprintSector,upsertBlueprintContent,upsertBlueprintLegal} from '../../security/country-product-blueprint.service.js';
import {createCountryLaunchDraft,getCountryProductLaunch,getCountryProductLaunchById,validateCountryProductLaunch,activateCountryProductLaunch} from '../../security/country-product-launch.service.js';
import {createProductDefinition,listProductDefinitions,getProductDefinition,updateProductDefinitionDraft,upsertProductComponent,compileProductDefinition} from '../../security/product-definition.service.js';
import {createOrUpdateLifecycleDefinition,listLifecycleDefinitions,getLifecycleDefinition,validateLifecycleDefinition,activateLifecycleForLaunchSector,lifecycleHealthForLaunch} from '../../security/sector-lifecycle.service.js';
import {ensureProductPreparationWorkspace,getProductPreparationWorkspace,getProductDependencyGraph,buildProductDependencyGraph} from '../../security/product-launch-workspace.service.js';
import {listPlatformConfigurations} from '../../security/platform-configuration.service.js';
import {getProductHealth} from '../../security/product-health.service.js';
import {evaluateProductLaunchReadiness} from '../../security/product-launch-readiness.service.js';
import {getProductControlPlaneGovernance,refreshControlPlaneGovernance} from '../../security/control-plane-governance.service.js';
import {runProductVerification} from './product-verification-engine.service.js';
import {runProductTestLab} from './product-test-lab.service.js';
import {getProductTestScenarioForLaunch} from './product-test-scenario.service.js';
import {getProductContract} from './product-contract.service.js';
import {getProductPublisherSemanticConfiguration} from './product-publisher-semantic-configuration.service.js';
import {getProductDependencyImpact} from './product-dependency-impact.service.js';
import {ensureProductReleaseRecord,getProductReleaseLifecycle,markProductReleasePublished,markProductReleaseVerified,markProductReleaseLive,beginProductReleaseOperation,setProductReleaseOperationStatus,failProductReleaseOperation} from './product-release-lifecycle.service.js';
import {getCountryProductFoundation,saveCountryProductFoundation} from './country-product-foundation.service.js';
import {ACTION_REGISTRY} from '../../application/actions/action-registry.js';

import { authorityUnavailable } from '../../core/canonical-db.js';
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const arr=v=>Array.isArray(v)?[...new Set(v.map(x=>clean(x,120).toLowerCase()).filter(Boolean))]:[];
const fail=(m,s=400,c)=>Object.assign(new Error(m),{status:s,code:c});
const SECTOR_NAMES=Object.freeze({logistics:'Logistics',cleaning:'Cleaning',security:'Security',general:'General Operations'});
const DEFAULT_CAPABILITIES=['organization','people','mission','object','resource','relationship','communication','evidence','policy','capability','logistics'];
const DEFAULT_CONFIGS=['capabilities:catalog','roles:action_policy','rendering:product_experience','guidance:user_journey','policy:default','mission_rules:intake'];

async function runPublisherProjection(label,fn,warnings){try{await fn();}catch(error){warnings.push({code:`PUBLISHER_${String(label).toUpperCase()}_UNAVAILABLE`,stage:'projection',message:error?.message||`${label} projection unavailable. Canonical mutation remains authoritative.`,retriable:true});}}

function sectorLifecycleTemplate(sectorCode){
 const sector=clean(sectorCode,120).toLowerCase();
 if(sector==='logistics')return {name:'Logistics Lifecycle',description:'Canonical logistics operational lifecycle for this country product.',initialStateCode:'PENDING',states:[['PENDING','Pending',false,false],['ARRIVED','Arrived',false,false],['PICKED_UP','Picked Up',false,true],['IN_TRANSIT','In Transit',false,true],['DELIVERED','Delivered',false,false],['COMPLETED','Completed',true,false],['CANCELLED','Cancelled',true,false]],transitions:[['PENDING','ARRIVED','ARRIVE','confirm_arrival',['admin','driver','executor']],['ARRIVED','PICKED_UP','PICKUP','confirm_pickup',['admin','driver','executor']],['PICKED_UP','IN_TRANSIT','TRANSIT_START','start_transit',['admin','driver','executor']],['IN_TRANSIT','DELIVERED','DELIVER','confirm_delivery',['admin','driver','executor']],['DELIVERED','COMPLETED','COMPLETE','complete_mission',['admin']],['PENDING','CANCELLED','CANCEL','cancel_mission',['admin']],['ARRIVED','CANCELLED','CANCEL_ARRIVED','cancel_mission',['admin']],['PICKED_UP','CANCELLED','CANCEL_PICKED_UP','cancel_mission',['admin']],['IN_TRANSIT','CANCELLED','CANCEL_IN_TRANSIT','cancel_mission',['admin']],['DELIVERED','CANCELLED','CANCEL_DELIVERED','cancel_mission',['admin']]],metadata:{domain:'logistics',supportsStops:true,supportsObjects:true,supportsCustody:true}};
 if(sector==='security')return {name:'Security Operations Lifecycle',description:'Sector lifecycle for security assignments; operational actions remain owned by the canonical action system.',initialStateCode:'PENDING',states:[['PENDING','Pending',false,false],['IN_PROGRESS','In Progress',false,false],['COMPLETED','Completed',true,false],['CANCELLED','Cancelled',true,false]],transitions:[['PENDING','IN_PROGRESS','START','start_operation',['driver','executor']],['IN_PROGRESS','COMPLETED','COMPLETE','complete_operation',['driver','executor']],['PENDING','CANCELLED','CANCEL','cancel_mission',['admin']],['IN_PROGRESS','CANCELLED','CANCEL_IN_PROGRESS','cancel_mission',['admin']]],metadata:{domain:'security',supportsStops:false,supportsObjects:false,supportsCustody:false}};
 if(sector==='cleaning')return {name:'Cleaning Operations Lifecycle',description:'Sector lifecycle for cleaning assignments; operational actions remain owned by the canonical action system.',initialStateCode:'PENDING',states:[['PENDING','Pending',false,false],['IN_PROGRESS','In Progress',false,false],['COMPLETED','Completed',true,false],['CANCELLED','Cancelled',true,false]],transitions:[['PENDING','IN_PROGRESS','START','start_operation',['driver','executor']],['IN_PROGRESS','COMPLETED','COMPLETE','complete_operation',['driver','executor']],['PENDING','CANCELLED','CANCEL','cancel_mission',['admin']],['IN_PROGRESS','CANCELLED','CANCEL_IN_PROGRESS','cancel_mission',['admin']]],metadata:{domain:'cleaning',supportsStops:false,supportsObjects:false,supportsCustody:false}};
 return {name:`${sector.replaceAll('_',' ')} Lifecycle`,description:`Sector lifecycle for ${sector}; operational actions remain owned by the canonical action system.`,initialStateCode:'PENDING',states:[['PENDING','Pending',false,false],['IN_PROGRESS','In Progress',false,false],['COMPLETED','Completed',true,false],['CANCELLED','Cancelled',true,false]],transitions:[['PENDING','IN_PROGRESS','START','start_operation',['driver','executor']],['IN_PROGRESS','COMPLETED','COMPLETE','complete_operation',['driver','executor']],['PENDING','CANCELLED','CANCEL','cancel_mission',['admin']],['IN_PROGRESS','CANCELLED','CANCEL_IN_PROGRESS','cancel_mission',['admin']]],metadata:{domain:sector,supportsStops:false,supportsObjects:false,supportsCustody:false}};
}
export function normalizePublisherManifest(input,countryName,productName,sectors){
 const m=input||{};const e=m.eligibility||{};
 return {capabilities:arr(m.capabilities).length?arr(m.capabilities):DEFAULT_CAPABILITIES,requiredConfigurations:arr(m.requiredConfigurations).length?arr(m.requiredConfigurations):DEFAULT_CONFIGS,eligibility:{organizationTypes:arr(e.organizationTypes).length?arr(e.organizationTypes):['company'],sectors:sectors.length?sectors:['general'],userClasses:arr(e.userClasses).length?arr(e.userClasses):['tenant_admin','driver','independent_executor'],companyIds:arr(e.companyIds),registrationNumbers:arr(e.registrationNumbers),emailDomains:arr(e.emailDomains),companyMode:e.companyMode==='allowlist'?'allowlist':'rules',userMode:e.userMode==='allowlist'?'allowlist':'rules',emailAllowlist:arr(e.emailAllowlist)},labels:{...(m.labels||{}),countryName,productName:clean(m.labels?.productName||productName,240)},launchMessage:clean(m.launchMessage,500)||`ON Mission is available for ${countryName}.`,guidance:m.guidance||{},countryContent:m.countryContent||null,...(m.layoutArtifactBinding!==undefined?{layoutArtifactBinding:m.layoutArtifactBinding}:{}),layoutArtifactBindingRequired:m.layoutArtifactBindingRequired===true};
}
async function ensureSectorPolicy(env,sectorCode,actor){
 const sector=clean(sectorCode,120).toLowerCase();
 const existing=await env.DB.prepare(`SELECT code,sector_code,status,regulatory_profile,data_profile,effective_version FROM sector_policies WHERE sector_code=? AND status='active' ORDER BY effective_version DESC,code LIMIT 1`).bind(sector).first();
 if(existing)return existing;
 const code=`${sector}-platform-${RELEASE_VERSION}`;
 await env.DB.prepare(`INSERT INTO sector_policies(code,sector_code,regulatory_profile,data_profile,effective_version,status) VALUES(?,?,?,?,?,'active')`).bind(code,sector,'general_operational','standard',RELEASE_VERSION).run();
 const created=await env.DB.prepare(`SELECT code,sector_code,status,regulatory_profile,data_profile,effective_version FROM sector_policies WHERE code=? LIMIT 1`).bind(code).first();
 await auditAdminControl(env,{actor,action:'admin.product-publisher.sector-profile-created',resourceType:'sector_policy',resourceId:code,requestId:crypto.randomUUID(),metadata:{sectorCode:sector,profile:'general_operational',note:'Platform baseline profile; local regulatory review remains a separate governance responsibility.'}}).catch(error=>{throw authorityUnavailable('product_publisher_audit',error);});
 return created;
}
async function ensureDefinition(env,actor,{launchId,countryCode,sectorCode,productName}){
 const sector=clean(sectorCode,120).toLowerCase();
 const rows=await listProductDefinitions(env,{countryCode,sectorCode:sector,limit:100});
 let definition=rows.find(x=>Number(x.launch_id)===Number(launchId));
 if(!definition){definition=await createProductDefinition(env,actor,{productKey:`${countryCode.toLowerCase()}.${sector}.product`,name:`${productName} · ${SECTOR_NAMES[sector]||sector.replaceAll('_',' ')}`,description:`Governed ${sector} product definition for ${countryCode}.`,countryCode,sectorCode:sector,launchId});}
 const full=definition.components?definition:await getProductDefinition(env,definition.id);
 const components=new Map((full.components||[]).map(c=>[`${c.component_type}:${c.component_key}`,c]));
 const defaults=[
   {componentType:'identity',componentKey:'identity',payload:{productKey:full.product_key,name:full.name,description:full.description}},
   {componentType:'experience',componentKey:'workspace',payload:{key:'workspace',type:'operational_workspace',sections:['situation','next_action','evidence','history'],presentation:{mode:'one_action_first',sector}}},
   {componentType:'capability',componentKey:'sector',payload:{key:'sector',enabled:true,configuration:{sectorCode:sector}}},
 ];
 for(const c of defaults)if(!components.has(`${c.componentType}:${c.componentKey}`))await upsertProductComponent(env,actor,full.id,c);
 return getProductDefinition(env,full.id);
}
async function ensureLifecycle(env,actor,{launchId,countryCode,sectorCode,productDefinitionId}){
 const sector=clean(sectorCode,120).toLowerCase();
 let defs=await listLifecycleDefinitions(env,{countryCode,sectorCode:sector});
 let d=defs.find(x=>Number(x.launchId||0)===Number(launchId)&&['active','validated','draft'].includes(String(x.status)));
 if(!d){const t=sectorLifecycleTemplate(sector);d=await createOrUpdateLifecycleDefinition(env,actor,{lifecycleKey:`${countryCode.toLowerCase()}.${sector}.product`,countryCode,sectorCode:sector,productDefinitionId,launchId,...t,states:t.states.map((x,i)=>({stateCode:x[0],label:x[1],terminal:Boolean(x[2]),custodyActive:Boolean(x[3]),sequenceNo:(i+1)*10})),transitions:t.transitions.map((x,i)=>({fromStateCode:x[0],toStateCode:x[1],transitionCode:x[2],actionCode:x[3],requiredRoles:x[4],sequenceNo:(i+1)*10}))});}
 if(d.status==='draft'){d=await validateLifecycleDefinition(env,d.id);}
 const health=await lifecycleHealthForLaunch(env,launchId,[sector]);
 if(!health.sectors?.[0]?.valid)await activateLifecycleForLaunchSector(env,actor,{launchId,sectorCode:sector,lifecycleDefinitionId:d.id,productDefinitionId});
 return {definition:d,health:await lifecycleHealthForLaunch(env,launchId,[sector])};
}
async function ensureStandardLegalFoundation(env,actor,blueprintId){
 const items=[
  {requirementKey:'legal-notice',title:'Legal notice / company disclosure',description:'Provide the legally required operator/company disclosure for the selected country.',status:'missing'},
  {requirementKey:'privacy',title:'Privacy notice',description:'Provide the privacy notice and jurisdiction-specific data-protection disclosures.',status:'missing'},
  {requirementKey:'terms',title:'Terms of service',description:'Provide the terms governing tenant use of the product.',status:'missing'}
 ];
 for(const item of items){
  const existing=(await getCountryBlueprint(env,blueprintId))?.legalRequirements?.find(x=>x.requirement_key===item.requirementKey);
  if(!existing)await upsertBlueprintLegal(env,actor,blueprintId,{...item,required:true});
 }
 return getCountryBlueprint(env,blueprintId);
}

export async function savePublisherScope(env,actor,launchId,input={},requestId=''){
 const launch=await getCountryProductLaunchById(env,Number(launchId));
 if(!launch)throw fail('Country product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 if(launch.status!=='draft'||launch.active)throw fail('Only an inactive draft product can be edited.',409,'PRODUCT_NOT_EDITABLE');
 const countryCode=String(launch.country_code||'').toUpperCase();
 const sectors=arr(input.sectors||launch.eligibility?.sectors||['general']);
 if(!sectors.length)throw fail('At least one sector is required.',422,'PRODUCT_SECTOR_REQUIRED');
 const productName=clean(input.productName||launch.manifest?.labels?.productName||'',240);if(!productName)throw fail('Product name is required.',422,'PRODUCT_NAME_REQUIRED');
 const blueprint=launch.country_blueprint_id?await getCountryBlueprint(env,Number(launch.country_blueprint_id)):null;
 if(!blueprint)throw fail('Product country foundation is missing.',409,'BLUEPRINT_REQUIRED');
 const languageCode=clean(input.primaryLanguageCode||blueprint.default_language_code||'en',20).toLowerCase();
 const manifest=normalizePublisherManifest({...launch.manifest,labels:{...(launch.manifest?.labels||{}),productName},eligibility:{...(launch.manifest?.eligibility||{}),sectors},launchMessage:clean(input.launchMessage||launch.manifest?.launchMessage,500)},launch.country_name,productName,sectors);
 await updateCountryProductLaunchDraft(env,actor,Number(launchId),{countryCode,blueprintId:blueprint.id,manifest,reason:'Product scope saved from canonical Product Publisher'},requestId||crypto.randomUUID());
 await upsertBlueprintContent(env,actor,blueprint.id,{contentKey:'product-name',category:'experience',title:'Product name',body:productName,languageCode,required:true});
 if(input.welcomeMessage!==undefined)await upsertBlueprintContent(env,actor,blueprint.id,{contentKey:'welcome',category:'experience',title:'Welcome text',body:clean(input.welcomeMessage,12000),languageCode,required:true});
 const selected=new Set(sectors);
 for(const item of (blueprint.sectors||[]))if(!selected.has(String(item.sector_code)))await upsertBlueprintSector(env,actor,blueprint.id,{sectorCode:item.sector_code,sectorName:item.sector_name,notes:item.notes||'',required:false});
 const definitions=[];
 for(const sector of sectors){await ensureSectorPolicy(env,sector,actor);await upsertBlueprintSector(env,actor,blueprint.id,{sectorCode:sector,sectorName:SECTOR_NAMES[sector]||sector.replaceAll('_',' '),required:true});const d=await ensureDefinition(env,actor,{launchId,countryCode,sectorCode:sector,productName});definitions.push(d);await ensureLifecycle(env,actor,{launchId,countryCode,sectorCode:sector,productDefinitionId:d.id});}
 await ensureProductPreparationWorkspace(env,Number(launchId));
 await prepareCountryBlueprintForLaunch(env,actor,blueprint.id);
 await auditAdminControl(env,{actor,action:'admin.product-publisher.scope-saved',resourceType:'country_product_launch',resourceId:launchId,requestId,metadata:{countryCode,sectors,productName}}).catch(error=>{throw authorityUnavailable('product_publisher_audit',error);});
 return getPublisherWorkspace(env,{launchId:Number(launchId)});
}

export async function validatePublisherWorkspace(env,actor,launchId,requestId=''){
 const launch=await validateCountryProductLaunch(env,actor,Number(launchId),requestId||crypto.randomUUID());
 if(launch?.status==='validated')await env.DB.prepare(`UPDATE platform_product_release_lifecycles SET state='validated',updated_at=CURRENT_TIMESTAMP WHERE launch_id=? AND state='draft'`).bind(Number(launchId)).run();
 return launch;
}

export async function publishPublisherWorkspace(env,actor,launchId,requestId='',guard={}){
 const launch=await getCountryProductLaunchById(env,Number(launchId));
 if(!launch)throw fail('Country product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 if(launch.status!=='validated')throw fail('Product must pass validation before it can be published.',409,'PRODUCT_NOT_VALIDATED');
 const release=await getProductReleaseLifecycle(env,{launchId:Number(launchId)});
 if(release.state!=='authorized')throw fail('Product release must be authorized before it can be published.',409,'PRODUCT_RELEASE_NOT_AUTHORIZED');
 const operation=await beginProductReleaseOperation(env,actor,{launchId:Number(launchId),operationType:'publish',requestId,keySuffix:requestId||crypto.randomUUID()});
 if(operation.reused&&operation.status==='committed')return getCountryProductLaunchById(env,Number(launchId));
 try{
  await setProductReleaseOperationStatus(env,operation,'preparing',{releaseState:release.state,contractHash:release.contractHash});
  await setProductReleaseOperationStatus(env,operation,'publishing',{expectedActiveLaunchId:guard.expectedActiveLaunchId??null,expectedActiveVersion:guard.expectedActiveVersion??null});
  const published=await activateCountryProductLaunch(env,actor,Number(launchId),requestId||crypto.randomUUID(),guard);
  await markProductReleasePublished(env,actor,Number(launchId),requestId||crypto.randomUUID());
  await setProductReleaseOperationStatus(env,operation,'committed',{launchId:Number(launchId),published:true});
  return published;
 }catch(error){
  const active=await env.DB.prepare(`SELECT status,active FROM country_product_launches WHERE id=? LIMIT 1`).bind(Number(launchId)).first();
  if(active?.status==='active'&&Number(active.active)===1){await setProductReleaseOperationStatus(env,operation,'reconciliation_required',{launchId:Number(launchId),reason:'Launch activation committed but lifecycle acknowledgement failed',errorCode:error?.code||null});}
  else await failProductReleaseOperation(env,operation,error);
  throw error;
 }
}

export async function verifyPublisherWorkspace(env,actor,launchId,requestId='',input={}){
 const launch=await getCountryProductLaunchById(env,Number(launchId));
 if(!launch)throw fail('Country product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 if(launch.status!=='active'||!launch.active)throw fail('Product must be active before verification.',409,'PRODUCT_NOT_ACTIVE');
 const sectors=arr(launch.eligibility?.sectors||launch.manifest?.eligibility?.sectors);
 if(!sectors.length)throw fail('Active product has no declared sectors.',409,'PRODUCT_SECTOR_REQUIRED');
 const operation=await beginProductReleaseOperation(env,actor,{launchId:Number(launchId),operationType:'verify',requestId,keySuffix:requestId||crypto.randomUUID()});
 if(operation.reused&&operation.status==='committed')return getPublisherWorkspace(env,{launchId:launch.id}).then(workspace=>({...workspace,verification:operation.metadata?.results||[]}));
 const results=[];
 try{
  await setProductReleaseOperationStatus(env,operation,'preparing',{releaseState:(await getProductReleaseLifecycle(env,{launchId:Number(launchId)})).state});
  await setProductReleaseOperationStatus(env,operation,'verifying',{sectors});
  for(const sector of sectors){
  const candidateScenarioId=Number(input.scenarioId||0)||null;
  const candidateScenario=candidateScenarioId?await env.DB.prepare(`SELECT sector_code,status FROM platform_product_test_scenarios WHERE id=? AND launch_id=? LIMIT 1`).bind(candidateScenarioId,Number(launchId)).first():null;
  const preparedScenarioId=candidateScenario&&String(candidateScenario.sector_code)===String(sector)&&String(candidateScenario.status)==='prepared'?candidateScenarioId:null;
  results.push(await runProductVerification(env,{actor,countryCode:launch.country_code,sectorCode,mode:'controlled',scenarioId:preparedScenarioId,expectedActiveLaunchId:launch.id,expectedActiveVersion:launch.version,idempotencyKey:`publisher-verify:${requestId||crypto.randomUUID()}:${sector}`}));
  }
  await markProductReleaseVerified(env,actor,Number(launchId),results,requestId||crypto.randomUUID());
  await markProductReleaseLive(env,actor,Number(launchId),requestId||crypto.randomUUID());
  await setProductReleaseOperationStatus(env,operation,'committed',{results:results.map(x=>({id:x?.id||null,status:x?.status||null}))});
  return getPublisherWorkspace(env,{launchId:launch.id}).then(workspace=>({...workspace,verification:results}));
 }catch(error){
  const releaseState=(await getProductReleaseLifecycle(env,{launchId:Number(launchId)})).state;
  if(releaseState==='verified'||releaseState==='live')await setProductReleaseOperationStatus(env,operation,'committed',{reconciled:true,releaseState});
  else await failProductReleaseOperation(env,operation,error);
  throw error;
 }
}

export async function startProductPublisher(env,actor,input={},requestId=''){
 const countryCode=clean(input.countryCode,2).toUpperCase();
 const country=await env.DB.prepare(`SELECT code,name,active FROM platform_product_country_catalog WHERE code=? LIMIT 1`).bind(countryCode).first();
 if(!country)throw fail('Country does not exist',404,'COUNTRY_NOT_FOUND');
 if(Number(country.active)!==1)throw fail('Country must be activated before a product can be built.',422,'COUNTRY_INACTIVE');
 const sectors=arr(input.sectors||input.sectorCodes||['general']);
 const productName=clean(input.productName||`${country.name} Product`,240);if(!productName)throw fail('Product name is required',422,'PRODUCT_NAME_REQUIRED');
 let blueprint= input.blueprintId?await getCountryBlueprint(env,Number(input.blueprintId)):null;
 if(blueprint&&String(blueprint.country_code)!==countryCode)throw fail('Country blueprint does not belong to the selected country',409,'BLUEPRINT_COUNTRY_MISMATCH');
 if(!blueprint)blueprint=await createCountryBlueprint(env,actor,{countryCode,name:`${country.name} Product Foundation`,defaultLanguageCode:clean(input.primaryLanguageCode||'en',20),notes:'Managed from the single Product Publisher workspace.'});
 await ensureStandardLegalFoundation(env,actor,blueprint.id);
 for(const sector of sectors){await ensureSectorPolicy(env,sector,actor);await upsertBlueprintSector(env,actor,blueprint.id,{sectorCode:sector,sectorName:SECTOR_NAMES[sector]||sector.replaceAll('_',' '),required:true});}
 await upsertBlueprintContent(env,actor,blueprint.id,{contentKey:'product-name',category:'experience',title:'Product name',body:productName,languageCode:clean(input.primaryLanguageCode||blueprint.default_language_code||'en',20),required:true});
 if(clean(input.welcomeMessage,12000))await upsertBlueprintContent(env,actor,blueprint.id,{contentKey:'welcome',category:'experience',title:'Welcome text',body:clean(input.welcomeMessage,12000),languageCode:clean(input.primaryLanguageCode||blueprint.default_language_code||'en',20),required:true});
 const launchManifest=normalizePublisherManifest(input.manifest||{capabilities:input.capabilities,requiredConfigurations:input.requiredConfigurations,eligibility:{sectors}},country.name,productName,sectors);
 let launch=await createCountryLaunchDraft(env,actor,{countryCode,blueprintId:blueprint.id,manifest:launchManifest,reason:input.reason||'Started from the single Product Publisher workspace.'},requestId||crypto.randomUUID());
 if(!launch)throw fail('Product launch draft could not be created or resolved for this request.',503,'PRODUCT_LAUNCH_DRAFT_UNAVAILABLE');
 await ensureProductReleaseRecord(env,Number(launch.id));
 await ensureProductPreparationWorkspace(env,Number(launch.id));
 const definitions=[];
 const lifecycles=[];
 for(const sector of sectors){const d=await ensureDefinition(env,actor,{launchId:launch.id,countryCode,sectorCode:sector,productName});definitions.push(d);lifecycles.push(await ensureLifecycle(env,actor,{launchId:launch.id,countryCode,sectorCode:sector,productDefinitionId:d.id}));}
 const projectionWarnings=[];
 await runPublisherProjection('audit',()=>auditAdminControl(env,{actor,action:'admin.product-publisher.workspace-started',resourceType:'country_product_launch',resourceId:launch.id,requestId,metadata:{countryCode,sectors,productName}}),projectionWarnings);
 await runPublisherProjection('dependency_graph',()=>buildProductDependencyGraph(env,Number(launch.id)),projectionWarnings);
 await runPublisherProjection('governance',()=>refreshControlPlaneGovernance(env,Number(launch.id)),projectionWarnings);
 const workspace=await getPublisherWorkspace(env,{launchId:launch.id});
 return {...workspace,projectionWarnings};
}
export async function getPublisherWorkspace(env,{launchId=null,countryCode='' }={}){
 const diagnostics={panels:{}};
 let countries=[];
 try{countries=await listProductCountries(env,{query:'',limit:250,includeInactive:true});}catch(error){diagnostics.panels.countries={code:'PUBLISHER_COUNTRY_READ_FAILED',status:Number(error?.status||500),message:'Country catalog could not be read. No product state was changed.'};}
 let launch=null;
 try{
  launch=launchId?await getCountryProductLaunchById(env,Number(launchId)):null;
  if(!launch&&countryCode)launch=await getCountryProductLaunch(env,countryCode);
 }catch(error){
  diagnostics.panels.launch={code:'PUBLISHER_LAUNCH_READ_FAILED',status:Number(error?.status||500),message:'Product launch state could not be read. No product state was changed.'};
 }
 if(!launch)return {version:RELEASE_VERSION,countries,launch:null,blueprint:null,foundation:null,preparation:null,definitions:[],lifecycles:null,lifecycleDefinitions:[],sectors:[],configurations:[],configurationState:'not_required',dependencyGraph:null,controlPlaneGovernance:null,health:null,diagnostics,readiness:{valid:false,score:0,blockers:[{code:'workspace_not_started',message:'Choose a country, activate it if necessary, and start the product workspace.'}]},next:{key:'scope',label:'Start product workspace',message:'Select a country and define the product scope.'}};
 const manifest=launch.manifest||{};const sectors=arr(launch.eligibility?.sectors||manifest?.eligibility?.sectors||['general']);
 const specs=[
  ['blueprint',launch.country_blueprint_id?()=>getCountryBlueprint(env,Number(launch.country_blueprint_id)):()=>null,null],
  ['preparation',()=>getProductPreparationWorkspace(env,launch.id),{launchId:Number(launch.id),tasks:[],research:[],summary:{total:0,completed:0,remaining:0,blocked:1,missingEvidence:0,researchTotal:0,researchCompleted:0,progress:0,ready:false}}],
  ['definitions',()=>listProductDefinitions(env,{countryCode:launch.country_code,limit:250}),[]],
  ['configurations',()=>listPlatformConfigurations(env),[]],
  ['dependencyGraph',()=>getProductDependencyGraph(env,launch.id),null],
  ['health',()=>getProductHealth(env,{launchId:launch.id}),null],
  ['lifecycleHealth',()=>lifecycleHealthForLaunch(env,launch.id,sectors),{valid:false,sectors:[]}],
  ['foundation',()=>getCountryProductFoundation(env,launch.country_code),{ready:false,blockers:[{code:'foundation_read_failed',message:'Country foundation could not be read.'}]}]
 ];
 const results=await Promise.all(specs.map(async([key,fn,fallback])=>{try{return [key,await fn(),null];}catch(error){return [key,fallback,{code:'PUBLISHER_PANEL_READ_FAILED',panel:key,status:Number(error?.status||500),message:'This publisher panel could not be read. Refresh after correcting the underlying service or schema issue.'}];}}));
 const values=Object.fromEntries(results.map(([key,value])=>[key,value]));
 for(const [key,,error] of results)if(error)diagnostics.panels[key]=error;
 const blueprint=values.blueprint;const preparation=values.preparation;const allDefinitions=Array.isArray(values.definitions)?values.definitions:[];const configs=Array.isArray(values.configurations)?values.configurations:[];const graph=values.dependencyGraph;const health=values.health;const lifecycleHealth=values.lifecycleHealth||{valid:false,sectors:[]};const foundation=values.foundation;
 const definitions=allDefinitions.filter(d=>Number(d.launch_id)===Number(launch.id));
 const lifecycleDefinitions=[];
 for(const s of sectors){const healthRow=(lifecycleHealth.sectors||[]).find(x=>String(x.sectorCode||x.sector_code)===String(s));const id=healthRow?.lifecycleDefinitionId||healthRow?.lifecycle_definition_id;if(id)try{lifecycleDefinitions.push(await getLifecycleDefinition(env,id));}catch(error){diagnostics.panels[`lifecycle:${s}`]={code:'PUBLISHER_LIFECYCLE_READ_FAILED',status:Number(error?.status||500),message:'This sector lifecycle could not be read.'};}}
 let readiness;
 try{readiness=await evaluateProductLaunchReadiness(env,{countryCode:launch.country_code,sectorCode:sectors[0]||'general',manifest:manifest,launchId:launch.id});}
 catch(error){diagnostics.panels.readiness={code:'PUBLISHER_READINESS_READ_FAILED',status:Number(error?.status||500),message:'Release readiness could not be evaluated. Publishing remains blocked until the readiness authority is available.'};readiness={valid:false,score:0,blockers:[{code:'readiness_unavailable',message:'Release readiness could not be evaluated. Publishing is blocked until the readiness authority is available.'}]};}
 let controlPlaneGovernance=null;try{controlPlaneGovernance=await getProductControlPlaneGovernance(env,launch.id);}catch(error){diagnostics.panels.controlPlaneGovernance={code:'CONTROL_PLANE_GOVERNANCE_READ_FAILED',status:Number(error?.status||500),message:'Control Plane governance could not be read. Readiness remains fail-closed.'};}
 let testLab=null;try{testLab=await runProductTestLab(env,{launchId:launch.id});}catch(error){diagnostics.panels.testLab={code:'PUBLISHER_TEST_LAB_READ_FAILED',status:Number(error?.status||500),message:'Pre-publication Test Lab could not be evaluated. Publishing remains blocked.'};}
 let testScenario=null;try{testScenario=await getProductTestScenarioForLaunch(env,{launchId:launch.id});}catch(error){diagnostics.panels.testScenario={code:'PRODUCT_TEST_SCENARIO_READ_FAILED',status:Number(error?.status||500),message:'Controlled Test Lab scenario could not be read.'};}
 let productContract=null;try{productContract=await getProductContract(env,{launchId:launch.id});}catch(error){diagnostics.panels.productContract={code:'PRODUCT_CONTRACT_READ_FAILED',status:Number(error?.status||500),message:'The immutable product contract could not be compiled. Publishing remains blocked.'};}
 const required=arr(launch.manifest?.requiredConfigurations);
 const semanticConfiguration=getProductPublisherSemanticConfiguration(configs,required);
 let dependencyImpact=null;
 try{const productNode=arr(graph?.nodes).find(n=>n.type==='product');if(productNode)dependencyImpact=await getProductDependencyImpact(env,{launchId:launch.id,nodeId:productNode.id});}
 catch(error){diagnostics.panels.dependencyImpact={code:'PUBLISHER_DEPENDENCY_IMPACT_READ_FAILED',status:Number(error?.status||500),message:'Dependency impact could not be projected. The canonical dependency graph remains the source of truth.'};}
 let releaseLifecycle=null;try{releaseLifecycle=await getProductReleaseLifecycle(env,{launchId:launch.id});}catch(error){diagnostics.panels.releaseLifecycle={code:'PRODUCT_RELEASE_LIFECYCLE_READ_FAILED',status:Number(error?.status||500),message:'Release lifecycle could not be read. Publication remains blocked.'};}
 let releaseHistory=[];try{const rows=(await env.DB.prepare(`SELECT r.*,l.country_code,l.version,l.status launch_status,l.active,l.effective_at FROM platform_product_release_lifecycles r JOIN country_product_launches l ON l.id=r.launch_id WHERE l.country_code=? ORDER BY CAST(l.version AS INTEGER) DESC,l.id DESC`).bind(launch.country_code).all()).results||[];releaseHistory=rows.map(r=>({...r,id:Number(r.id),launchId:Number(r.launch_id),previousLaunchId:r.previous_launch_id==null?null:Number(r.previous_launch_id)}));}catch(error){diagnostics.panels.releaseHistory={code:'PRODUCT_RELEASE_HISTORY_READ_FAILED',status:Number(error?.status||500),message:'Release history could not be read.'};}
 const next=nextStep({launch,blueprint,foundation,preparation,definitions,lifecycleHealth,configurations:configs,readiness,releaseLifecycle});
 return {version:RELEASE_VERSION,countries,launch,blueprint,foundation,preparation,definitions,lifecycles:lifecycleHealth,lifecycleDefinitions,sectors,configurations:configs,configurationState:diagnostics.panels.configurations?'error':'ready',semanticConfiguration,dependencyGraph:graph,dependencyImpact,controlPlaneGovernance,testLab,testScenario,productContract,releaseLifecycle,releaseHistory,health,diagnostics,readiness,next};
}

function nextStep({launch,blueprint,foundation,preparation,definitions,lifecycleHealth,configurations,readiness,releaseLifecycle}){
 if(!launch)return {key:'scope',label:'Start product workspace',message:'Select a country and define the product scope.'};
 if(Number(launch.product_country_catalog_active)!==1)return {key:'country',label:'Create country foundation',message:'Create this country in the Product Country Catalog before building the product.'};
 if(!foundation?.ready)return {key:'foundation',label:'Complete country foundation',message:foundation?.blockers?.[0]?.message||'Configure jurisdiction, residency, retention, billing, communication and real storage governance.'};
 if(!blueprint)return {key:'foundation',label:'Create country foundation',message:'Create the country blueprint.'};
 const missingSectors=(blueprint.sectors||[]).filter(s=>s.required&&s.status!=='ready');if(missingSectors.length)return {key:'sectors',label:'Prepare sectors',message:`Prepare ${missingSectors.length} sector foundation(s).`};
 if((preparation?.summary?.ready)!==true)return {key:'evidence',label:'Complete preparation',message:`${preparation?.summary?.remaining||0} required preparation item(s) remain.`};
 if(sectorsMissingDefinitions(launch,definitions).length)return {key:'definitions',label:'Complete product definitions',message:'Every declared sector needs a product definition.'};
 if((lifecycleHealth?.valid)!==true)return {key:'lifecycle',label:'Bind lifecycle',message:'Every declared sector needs a validated active lifecycle.'};
 const required=arr(launch.manifest?.requiredConfigurations);const active=new Set((configurations||[]).filter(x=>x.active).map(x=>`${x.domain_code}:${x.config_key}`));const missing=required.filter(x=>!active.has(x));if(missing.length)return {key:'configuration',label:'Activate configuration',message:`${missing.length} required runtime configuration(s) are not active.`};
 if(launch.status==='draft')return {key:'validate',label:'Validate product',message:readiness?.valid===true?'All release gates are ready. Run final validation.':'Resolve the remaining release blockers, then validate.'};
 if(launch.status==='validated'&&releaseLifecycle?.state!=='authorized')return {key:'authorize',label:'Authorize release',message:'Review the immutable contract, dependency snapshot and rollback path, then authorize this version.'};
 if(launch.status==='validated'&&releaseLifecycle?.state==='authorized')return {key:'publish',label:'Publish product',message:'Publish the authorized immutable country product version.'};
 if(launch.status==='active'&&releaseLifecycle?.state!=='live')return {key:'verify',label:'Verify product',message:'Run controlled verification for each active sector.'};
 return {key:'history',label:'View product',message:`Product is ${launch.status}.`};
}
function sectorsMissingDefinitions(launch,definitions){const set=new Set((definitions||[]).filter(d=>Number(d.launch_id)===Number(launch.id)).map(d=>String(d.sector_code)));return arr(launch.eligibility?.sectors).filter(s=>!set.has(s));}

export async function savePublisherFoundation(env,actor,launchId,input={},requestId=''){
 const launch=await getCountryProductLaunchById(env,Number(launchId));
 if(!launch)throw fail('Country product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 if(launch.status==='active')throw fail('Active product foundation is locked. Create a new governed release to change it.',409,'PRODUCT_FOUNDATION_LOCKED');
 const foundation=await saveCountryProductFoundation(env,actor,{...input,countryCode:launch.country_code},requestId);
 const projectionWarnings=[];
 await runPublisherProjection('audit',()=>auditAdminControl(env,{actor,action:'admin.product-publisher.foundation-saved',resourceType:'country_product_launch',resourceId:launchId,requestId,metadata:{countryCode:launch.country_code}}),projectionWarnings);
 await runPublisherProjection('dependency_graph',()=>buildProductDependencyGraph(env,Number(launchId)),projectionWarnings);
 await runPublisherProjection('governance',()=>refreshControlPlaneGovernance(env,Number(launchId)),projectionWarnings);
 const workspace=await getPublisherWorkspace(env,{launchId:Number(launchId)});
 return {...workspace,projectionWarnings};
}

export async function savePublisherDefinition(env,actor,definitionId,input={},requestId=''){
 const full=await getProductDefinition(env,Number(definitionId));
 if(!full)throw fail('Product definition not found',404,'PRODUCT_DEFINITION_NOT_FOUND');
 if(input.launchId!=null&&Number(full.launch_id)!==Number(input.launchId))throw fail('Product definition does not belong to this product launch.',409,'PRODUCT_DEFINITION_LAUNCH_MISMATCH');
 if(input.name!==undefined||input.description!==undefined||input.sectorCode!==undefined)await updateProductDefinitionDraft(env,actor,Number(definitionId),input);
 if(input.components!==undefined){
   if(!Array.isArray(input.components)||input.components.length>50)throw fail('A product definition can contain at most 50 components per save.',400,'PRODUCT_COMPONENT_LIMIT');
   for(const item of input.components)await upsertProductComponent(env,actor,Number(definitionId),item);
 }
 const projectionWarnings=[];
 await runPublisherProjection('audit',()=>auditAdminControl(env,{actor,action:'admin.product-publisher.definition-saved',resourceType:'product_definition',resourceId:definitionId,requestId,metadata:{launchId:full.launch_id,countryCode:full.country_code,sectorCode:full.sector_code}}),projectionWarnings);
 if(full.launch_id)await runPublisherProjection('dependency_graph',()=>buildProductDependencyGraph(env,Number(full.launch_id)),projectionWarnings);
 await runPublisherProjection('governance',()=>refreshControlPlaneGovernance(env,Number(full.launch_id)),projectionWarnings);
 return {...await getProductDefinition(env,Number(definitionId)),projectionWarnings};
}

export async function savePublisherLifecycle(env,actor,launchId,sectorCode,input={},requestId=''){
 const launch=await getCountryProductLaunchById(env,Number(launchId));
 if(!launch)throw fail('Country product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 if(launch.status==='active')throw fail('Active product lifecycle is locked. Create a new governed release to change it.',409,'PRODUCT_LIFECYCLE_LOCKED');
 const sector=clean(sectorCode,120).toLowerCase();
 const transitions=Array.isArray(input.transitions)?input.transitions:[];
 for(const t of transitions){const actionCode=clean(t.actionCode||t.action_code,120);if(actionCode&&!ACTION_REGISTRY[actionCode])throw fail(`Lifecycle transition references unknown canonical action: ${actionCode}`,422,'LIFECYCLE_ACTION_UNKNOWN');}
 const lifecycle=await createOrUpdateLifecycleDefinition(env,actor,{...input,countryCode:launch.country_code,sectorCode:sector,launchId:Number(launchId),productDefinitionId:input.productDefinitionId?Number(input.productDefinitionId):null,lifecycleDefinitionId:input.lifecycleDefinitionId?Number(input.lifecycleDefinitionId):null});
 const validated=await validateLifecycleDefinition(env,lifecycle.id);
 if(!validated?.id)throw fail('Lifecycle validation did not return a canonical definition.',503,'LIFECYCLE_VALIDATION_UNAVAILABLE');
 const bound=await activateLifecycleForLaunchSector(env,actor,{launchId:Number(launchId),sectorCode:sector,lifecycleDefinitionId:validated.id,productDefinitionId:input.productDefinitionId?Number(input.productDefinitionId):null});
 const projectionWarnings=[];
 await runPublisherProjection('audit',()=>auditAdminControl(env,{actor,action:'admin.product-publisher.lifecycle-saved',resourceType:'lifecycle_definition',resourceId:lifecycle.id,requestId,metadata:{launchId,sectorCode:sector,boundLifecycleDefinitionId:validated.id}}),projectionWarnings);
 await runPublisherProjection('dependency_graph',()=>buildProductDependencyGraph(env,Number(launchId)),projectionWarnings);
 return {...validated,binding:bound,projectionWarnings};
}

