import {canonicalAll,canonicalFirst} from '../core/canonical-db.js';
import {actionDefinition} from '../application/actions/action-registry.js';
import {serviceDefinition} from '../application/actions/action-service-map.js';
import {requireCapabilityOperation,requireResourceContract,CAPABILITY_RESOURCE_CONTRACT_VERSION} from './capability-resource-contract.service.js';

export const SECTOR_MISSION_CONTRACT_VERSION='13.3.0';
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const parse=(v,f={})=>{try{const x=JSON.parse(String(v??''));return x??f}catch{return f}};
const arr=v=>Array.isArray(v)?v:[];
const fail=(code,status=409,extra={})=>Object.assign(new Error(code),{code,status,...extra});

/**
 * Sector Mission Contract Gateway.
 *
 * Reference scenarios are contracts/projections only. Mission truth,
 * lifecycle truth, assignment, authorization, execution, provider truth,
 * verification and recovery remain owned by their canonical authorities.
 */
export async function resolveSectorMissionContract(env,{countryCode='ZZ',sectorCode='general',scenarioCode=null}={}){
  const country=clean(countryCode,2).toUpperCase()||'ZZ';
  const sector=clean(sectorCode,120).toLowerCase()||'general';
  const where=["status='active'","(country_code=? OR country_code IS NULL)","(lower(sector_code)=lower(?) OR sector_code='general')"];
  const args=[country,sector];
  if(scenarioCode){where.push('scenario_code=?');args.push(clean(scenarioCode,180));}
  const rows=await canonicalAll(env,`SELECT * FROM platform_mission_reference_scenarios WHERE ${where.join(' AND ')} ORDER BY CASE WHEN country_code=? THEN 0 ELSE 1 END,CASE WHEN lower(sector_code)=lower(?) THEN 0 ELSE 1 END,version DESC,id DESC LIMIT 20`,[...args,country,sector],'sector_mission_contract_authority');
  const row=(rows||[])[0];
  if(!row)throw fail('SECTOR_MISSION_CONTRACT_UNAVAILABLE',503,{countryCode:country,sectorCode:sector});
  return normalize(row);
}

export async function assessSectorMissionContract(env,{countryCode='ZZ',sectorCode='general',scenarioCode=null,requireExecutionBoundary=true}={}){
  const contract=await resolveSectorMissionContract(env,{countryCode,sectorCode,scenarioCode});
  const failures=[];
  if(contract.sectorCode!=='general'&&contract.sectorCode!==String(sectorCode||'general').toLowerCase())failures.push('SECTOR_CONTRACT_SCOPE_MISMATCH');
  const lifecycle=await canonicalFirst(env,`SELECT id,sector_code,status,version FROM platform_lifecycle_definitions WHERE id=? LIMIT 1`,[contract.lifecycleDefinitionId],'sector_lifecycle_authority');
  if(!lifecycle||!['validated','active'].includes(String(lifecycle.status)))failures.push('SECTOR_LIFECYCLE_UNAVAILABLE');
  if(lifecycle&&contract.sectorCode!=='general'&&String(lifecycle.sector_code).toLowerCase()!==contract.sectorCode)failures.push('SECTOR_LIFECYCLE_SCOPE_MISMATCH');

  const actionCodes=[...new Set(contract.steps.map(s=>String(s.actionCode||'').trim()).filter(Boolean))];
  for(const code of actionCodes){
    if(!actionDefinition(code))failures.push(`ACTION_NOT_REGISTERED:${code}`);
    if(!serviceDefinition(code))failures.push(`ACTION_ROUTE_NOT_CONTRACTED:${code}`);
  }

  const capabilityContracts=[];
  for(const req of contract.requiredCapabilities){
    const row=await canonicalFirst(env,`SELECT capability_code,version,commands_json,status,risk_class,tenant_scope FROM canonical_capability_contracts WHERE capability_code=? AND status='active' LIMIT 1`,[req.capabilityCode],'canonical_capability_contracts');
    if(!row){failures.push(`CAPABILITY_CONTRACT_UNAVAILABLE:${req.capabilityCode}`);continue;}
    const commands=parse(row.commands_json,[]);
    if(req.command&&!commands.includes(req.command))failures.push(`CAPABILITY_COMMAND_NOT_CONTRACTED:${req.capabilityCode}:${req.command}`);
    capabilityContracts.push({capabilityCode:req.capabilityCode,command:req.command||null,version:String(row.version||''),riskClass:String(row.risk_class||''),tenantScope:String(row.tenant_scope||'')});
  }

  const resourceContracts=[];
  for(const req of contract.requiredResources){
    try{
      const resource=await requireResourceContract(env,{resourceType:req.resourceType,resourceKey:req.resourceKey,consumerCapability:req.consumerCapability||null,tenantScope:req.tenantScope||null});
      resourceContracts.push({resourceType:resource.resourceType,resourceKey:resource.resourceKey,ownerCapability:resource.ownerCapability,version:resource.version});
    }catch(error){failures.push(`${error.code||'RESOURCE_CONTRACT_UNAVAILABLE'}:${req.resourceType}:${req.resourceKey}`);}
  }

  if(contract.externalEffect&&requireExecutionBoundary){
    try{await requireCapabilityOperation(env,{capabilityCode:'provider_integration',command:'dispatch_provider',riskClass:'critical',tenantScope:'tenant'});}
    catch(error){failures.push(`PROVIDER_EXECUTION_BOUNDARY_UNAVAILABLE:${error.code||error.message}`);}
    try{await requireResourceContract(env,{resourceType:'provider',resourceKey:'*',consumerCapability:'provider_integration'});}
    catch(error){failures.push(`PROVIDER_RESOURCE_CONTRACT_UNAVAILABLE:${error.code||error.message}`);}
  }

  return Object.freeze({version:SECTOR_MISSION_CONTRACT_VERSION,kind:'sector_mission_contract_assessment',contract,countryCode:countryCode,sectorCode:sectorCode,matched:true,ready:failures.length===0,failures:Object.freeze(failures),capabilityContracts:Object.freeze(capabilityContracts),resourceContracts:Object.freeze(resourceContracts),contractGatewayVersion:CAPABILITY_RESOURCE_CONTRACT_VERSION,authority:Object.freeze({sectorContract:'reference_scenario_authority',missionTruth:'canonical_mission',lifecycle:'canonical_lifecycle',execution:'canonical_execution'})});
}

function normalize(row){
  return Object.freeze({
    id:Number(row.id),scenarioCode:String(row.scenario_code),name:String(row.name||''),description:String(row.description||''),countryCode:row.country_code?String(row.country_code).toUpperCase():null,sectorCode:String(row.sector_code||'general').toLowerCase(),lifecycleDefinitionId:Number(row.lifecycle_definition_id),version:Number(row.version||1),status:String(row.status),
    missionContract:parse(row.mission_contract_json,{}),steps:arr(parse(row.steps_json,[])).map(step=>Object.freeze({sequence:Number(step.sequence||0),code:String(step.code||''),actionCode:step.actionCode?String(step.actionCode):null,fromStates:arr(step.fromStates).map(String),toState:step.toState?String(step.toState):null,risk:step.risk?String(step.risk):null,humanApprovalRequired:Boolean(step.humanApprovalRequired),evidenceRequired:Boolean(step.evidenceRequired),verification:step.verification?String(step.verification):null,phase:step.phase?String(step.phase):null})),exceptionContract:parse(row.exception_contract_json,{}),verificationContract:parse(row.verification_contract_json,{}),metadata:parse(row.metadata_json,{}),requiredCapabilities:arr(parse(row.mission_contract_json,{}).requiredCapabilities).map(normalizeCapability),requiredResources:arr(parse(row.mission_contract_json,{}).requiredResources).map(normalizeResource),externalEffect:Boolean(parse(row.mission_contract_json,{}).externalEffect)});
}
function normalizeCapability(x){return {capabilityCode:clean(x?.capabilityCode||x?.code,120),command:clean(x?.command,120)||null};}
function normalizeResource(x){return {resourceType:clean(x?.resourceType,100),resourceKey:clean(x?.resourceKey,240),consumerCapability:clean(x?.consumerCapability,120)||null,tenantScope:clean(x?.tenantScope,80)||null};}
