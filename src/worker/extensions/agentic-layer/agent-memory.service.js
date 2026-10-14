import {canonicalAll,canonicalFirst} from '../../core/canonical-db.js';

export const AGENT_MEMORY_VERSION='11.06.0';

const OUTCOMES=Object.freeze(['RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN']);
const EXECUTION=Object.freeze(['NOT_EXECUTED','EXECUTED','FAILED','BLOCKED','UNKNOWN']);

export async function getAgentOutcomeMemory(env,{companyId,executorId=null,actionCodes=[]}={}){
  const company=Number(companyId||0)||0;
  if(!company)throw Object.assign(new Error('AGENT_MEMORY_COMPANY_REQUIRED'),{status:400,code:'AGENT_MEMORY_COMPANY_REQUIRED'});
  const executor=Number(executorId||0)||null;
  const codes=[...new Set((Array.isArray(actionCodes)?actionCodes:[]).map(v=>String(v||'').trim()).filter(Boolean))].slice(0,64);
  const [organization,executorProfile,actions]=await Promise.all([
    getOrganizationOutcomeProfile(env,company),
    executor?getExecutorOutcomeProfile(env,company,executor):Promise.resolve(null),
    getActionOutcomeProfiles(env,company,codes)
  ]);
  return Object.freeze({version:AGENT_MEMORY_VERSION,derivedOnly:true,source:'agent_outcome_events',organization,executor:executorProfile,actions,learningBoundary:{notAuthority:true,noAuthorizationInference:true,noTruthMutation:true,unknownExcludedFromFavorableRate:true}});
}

export async function getOrganizationOutcomeProfile(env,companyId){
  const row=await canonicalFirst(env,`SELECT company_id,profile_version,observed_outcomes,known_outcomes,favorable_outcomes,adverse_outcomes,blocked_outcomes,waiting_outcomes,unknown_outcomes,executed_events,failed_events,last_outcome_at,last_event_id,updated_at FROM agent_organization_outcome_profiles WHERE company_id=? LIMIT 1`,[Number(companyId)],'agent_organization_outcome_profile');
  return normalizeProfile(row,'organization');
}

export async function getExecutorOutcomeProfile(env,companyId,executorId){
  const row=await canonicalFirst(env,`SELECT company_id,executor_id,profile_version,observed_outcomes,known_outcomes,favorable_outcomes,adverse_outcomes,blocked_outcomes,waiting_outcomes,unknown_outcomes,executed_events,failed_events,last_outcome_at,last_event_id,updated_at FROM agent_executor_outcome_profiles WHERE company_id=? AND executor_id=? LIMIT 1`,[Number(companyId),Number(executorId)],'agent_executor_outcome_profile');
  return normalizeProfile(row,'executor');
}

export async function getActionOutcomeProfiles(env,companyId,actionCodes=[]){
  const codes=[...new Set((Array.isArray(actionCodes)?actionCodes:[]).map(v=>String(v||'').trim()).filter(Boolean))].slice(0,64);
  if(!codes.length)return [];
  const placeholders=codes.map(()=>'?').join(',');
  const rows=await canonicalAll(env,`SELECT company_id,action_code,profile_version,observed_outcomes,known_outcomes,favorable_outcomes,adverse_outcomes,blocked_outcomes,waiting_outcomes,unknown_outcomes,executed_events,failed_events,last_outcome_at,last_event_id,updated_at FROM agent_action_outcome_profiles WHERE company_id=? AND action_code IN (${placeholders}) ORDER BY action_code`,[Number(companyId),...codes],'agent_action_outcome_profiles');
  return (rows||[]).map(r=>normalizeProfile(r,'action'));
}

export async function listAgentOutcomeProfiles(env,{companyId=null,executorId=null,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));
  const company=Number(companyId||0)||0;
  const executor=Number(executorId||0)||0;
  const where=[];const args=[];
  if(company){where.push('p.company_id=?');args.push(company);}
  if(executor){where.push('p.executor_id=?');args.push(executor);}
  const rows=await canonicalAll(env,`SELECT p.company_id,p.executor_id,p.profile_version,p.observed_outcomes,p.known_outcomes,p.favorable_outcomes,p.adverse_outcomes,p.blocked_outcomes,p.waiting_outcomes,p.unknown_outcomes,p.executed_events,p.failed_events,p.last_outcome_at,p.last_event_id,p.updated_at,pei.display_name AS executor_name FROM agent_executor_outcome_profiles p LEFT JOIN public_executor_identities pei ON pei.id=p.executor_id ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY p.updated_at DESC LIMIT ?`,[...args,n],'agent_executor_outcome_profiles');
  return (rows||[]).map(r=>normalizeProfile({...r,kind:'executor'},'executor'));
}

export async function listOrganizationOutcomeProfiles(env,{companyId=null,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));
  const company=Number(companyId||0)||0;
  const rows=company
    ? await canonicalAll(env,`SELECT p.company_id,c.name AS company_name,p.profile_version,p.observed_outcomes,p.known_outcomes,p.favorable_outcomes,p.adverse_outcomes,p.blocked_outcomes,p.waiting_outcomes,p.unknown_outcomes,p.executed_events,p.failed_events,p.last_outcome_at,p.last_event_id,p.updated_at FROM agent_organization_outcome_profiles p LEFT JOIN companies c ON c.id=p.company_id WHERE p.company_id=? ORDER BY p.updated_at DESC LIMIT ?`,[company,n],'agent_organization_outcome_profiles')
    : await canonicalAll(env,`SELECT p.company_id,c.name AS company_name,p.profile_version,p.observed_outcomes,p.known_outcomes,p.favorable_outcomes,p.adverse_outcomes,p.blocked_outcomes,p.waiting_outcomes,p.unknown_outcomes,p.executed_events,p.failed_events,p.last_outcome_at,p.last_event_id,p.updated_at FROM agent_organization_outcome_profiles p LEFT JOIN companies c ON c.id=p.company_id ORDER BY p.updated_at DESC LIMIT ?`,[n],'agent_organization_outcome_profiles');
  return (rows||[]).map(r=>normalizeProfile({...r,kind:'organization'},'organization'));
}

export function buildProfileProjection(event){
  const outcome=OUTCOMES.includes(String(event?.outcomeCode||'').toUpperCase())?String(event.outcomeCode).toUpperCase():'UNKNOWN';
  const execution=EXECUTION.includes(String(event?.executionStatus||'').toUpperCase())?String(event.executionStatus).toUpperCase():'UNKNOWN';
  return {observedDelta:1,knownDelta:outcome==='UNKNOWN'?0:1,favorableDelta:['RESOLVED','PROGRESSED'].includes(outcome)?1:0,adverseDelta:outcome==='WORSENED'?1:0,blockedDelta:outcome==='BLOCKED'?1:0,waitingDelta:outcome==='WAITING'?1:0,unknownDelta:outcome==='UNKNOWN'?1:0,executedDelta:execution==='EXECUTED'?1:0,failedDelta:execution==='FAILED'?1:0};
}

export function profileUpsertStatements(env,event){
  const p=buildProfileProjection(event);const base=[p.observedDelta,p.knownDelta,p.favorableDelta,p.adverseDelta,p.blockedDelta,p.waitingDelta,p.unknownDelta,p.executedDelta,p.failedDelta,event.occurredAt||new Date().toISOString(),String(event.eventId||'')];
  const stmts=[];
  stmts.push(env.DB.prepare(`INSERT INTO agent_organization_outcome_profiles(company_id,profile_version,observed_outcomes,known_outcomes,favorable_outcomes,adverse_outcomes,blocked_outcomes,waiting_outcomes,unknown_outcomes,executed_events,failed_events,last_outcome_at,last_event_id,updated_at) VALUES(?,1,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id) DO UPDATE SET profile_version=agent_organization_outcome_profiles.profile_version+1,observed_outcomes=agent_organization_outcome_profiles.observed_outcomes+excluded.observed_outcomes,known_outcomes=agent_organization_outcome_profiles.known_outcomes+excluded.known_outcomes,favorable_outcomes=agent_organization_outcome_profiles.favorable_outcomes+excluded.favorable_outcomes,adverse_outcomes=agent_organization_outcome_profiles.adverse_outcomes+excluded.adverse_outcomes,blocked_outcomes=agent_organization_outcome_profiles.blocked_outcomes+excluded.blocked_outcomes,waiting_outcomes=agent_organization_outcome_profiles.waiting_outcomes+excluded.waiting_outcomes,unknown_outcomes=agent_organization_outcome_profiles.unknown_outcomes+excluded.unknown_outcomes,executed_events=agent_organization_outcome_profiles.executed_events+excluded.executed_events,failed_events=agent_organization_outcome_profiles.failed_events+excluded.failed_events,last_outcome_at=excluded.last_outcome_at,last_event_id=excluded.last_event_id,updated_at=CURRENT_TIMESTAMP`).bind(event.companyId,...base));
  if(Number(event.executorId||0)>0)stmts.push(env.DB.prepare(`INSERT INTO agent_executor_outcome_profiles(company_id,executor_id,profile_version,observed_outcomes,known_outcomes,favorable_outcomes,adverse_outcomes,blocked_outcomes,waiting_outcomes,unknown_outcomes,executed_events,failed_events,last_outcome_at,last_event_id,updated_at) VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id,executor_id) DO UPDATE SET profile_version=agent_executor_outcome_profiles.profile_version+1,observed_outcomes=agent_executor_outcome_profiles.observed_outcomes+excluded.observed_outcomes,known_outcomes=agent_executor_outcome_profiles.known_outcomes+excluded.known_outcomes,favorable_outcomes=agent_executor_outcome_profiles.favorable_outcomes+excluded.favorable_outcomes,adverse_outcomes=agent_executor_outcome_profiles.adverse_outcomes+excluded.adverse_outcomes,blocked_outcomes=agent_executor_outcome_profiles.blocked_outcomes+excluded.blocked_outcomes,waiting_outcomes=agent_executor_outcome_profiles.waiting_outcomes+excluded.waiting_outcomes,unknown_outcomes=agent_executor_outcome_profiles.unknown_outcomes+excluded.unknown_outcomes,executed_events=agent_executor_outcome_profiles.executed_events+excluded.executed_events,failed_events=agent_executor_outcome_profiles.failed_events+excluded.failed_events,last_outcome_at=excluded.last_outcome_at,last_event_id=excluded.last_event_id,updated_at=CURRENT_TIMESTAMP`).bind(event.companyId,Number(event.executorId),...base));
  stmts.push(env.DB.prepare(`INSERT INTO agent_action_outcome_profiles(company_id,action_code,profile_version,observed_outcomes,known_outcomes,favorable_outcomes,adverse_outcomes,blocked_outcomes,waiting_outcomes,unknown_outcomes,executed_events,failed_events,last_outcome_at,last_event_id,updated_at) VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id,action_code) DO UPDATE SET profile_version=agent_action_outcome_profiles.profile_version+1,observed_outcomes=agent_action_outcome_profiles.observed_outcomes+excluded.observed_outcomes,known_outcomes=agent_action_outcome_profiles.known_outcomes+excluded.known_outcomes,favorable_outcomes=agent_action_outcome_profiles.favorable_outcomes+excluded.favorable_outcomes,adverse_outcomes=agent_action_outcome_profiles.adverse_outcomes+excluded.adverse_outcomes,blocked_outcomes=agent_action_outcome_profiles.blocked_outcomes+excluded.blocked_outcomes,waiting_outcomes=agent_action_outcome_profiles.waiting_outcomes+excluded.waiting_outcomes,unknown_outcomes=agent_action_outcome_profiles.unknown_outcomes+excluded.unknown_outcomes,executed_events=agent_action_outcome_profiles.executed_events+excluded.executed_events,failed_events=agent_action_outcome_profiles.failed_events+excluded.failed_events,last_outcome_at=excluded.last_outcome_at,last_event_id=excluded.last_event_id,updated_at=CURRENT_TIMESTAMP`).bind(event.companyId,event.actionCode,...base));
  return stmts;
}

function normalizeProfile(row,kind){
  if(!row)return null;
  const observed=Number(row.observed_outcomes||0),known=Number(row.known_outcomes||0),favorable=Number(row.favorable_outcomes||0);
  return {kind,companyId:Number(row.company_id||0),...(kind==='executor'?{executorId:Number(row.executor_id||0),executorName:row.executor_name||null}:{}),...(kind==='action'?{actionCode:String(row.action_code||'')}:{}),profileVersion:Number(row.profile_version||1),observedOutcomes:observed,knownOutcomes:known,favorableOutcomes:favorable,adverseOutcomes:Number(row.adverse_outcomes||0),blockedOutcomes:Number(row.blocked_outcomes||0),waitingOutcomes:Number(row.waiting_outcomes||0),unknownOutcomes:Number(row.unknown_outcomes||0),executedEvents:Number(row.executed_events||0),failedEvents:Number(row.failed_events||0),favorableRate:known?Number((favorable/known).toFixed(4)):null,lastOutcomeAt:row.last_outcome_at||null,lastEventId:row.last_event_id||null,updatedAt:row.updated_at||null};
}
