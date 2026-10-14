import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';
import {auditAdminControl} from '../../security/admin-control-audit.service.js';
import {actionDefinition} from '../../application/actions/action-registry.js';
import {getCompanyAutonomyConfig} from './agent-autonomy.service.js';

export const AGENT_CUSTOMER_PILOT_VERSION='11.17.0';
export const PILOT_STATUSES=Object.freeze(['DRAFT','READY','ACTIVE','PAUSED','CLOSED']);
const SAFE_MODES=new Set(['OBSERVE','RECOMMEND_ONLY','PREPARE_ONLY','CONTROLLED_EXECUTION']);
const PILOT_EVENT_TYPES=Object.freeze(['CREATED','READINESS_EVALUATED','ACTIVATED','PAUSED','CLOSED','MISSION_ENROLLED','MISSION_PAUSED','MISSION_COMPLETED','EXECUTION_BLOCKED']);

export async function listCustomerPilots(env,{companyId=null,status=null,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));const where=[];const args=[];
  if(companyId){where.push('company_id=?');args.push(Number(companyId));}
  if(status){where.push('status=?');args.push(String(status).toUpperCase());}
  const rows=await canonicalAll(env,`SELECT * FROM agent_customer_pilot_profiles ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY updated_at DESC,id DESC LIMIT ?`,[...args,n],'agent_customer_pilot_authority');
  return (rows||[]).map(normalizePilot);
}

export async function getCustomerPilot(env,pilotId){
  const row=await canonicalFirst(env,'SELECT * FROM agent_customer_pilot_profiles WHERE pilot_id=? LIMIT 1',[String(pilotId||'')],'agent_customer_pilot_authority');
  return row?normalizePilot(row):null;
}

export async function createCustomerPilot(env,actor,input={}){
  const companyId=Number(input.companyId||0)||0;
  if(!companyId)throw fail('PILOT_COMPANY_ID_REQUIRED',400);
  const company=await canonicalFirst(env,'SELECT id,name FROM companies WHERE id=? LIMIT 1',[companyId],'company_authority');
  if(!company)throw fail('PILOT_COMPANY_NOT_FOUND',404);
  const country=String(input.countryCode||'').trim().toUpperCase();
  const sector=String(input.sectorCode||'').trim().toLowerCase();
  if(!/^[A-Z]{2}$/.test(country))throw fail('PILOT_COUNTRY_REQUIRED',400);
  if(!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(sector))throw fail('PILOT_SECTOR_INVALID',400);
  const name=String(input.name||`${country} ${sector} customer pilot`).trim().slice(0,160);
  const mode=String(input.operatingMode||'RECOMMEND_ONLY').toUpperCase();
  if(!SAFE_MODES.has(mode))throw fail('PILOT_MODE_INVALID',400);
  const actions=normalizeActions(input.approvedActionCodes);
  const providers=normalizeStrings(input.requiredProviderCodes);
  const roles=normalizeStrings(input.operatorRoles||['admin']);
  const pilotId=String(input.pilotId||crypto.randomUUID()).slice(0,120);
  await env.DB.prepare(`INSERT INTO agent_customer_pilot_profiles(pilot_id,company_id,country_code,sector_code,name,status,operating_mode,approved_action_codes_json,required_provider_codes_json,operator_roles_json,readiness_version,start_at,end_at,kill_switch_reason,created_by_role,created_by_id) VALUES(?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?,?,?,?)`).bind(pilotId,companyId,country,sector,name,mode,JSON.stringify(actions),JSON.stringify(providers),JSON.stringify(roles),AGENT_CUSTOMER_PILOT_VERSION,input.startAt||null,input.endAt||null,null,String(actor?.role||'platform_super_administrator'),String(actor?.id||actor?.userId||'platform')).run();
  await appendPilotEvent(env,{pilotId,companyId,eventType:'CREATED',actorType:'human',actorId:actor?.id||actor?.userId||'platform',status:'DRAFT',payload:{countryCode:country,sectorCode:sector,operatingMode:mode,approvedActionCodes:actions}});
  await auditAdminControl(env,{actor,action:'platform.agentic.customer_pilot.created',resourceType:'agent_customer_pilot',resourceId:pilotId,targetCompanyId:companyId,metadata:{countryCode:country,sectorCode:sector,operatingMode:mode}});
  return getCustomerPilot(env,pilotId);
}

export async function evaluateCustomerPilotReadiness(env,{pilotId}={}){
  const pilot=await getCustomerPilot(env,pilotId);if(!pilot)throw fail('PILOT_NOT_FOUND',404);
  const checks=[];
  const jurisdiction=await canonicalFirst(env,`SELECT code,status,framework_code,effective_version FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC LIMIT 1`,[pilot.countryCode],'jurisdiction_policy_authority');
  checks.push(check('JURISDICTION_POLICY',Boolean(jurisdiction),jurisdiction?{code:jurisdiction.code,version:jurisdiction.effective_version}:{reason:'ACTIVE_JURISDICTION_POLICY_REQUIRED'}));
  const compliance=await canonicalFirst(env,'SELECT status,jurisdiction_code FROM organization_compliance_policies WHERE company_id=? LIMIT 1',[pilot.companyId],'organization_compliance_policy_authority');
  checks.push(check('COMPANY_COMPLIANCE',!compliance||['active','verified','approved'].includes(String(compliance.status||'').toLowerCase()),compliance||{status:'NOT_CONFIGURED'}));
  const companyAutonomy=await getCompanyAutonomyConfig(env,pilot.companyId);
  if(pilot.operatingMode==='CONTROLLED_EXECUTION') checks.push(check('COMPANY_AUTONOMY',Boolean(companyAutonomy?.executionEnabled&&companyAutonomy?.mode==='CONTROLLED_EXECUTION'),companyAutonomy||{reason:'COMPANY_AUTONOMY_NOT_CONFIGURED'}));
  else checks.push(check('COMPANY_AUTONOMY',true,{mode:companyAutonomy?.mode||'NOT_CONFIGURED',executionEnabled:Boolean(companyAutonomy?.executionEnabled)}));
  if(pilot.operatingMode==='CONTROLLED_EXECUTION') checks.push(check('PILOT_TIME_WINDOW',Boolean(pilot.startAt&&pilot.endAt&&Date.parse(pilot.startAt)<Date.parse(pilot.endAt)),{startAt:pilot.startAt,endAt:pilot.endAt,reason:'CONTROLLED_PILOT_TIME_WINDOW_REQUIRED'}));
  else checks.push(check('PILOT_TIME_WINDOW',true,{startAt:pilot.startAt,endAt:pilot.endAt}));
  const actions=[];
  for(const code of pilot.approvedActionCodes){
    const def=actionDefinition(code);const high=def&&['delete_mission','cancel_mission','complete_mission','complete_operation','remove_driver','delete_customer','suspend_trust','abort_custody_transfer','finalize_custody_transfer'].includes(code);
    actions.push({actionCode:code,registered:Boolean(def),humanApprovalRequired:Boolean(high)});
  }
  checks.push(check('ACTION_ALLOWLIST',actions.length>0&&actions.every(x=>x.registered&&!x.humanApprovalRequired),{actions}));
  const providerResults=[];
  for(const providerCode of pilot.requiredProviderCodes){
    const cap=await canonicalFirst(env,'SELECT provider_code,capability_code,action_code,active FROM external_provider_capabilities WHERE provider_code=? AND active=1 LIMIT 1',[providerCode],'external_provider_capability_authority');
    providerResults.push({providerCode,available:Boolean(cap),capability:cap||null});
  }
  if(pilot.requiredProviderCodes.length) checks.push(check('PROVIDER_READINESS',providerResults.every(x=>x.available),{providers:providerResults}));
  else checks.push(check('PROVIDER_READINESS',true,{providers:[]}));
  const scope=await canonicalFirst(env,'SELECT COUNT(*) AS count FROM agent_pilot_mission_enrollments WHERE pilot_id=? AND status IN (\'ENROLLED\',\'ACTIVE\')',[pilot.pilotId],'agent_pilot_mission_enrollment_authority');
  checks.push(check('MISSION_SCOPE',true,{enrolledMissions:Number(scope?.count||0)}));
  const blocked=checks.filter(x=>x.status==='BLOCKED');
  const warnings=checks.filter(x=>x.status==='WARN');
  const state=blocked.length?'BLOCKED':warnings.length?'WARN':'PASS';
  for(const c of checks) await env.DB.prepare(`INSERT INTO agent_pilot_readiness_checks(pilot_id,check_code,status,evidence_json,evaluated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(pilot_id,check_code) DO UPDATE SET status=excluded.status,evidence_json=excluded.evidence_json,evaluated_at=CURRENT_TIMESTAMP`).bind(pilot.pilotId,c.code,c.status,JSON.stringify(c.evidence||{})).run();
  await appendPilotEvent(env,{pilotId:pilot.pilotId,companyId:pilot.companyId,eventType:'READINESS_EVALUATED',actorType:'system',actorId:'on-mission',status:state,payload:{checks}});
  return {version:AGENT_CUSTOMER_PILOT_VERSION,pilot,overall:state,checks};
}

export async function setCustomerPilotStatus(env,actor,{pilotId,status,reason}={}){
  const pilot=await getCustomerPilot(env,pilotId);if(!pilot)throw fail('PILOT_NOT_FOUND',404);
  const next=String(status||'').toUpperCase();if(!PILOT_STATUSES.includes(next))throw fail('PILOT_STATUS_INVALID',400);
  if(next==='ACTIVE'){
    const readiness=await evaluateCustomerPilotReadiness(env,{pilotId});
    if(readiness.overall==='BLOCKED')throw Object.assign(new Error('PILOT_READINESS_BLOCKED'),{status:423,code:'PILOT_READINESS_BLOCKED',checks:readiness.checks});
    if(!pilot.approvedActionCodes.length)throw fail('PILOT_ACTION_ALLOWLIST_REQUIRED',409);
  }
  const kill=(next==='PAUSED'||next==='CLOSED')?String(reason||`${next} by operator`).slice(0,500):null;
  await env.DB.prepare(`UPDATE agent_customer_pilot_profiles SET status=?,kill_switch_reason=?,updated_at=CURRENT_TIMESTAMP WHERE pilot_id=?`).bind(next,kill,pilotId).run();
  await appendPilotEvent(env,{pilotId,companyId:pilot.companyId,eventType:next==='ACTIVE'?'ACTIVATED':next==='PAUSED'?'PAUSED':'CLOSED',actorType:'human',actorId:actor?.id||actor?.userId||'platform',status:next,payload:{reason:kill}});
  await auditAdminControl(env,{actor,action:`platform.agentic.customer_pilot.${next.toLowerCase()}`,resourceType:'agent_customer_pilot',resourceId:pilotId,targetCompanyId:pilot.companyId,metadata:{status:next,reason:kill}});
  return getCustomerPilot(env,pilotId);
}

export async function enrollMissionInPilot(env,actor,{pilotId,missionId,actionAllowlist=null,operatorRequired=true}={}){
  const pilot=await getCustomerPilot(env,pilotId);if(!pilot)throw fail('PILOT_NOT_FOUND',404);
  if(pilot.status!=='ACTIVE')throw fail('PILOT_NOT_ACTIVE',423);
  const mission=await canonicalFirst(env,'SELECT id,company_id,country_code,sector_code,status FROM missions WHERE id=? AND company_id=? LIMIT 1',[Number(missionId||0),pilot.companyId],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  if(String(mission.country_code||'').toUpperCase()!==pilot.countryCode||String(mission.sector_code||'').toLowerCase()!==pilot.sectorCode)throw fail('PILOT_MISSION_SCOPE_MISMATCH',409);
  const allow=normalizeActions(actionAllowlist==null?pilot.approvedActionCodes:actionAllowlist).filter(x=>pilot.approvedActionCodes.includes(x));
  if(!allow.length)throw fail('PILOT_MISSION_ACTIONS_EMPTY',409);
  await env.DB.prepare(`INSERT INTO agent_pilot_mission_enrollments(pilot_id,company_id,mission_id,status,action_allowlist_json,operator_required,enrolled_by_role,enrolled_by_id) VALUES(?,?,?,'ENROLLED',?,?,?,?) ON CONFLICT(pilot_id,mission_id) DO UPDATE SET status='ENROLLED',action_allowlist_json=excluded.action_allowlist_json,operator_required=excluded.operator_required,enrolled_by_role=excluded.enrolled_by_role,enrolled_by_id=excluded.enrolled_by_id,updated_at=CURRENT_TIMESTAMP`).bind(pilot.pilotId,pilot.companyId,Number(mission.id),JSON.stringify(allow),operatorRequired?1:0,String(actor?.role||'platform_super_administrator'),String(actor?.id||actor?.userId||'platform')).run();
  await appendPilotEvent(env,{pilotId:pilot.pilotId,companyId:pilot.companyId,missionId:Number(mission.id),eventType:'MISSION_ENROLLED',actorType:'human',actorId:actor?.id||actor?.userId||'platform',status:'ENROLLED',payload:{actionAllowlist:allow,operatorRequired:Boolean(operatorRequired)}});
  return getPilotMissionScope(env,{companyId:pilot.companyId,missionId:mission.id});
}

export async function getPilotMissionScope(env,{companyId,missionId,actionCode=null}={}){
  const row=await canonicalFirst(env,`SELECT e.*,p.country_code,p.sector_code,p.name,p.status AS pilot_status,p.operating_mode,p.approved_action_codes_json FROM agent_pilot_mission_enrollments e JOIN agent_customer_pilot_profiles p ON p.pilot_id=e.pilot_id WHERE e.company_id=? AND e.mission_id=? AND e.status IN ('ENROLLED','ACTIVE') AND p.status='ACTIVE' ORDER BY e.id DESC LIMIT 1`,[Number(companyId||0),Number(missionId||0)],'agent_pilot_mission_enrollment_authority');
  if(!row)return {enrolled:false,reason:'PILOT_MISSION_NOT_ENROLLED'};
  const actions=parseArray(row.action_allowlist_json);
  const approved=parseArray(row.approved_action_codes_json);
  const enrollmentAllowed=!actionCode||actions.includes(String(actionCode));
  const pilotApproved=!actionCode||approved.includes(String(actionCode));
  const allowed=enrollmentAllowed&&pilotApproved;
  const executable=String(row.operating_mode||'RECOMMEND_ONLY')==='CONTROLLED_EXECUTION';
  const now=Date.now();const starts=row.start_at?Date.parse(row.start_at):null;const ends=row.end_at?Date.parse(row.end_at):null;
  const windowOpen=(!starts||now>=starts)&&(!ends||now<ends);
  return {enrolled:true,pilotId:row.pilot_id,pilotName:row.name,pilotStatus:row.pilot_status,enrollmentStatus:row.status,countryCode:row.country_code,sectorCode:row.sector_code,operatingMode:row.operating_mode,operatorRequired:Boolean(Number(row.operator_required)),actionAllowlist:actions,approvedActionCodes:approved,actionAllowed:allowed,pilotApproved,executable,windowOpen,startAt:row.start_at||null,endAt:row.end_at||null,reason:!executable?'PILOT_OPERATING_MODE_NOT_EXECUTABLE':!windowOpen?'PILOT_TIME_WINDOW_CLOSED':!allowed?'PILOT_ACTION_NOT_ALLOWLISTED':'PILOT_SCOPE_READY'};
}

export async function requirePilotExecutionScope(env,{companyId,missionId,actionCode}={}){
  const scope=await getPilotMissionScope(env,{companyId,missionId,actionCode});
  if(!scope.enrolled)throw Object.assign(new Error('PILOT_MISSION_ENROLLMENT_REQUIRED'),{status:423,code:'PILOT_MISSION_ENROLLMENT_REQUIRED',pilotScope:scope});
  if(!scope.executable)throw Object.assign(new Error('PILOT_OPERATING_MODE_NOT_EXECUTABLE'),{status:423,code:'PILOT_OPERATING_MODE_NOT_EXECUTABLE',pilotScope:scope});
  if(!scope.windowOpen)throw Object.assign(new Error('PILOT_TIME_WINDOW_CLOSED'),{status:423,code:'PILOT_TIME_WINDOW_CLOSED',pilotScope:scope});
  if(!scope.actionAllowed)throw Object.assign(new Error('PILOT_ACTION_NOT_ALLOWLISTED'),{status:423,code:'PILOT_ACTION_NOT_ALLOWLISTED',pilotScope:scope});
  return scope;
}

export async function listPilotReadiness(env,{pilotId,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));
  return (await canonicalAll(env,'SELECT * FROM agent_pilot_readiness_checks WHERE pilot_id=? ORDER BY evaluated_at DESC,id DESC LIMIT ?',[String(pilotId||''),n],'agent_pilot_readiness_authority'))||[];
}
export async function listPilotEvents(env,{pilotId,missionId=null,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));const where=['pilot_id=?'];const args=[String(pilotId||'')];
  if(missionId){where.push('mission_id=?');args.push(Number(missionId));}
  return (await canonicalAll(env,`SELECT event_id,pilot_id,company_id,mission_id,action_code,event_type,actor_type,actor_id,status,payload_json,previous_event_hash,event_hash,created_at FROM agent_pilot_events WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`,[...args,n],'agent_pilot_event_store'))||[];
}
async function appendPilotEvent(env,{pilotId,companyId,missionId=null,actionCode=null,eventType,actorType,actorId,status,payload={}}={}){
  if(!PILOT_EVENT_TYPES.includes(eventType))throw fail('PILOT_EVENT_TYPE_INVALID',400);
  const previous=await canonicalFirst(env,'SELECT event_hash FROM agent_pilot_events WHERE pilot_id=? ORDER BY id DESC LIMIT 1',[String(pilotId)],'agent_pilot_event_store');
  const event={eventId:crypto.randomUUID(),pilotId:String(pilotId),companyId:Number(companyId),missionId:missionId?Number(missionId):null,actionCode:actionCode?String(actionCode):null,eventType,actorType:String(actorType||'system'),actorId:actorId?String(actorId):null,status:String(status||'UNKNOWN'),payload:payload||{},previousEventHash:previous?.event_hash||null};
  event.eventHash=await sha256(stableStringify(event));
  await env.DB.prepare(`INSERT INTO agent_pilot_events(event_id,pilot_id,company_id,mission_id,action_code,event_type,actor_type,actor_id,status,payload_json,previous_event_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(event.eventId,event.pilotId,event.companyId,event.missionId,event.actionCode,event.eventType,event.actorType,event.actorId,event.status,JSON.stringify(event.payload),event.previousEventHash,event.eventHash).run();
  return event;
}
function check(code,pass,evidence){return {code,status:pass?'PASS':'BLOCKED',evidence:evidence||{}};}
function normalizePilot(r){return {id:Number(r.id),pilotId:String(r.pilot_id),companyId:Number(r.company_id),countryCode:String(r.country_code),sectorCode:String(r.sector_code),name:String(r.name),status:String(r.status),operatingMode:String(r.operating_mode),approvedActionCodes:parseArray(r.approved_action_codes_json),requiredProviderCodes:parseArray(r.required_provider_codes_json),operatorRoles:parseArray(r.operator_roles_json),readinessVersion:String(r.readiness_version),startAt:r.start_at||null,endAt:r.end_at||null,killSwitchReason:r.kill_switch_reason||null,createdAt:r.created_at,updatedAt:r.updated_at};}
function normalizeActions(v){return [...new Set((Array.isArray(v)?v:[]).map(x=>String(x||'').trim().toLowerCase()).filter(x=>x&&actionDefinition(x)))];}
function normalizeStrings(v){return [...new Set((Array.isArray(v)?v:[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,50);}
function parseArray(v){try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
function fail(code,status){return Object.assign(new Error(code),{status,code});}
function stableStringify(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
