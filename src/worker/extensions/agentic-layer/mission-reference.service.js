import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';

export const MISSION_REFERENCE_VERSION='11.14.0';

export async function listMissionReferenceScenarios(env,{countryCode=null,sectorCode=null,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));
  const where=["status='active'"];const args=[];
  if(countryCode){where.push('(country_code=? OR country_code IS NULL)');args.push(String(countryCode).trim().toUpperCase());}
  if(sectorCode){where.push('(lower(sector_code)=lower(?) OR sector_code=\'general\')');args.push(String(sectorCode).trim().toLowerCase());}
  const rows=await canonicalAll(env,`SELECT * FROM platform_mission_reference_scenarios WHERE ${where.join(' AND ')} ORDER BY CASE WHEN country_code IS NULL THEN 1 ELSE 0 END,CASE WHEN sector_code='general' THEN 1 ELSE 0 END,version DESC,id DESC LIMIT ?`,[...args,n],'mission_reference_scenario_registry');
  return (rows||[]).map(normalizeScenario);
}

export async function resolveMissionReferenceScenario(env,{countryCode,sectorCode,scenarioCode=null}={}){
  const country=String(countryCode||'').trim().toUpperCase();
  const sector=String(sectorCode||'general').trim().toLowerCase()||'general';
  if(scenarioCode){
    const exact=await canonicalFirst(env,`SELECT * FROM platform_mission_reference_scenarios WHERE scenario_code=? AND status='active' ORDER BY version DESC LIMIT 1`,[String(scenarioCode).trim()],'mission_reference_scenario_registry');
    if(exact)return normalizeScenario(exact);
  }
  const rows=await canonicalAll(env,`SELECT * FROM platform_mission_reference_scenarios WHERE status='active' AND (country_code=? OR country_code IS NULL) AND (lower(sector_code)=lower(?) OR sector_code='general') ORDER BY CASE WHEN country_code=? THEN 0 ELSE 1 END,CASE WHEN lower(sector_code)=lower(?) THEN 0 ELSE 1 END,version DESC,id DESC LIMIT 20`,[country,sector,country,sector],'mission_reference_scenario_registry');
  return (rows||[]).map(normalizeScenario)[0]||null;
}

export async function assessMissionReference(env,{companyId,missionId,scenarioCode=null}={}){
  const cid=Number(companyId||0)||0;const mid=Number(missionId||0)||0;
  if(!cid||!mid)throw fail('MISSION_REFERENCE_SCOPE_REQUIRED',400);
  const mission=await canonicalFirst(env,`SELECT id,company_id,reference,status,objective,sector_code,country_code,lifecycle_definition_id,lifecycle_state_code,state_version,owner_driver_id,delivery_proof_required,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1`,[mid,cid],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const scenario=await resolveMissionReferenceScenario(env,{countryCode:mission.country_code,sectorCode:mission.sector_code,scenarioCode});
  if(!scenario)return {version:MISSION_REFERENCE_VERSION,kind:'mission_reference_assessment',matched:false,mission:compactMission(mission),scenario:null,readiness:{state:'UNAVAILABLE',reasons:['NO_ACTIVE_REFERENCE_SCENARIO']}};
  const stops=(await canonicalAll(env,`SELECT id,sequence_no,stop_type,status,evidence_required FROM mission_stops WHERE company_id=? AND mission_id=? ORDER BY sequence_no ASC,id ASC`,[cid,mid],'mission_stop_authority'))||[];
  const object=(await canonicalFirst(env,`SELECT id,sequence_no,description FROM mission_objects WHERE company_id=? AND mission_id=? ORDER BY sequence_no ASC,id ASC LIMIT 1`,[cid,mid],'mission_object_authority'))||null;
  const assignment=(await canonicalFirst(env,`SELECT assignment_type,assignee_type,assignee_id,assignee_company_id,status FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`,[cid,mid],'mission_assignment_authority'))||null;
  const proof=await safeProof(env,mission);
  const steps=scenario.steps;
  const currentStatus=String(mission.status||'Pending');
  const completed= currentStatus==='Completed'||currentStatus==='Cancelled'||currentStatus==='Canceled';
  const missing=[];
  const contract=scenario.missionContract||{};
  if(Array.isArray(contract.required)&&contract.required.includes('objective')&&!String(mission.objective||'').trim())missing.push('objective');
  if(Array.isArray(contract.required)&&contract.required.includes('pickup_stop')&&!stops.some(x=>x.stop_type==='pickup'))missing.push('pickup_stop');
  if(Array.isArray(contract.required)&&contract.required.includes('delivery_stop')&&!stops.some(x=>x.stop_type==='delivery'))missing.push('delivery_stop');
  if(Array.isArray(contract.required)&&contract.required.includes('object')&&!object)missing.push('object');
  if(!completed&&currentStatus!=='Pending'&&Array.isArray(contract.required)&&contract.required.includes('execution_assignment')&&!assignment)missing.push('execution_assignment');
  const next=selectNextStep({steps,currentStatus,assignment,proof,completed});
  const reasons=[];
  if(String(mission.lifecycle_definition_id||'')!==String(scenario.lifecycleDefinitionId||''))reasons.push('LIFECYCLE_CONTRACT_MISMATCH');
  if(missing.length)reasons.push('REFERENCE_REQUIREMENTS_MISSING');
  if(completed)reasons.push('MISSION_TERMINAL');
  if(next?.code==='PROOF'&&!proof)reasons.push('DELIVERY_PROOF_REQUIRED');
  const state=reasons.includes('LIFECYCLE_CONTRACT_MISMATCH')?'UNAVAILABLE':reasons.includes('REFERENCE_REQUIREMENTS_MISSING')?'BLOCKED':reasons.includes('MISSION_TERMINAL')?'TERMINAL':next?'READY':'WAITING';
  return {version:MISSION_REFERENCE_VERSION,kind:'mission_reference_assessment',matched:true,mission:compactMission(mission),scenario,readiness:{state,reasons,nextStep:next,missingRequirements:missing},canonical:{assignment,proof,stops,object},safety:{referenceOnly:true,truthAuthority:'canonical_mission',assignmentAuthority:'canonical_assignment',executionAuthority:'canonical_action_application_service',verificationRequired:true,unknownMustRemainUnknown:true}};
}

function selectNextStep({steps,currentStatus,assignment,proof,completed}){
  if(completed)return null;
  for(const step of steps){
    const from=Array.isArray(step.fromStates)?step.fromStates.map(String):[];
    if(from.length&&!from.includes(currentStatus))continue;
    if(step.code==='ASSIGN'&&assignment)continue;
    if(step.code==='PROOF'&&proof)continue;
    return step;
  }
  return null;
}

async function safeProof(env,mission){
  try{return await canonicalFirst(env,`SELECT dp.id,dp.company_id,dp.mission_id,dp.file_id,dp.submitted_by_role,dp.driver_id,dp.executor_id,dp.created_at FROM mission_delivery_proofs dp JOIN mission_files mf ON mf.id=dp.file_id AND mf.company_id=dp.company_id AND mf.mission_id=dp.mission_id WHERE dp.company_id=? AND dp.mission_id=? AND mf.disposition_status<>'disposed' LIMIT 1`,[Number(mission.company_id),Number(mission.id)],'mission_delivery_proof_authority');}catch{return null;}
}

function normalizeScenario(row){return {id:Number(row.id),scenarioCode:String(row.scenario_code),name:String(row.name),description:String(row.description||''),countryCode:row.country_code?String(row.country_code):null,sectorCode:String(row.sector_code),lifecycleDefinitionId:Number(row.lifecycle_definition_id),version:Number(row.version),status:String(row.status),missionContract:parse(row.mission_contract_json),steps:parseArray(row.steps_json),exceptionContract:parse(row.exception_contract_json),verificationContract:parse(row.verification_contract_json),metadata:parse(row.metadata_json)};}
function compactMission(m){return {id:Number(m.id),companyId:Number(m.company_id),reference:m.reference||null,status:m.status||null,objective:m.objective||'',countryCode:m.country_code||null,sectorCode:m.sector_code||null,lifecycleDefinitionId:Number(m.lifecycle_definition_id||0)||null,lifecycleStateCode:m.lifecycle_state_code||null,stateVersion:Number(m.state_version||0)||null};}
function parse(v){try{return v?JSON.parse(v):{};}catch{return {};}}
function parseArray(v){const p=parse(v);return Array.isArray(p)?p:[];}
function fail(code,status){return Object.assign(new Error(code),{status,code});}
