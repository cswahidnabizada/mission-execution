/**
 * ON Mission 14.0 — Universal Mission Contract
 *
 * Projection/validation boundary only. It never owns mission truth, planning,
 * assignment, authorization or execution. Sector contracts remain the source
 * of sector-specific requirements.
 */
export const UNIVERSAL_MISSION_CONTRACT_VERSION='14.0.0';
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const text=(v,max=240)=>String(v??'').trim().slice(0,max);

export function buildUniversalMissionContract({mission={},sectorContract=null,referenceMission=null}={}){
  const sector=text(mission.sector_code||sectorContract?.sectorCode||referenceMission?.scenario?.sectorCode||'general',80).toLowerCase()||'general';
  const country=text(mission.country_code||sectorContract?.countryCode||referenceMission?.scenario?.countryCode||'',8).toUpperCase()||null;
  const capability=text(mission.capability_code||'',100)||null;
  const context=obj(parseJson(mission.mission_context_json));
  const contract=obj(sectorContract?.contract||referenceMission?.scenario?.missionContract||{});
  const logistics=sector==='logistics'||capability==='logistics';
  const requiredCapabilities=arr(contract.requiredCapabilities).map(normalizeCapability);
  const requiredResources=arr(contract.requiredResources).map(normalizeResource);
  return Object.freeze({
    version:UNIVERSAL_MISSION_CONTRACT_VERSION,
    kind:'universal_mission_contract',
    missionId:Number(mission.id||0)||null,
    objective:text(mission.objective||context.objective,1000),
    countryCode:country,
    sectorCode:sector,
    productDefinitionId:Number(mission.product_definition_id||0)||null,
    lifecycleDefinitionId:Number(mission.lifecycle_definition_id||sectorContract?.contract?.lifecycleDefinitionId||0)||null,
    capabilityCode:capability,
    responsibilityMode:text(mission.responsibility_mode||'assigned',60),
    context,
    constraints:Object.freeze({time:context.time||{},location:context.location||{},policy:context.policy||{},risk:context.risk||{}}),
    requiredCapabilities:Object.freeze(requiredCapabilities),
    requiredResources:Object.freeze(requiredResources),
    evidenceRequirements:Object.freeze(arr(contract.evidenceRequirements||contract.evidence||referenceMission?.scenario?.verificationContract?.evidence).map(String)),
    verification:Object.freeze(obj(contract.verification||referenceMission?.scenario?.verificationContract||{})),
    recovery:Object.freeze(obj(contract.recovery||referenceMission?.scenario?.exceptionContract||{})),
    sectorContract:Object.freeze({id:Number(sectorContract?.contract?.id||referenceMission?.scenario?.id||0)||null,version:Number(sectorContract?.contract?.version||referenceMission?.scenario?.version||0)||null,matched:Boolean(sectorContract?.matched||referenceMission?.matched)}),
    domain:Object.freeze({logistics,sectorSpecific:!logistics})
  });
}

export function validateUniversalMissionContract(contract,{requireExecutionReady=false}={}){
  const failures=[];
  if(!contract||contract.kind!=='universal_mission_contract')failures.push('UNIVERSAL_MISSION_CONTRACT_MISSING');
  if(!text(contract?.objective,1000))failures.push('MISSION_OBJECTIVE_REQUIRED');
  if(!text(contract?.sectorCode,80))failures.push('MISSION_SECTOR_REQUIRED');
  if(!text(contract?.countryCode,8))failures.push('MISSION_COUNTRY_REQUIRED');
  if(contract?.domain?.logistics){
    const c=contract.context||{};
    if(!c.pickup?.location&&!c.delivery?.location&&requireExecutionReady)failures.push('LOGISTICS_LOCATIONS_REQUIRED');
  }
  if(requireExecutionReady&&!contract?.sectorContract?.matched)failures.push('SECTOR_CONTRACT_REQUIRED');
  return Object.freeze({valid:failures.length===0,failures:Object.freeze(failures)});
}

function normalizeCapability(v){const x=obj(v);return Object.freeze({code:text(x.code||x.capabilityCode,120),required:Boolean(x.required!==false),reason:text(x.reason,240)});}
function normalizeResource(v){const x=obj(v);return Object.freeze({type:text(x.type||x.resourceType,120),key:text(x.key||x.resourceKey||'*',200),required:Boolean(x.required!==false),reason:text(x.reason,240)});}
function parseJson(v){try{return JSON.parse(String(v||'{}'))||{}}catch{return {};}}
