import {canonicalAll,canonicalFirst} from '../../core/canonical-db.js';
import {getMissionNextSituation,MISSION_CONTINUITY_AUTHORITY_VERSION} from '../../security/mission-continuity-authority.service.js';

export const AGENT_MISSION_HISTORY_VERSION='11.07.0';
const MAX_LIMIT=80;

/**
 * Derived mission trajectory for the agent. Canonical mission/status/transition/
 * evidence sources remain authoritative; agent outcomes are observational.
 * This service never mutates any source and never redefines mission truth.
 */
export async function getAgentMissionOutcomeHistory(env,{companyId,missionId,limit=60}={}){
  const company=Number(companyId||0)||0;
  const mission=Number(missionId||0)||0;
  if(!company)throw Object.assign(new Error('AGENT_HISTORY_COMPANY_REQUIRED'),{status:400,code:'AGENT_HISTORY_COMPANY_REQUIRED'});
  if(!mission)throw Object.assign(new Error('AGENT_HISTORY_MISSION_REQUIRED'),{status:400,code:'AGENT_HISTORY_MISSION_REQUIRED'});
  const n=Math.min(MAX_LIMIT,Math.max(1,Number(limit)||60));
  const canonicalMission=await canonicalFirst(env,`SELECT id,company_id,reference,status,state_version,created_at,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1`,[mission,company],'mission_authority');
  if(!canonicalMission)throw Object.assign(new Error('AGENT_HISTORY_MISSION_NOT_FOUND'),{status:404,code:'AGENT_HISTORY_MISSION_NOT_FOUND'});

  const [statusHistory,transitionHistory,agentOutcomes,evidenceHistory,exceptionHistory,nextSituations]=await Promise.all([
    canonicalAll(env,`SELECT id,status,created_at FROM mission_status_history WHERE mission_id=? ORDER BY id ASC LIMIT ?`,[mission,n*2],'mission_status_history'),
    canonicalAll(env,`SELECT id,event_key,transition_key,action_code,outcome,actor_role,actor_identity_id,actor_name,from_status,to_status,state_token_before,state_token_after,created_at,committed_at FROM mission_event_ledger WHERE company_id=? AND mission_id=? AND outcome='committed' ORDER BY id ASC LIMIT ?`,[company,mission,n*2],'mission_event_ledger'),
    canonicalAll(env,`SELECT id,event_id,decision_id,executor_id,agent_id,action_code,intent_json,context_version,context_hash,plan_json,authorization_json,execution_status,outcome_code,outcome_confidence,evidence_json,state_version_before,state_version_after,model_id,model_version,policy_version,recalibration_version,occurred_at,created_at FROM agent_outcome_events WHERE company_id=? AND mission_id=? ORDER BY id ASC LIMIT ?`,[company,mission,n],'agent_outcome_event_store'),
    canonicalAll(env,`SELECT id,evidence_type,event_code,actor_type,actor_id,metadata_json,created_at FROM mission_evidence_events WHERE company_id=? AND mission_id=? ORDER BY id ASC LIMIT ?`,[company,mission,n],'mission_evidence_events'),
    canonicalAll(env,`SELECT id,exception_type,status,resolved_at,created_at,note FROM mission_exceptions WHERE company_id=? AND mission_id=? ORDER BY id ASC LIMIT ?`,[company,mission,n],'mission_exception_authority'),
    getMissionNextSituation(env,{companyId:company,missionId:mission,limit:n})
  ]);

  const statuses=(statusHistory||[]).map(x=>({id:Number(x.id),status:String(x.status||''),at:String(x.created_at||'')}));
  const transitions=(transitionHistory||[]).map(x=>({
    id:Number(x.id),eventKey:String(x.event_key||''),transitionKey:String(x.transition_key||''),action:String(x.action_code||''),outcome:String(x.outcome||''),
    actor:{role:x.actor_role||null,id:Number(x.actor_identity_id||0)||null,name:x.actor_name||null},
    fromStatus:x.from_status||null,toStatus:x.to_status||null,stateBefore:x.state_token_before||null,stateAfter:x.state_token_after||null,
    at:String(x.committed_at||x.created_at||'')
  }));
  const outcomes=(agentOutcomes||[]).map(x=>normalizeOutcome(x));
  const evidence=(evidenceHistory||[]).map(x=>({id:Number(x.id),type:String(x.evidence_type||''),code:String(x.event_code||''),actorType:x.actor_type||null,actorId:Number(x.actor_id||0)||null,metadata:parseJson(x.metadata_json,{}),at:String(x.created_at||'')}));
  const exceptions=(exceptionHistory||[]).map(x=>({id:Number(x.id),type:String(x.exception_type||''),status:String(x.status||''),resolvedAt:x.resolved_at||null,note:String(x.note||''),at:String(x.created_at||'')}));

  const steps=buildTrajectory({mission:canonicalMission,statuses,transitions,outcomes,evidence,exceptions,limit:n});
  const timeline=buildTimeline({statuses,transitions,outcomes,evidence,exceptions,limit:n});
  const nextSituation=nextSituations?.[0]||{status:String(canonicalMission.status||''),state:'CURRENT_STATUS_ONLY',canonical:false};
  return Object.freeze({
    version:AGENT_MISSION_HISTORY_VERSION,
    continuityVersion:MISSION_CONTINUITY_AUTHORITY_VERSION,
    missionId:mission,
    companyId:company,
    derivedOnly:true,
    authoritative:false,
    readOnly:true,
    tenantScoped:true,
    current:{status:String(canonicalMission.status||''),stateVersion:Number(canonicalMission.state_version||0)||null,updatedAt:canonicalMission.updated_at||null},
    trajectory:steps,
    timeline,
    nextSituation,
    summary:Object.freeze({
      statusChangeCount:statuses.length,
      transitionCount:transitions.length,
      agentOutcomeCount:outcomes.length,
      evidenceCount:evidence.length,
      exceptionCount:exceptions.length,
      knownAgentOutcomes:outcomes.filter(x=>x.outcome!=='UNKNOWN').length,
      unknownAgentOutcomes:outcomes.filter(x=>x.outcome==='UNKNOWN').length
    }),
    learningBoundary:Object.freeze({notAuthority:true,noAuthorizationInference:true,noTruthMutation:true,unknownRemainsUnknown:true,retrievalMustRevalidateAgainstCanonical:true})
  });
}

function normalizeOutcome(x){
  return {
    id:Number(x.id),eventId:String(x.event_id||''),decisionId:String(x.decision_id||''),executorId:Number(x.executor_id||0)||null,agentId:x.agent_id||null,
    action:String(x.action_code||''),intent:parseJson(x.intent_json,{}),plan:parseJson(x.plan_json,{}),authorization:parseJson(x.authorization_json,{}),
    contextVersion:String(x.context_version||''),contextHash:String(x.context_hash||''),executionStatus:String(x.execution_status||'UNKNOWN'),outcome:String(x.outcome_code||'UNKNOWN'),
    confidence:String(x.outcome_confidence||'LOW'),evidence:parseJson(x.evidence_json,[]),stateVersionBefore:Number(x.state_version_before||0)||null,stateVersionAfter:Number(x.state_version_after||0)||null,
    modelId:x.model_id||null,modelVersion:x.model_version||null,policyVersion:x.policy_version||null,recalibrationVersion:x.recalibration_version||null,
    at:String(x.occurred_at||x.created_at||'')
  };
}

function buildTrajectory({mission,statuses,transitions,outcomes,evidence,exceptions,limit}){
  const out=[];
  for(let i=0;i<outcomes.length&&out.length<limit;i++){
    const current=outcomes[i];
    const previous=outcomes[i-1]||null;
    const next=outcomes[i+1]||null;
    const situationBefore=situationAt(current.at,current.stateVersionBefore,statuses,mission.status);
    const situationAfter=situationAt(next?.at||null,current.stateVersionAfter,statuses,mission.status);
    const recovery=buildRecoverySignal(current,next,transitions,exceptions);
    out.push(Object.freeze({
      sequence:i+1,
      situation:situationBefore,
      intent:current.intent,
      alignment:{contextVersion:current.contextVersion,contextHash:current.contextHash},
      action:{code:current.action,executorId:current.executorId},
      execution:{status:current.executionStatus,authorization:current.authorization},
      result:{stateVersionBefore:current.stateVersionBefore,stateVersionAfter:current.stateVersionAfter,situation:situationAfter},
      evidence:current.evidence,
      outcome:{code:current.outcome,confidence:current.confidence},
      recovery,
      nextSituation:next?next.situation||null:null,
      source:{decisionId:current.decisionId,eventId:current.eventId,at:current.at}
    }));
  }
  return Object.freeze(out);
}

function buildRecoverySignal(current,next,transitions,exceptions){
  const adverse=['WORSENED','BLOCKED','UNKNOWN'].includes(current.outcome);
  if(!adverse)return Object.freeze({required:false,observed:false,reason:'NO_ADVERSE_OUTCOME'});
  const nextTransition=(transitions||[]).find(t=>Date.parse(t.at||0)>Date.parse(current.at||0));
  const nextException=(exceptions||[]).find(e=>Date.parse(e.at||0)>Date.parse(current.at||0));
  if(nextTransition && nextTransition.toStatus!==nextTransition.fromStatus)return Object.freeze({required:true,observed:true,source:'canonical_transition_signal',action:nextTransition.action,toStatus:nextTransition.toStatus,at:nextTransition.at});
  if(nextException && String(nextException.status).toLowerCase()==='resolved')return Object.freeze({required:true,observed:true,source:'canonical_exception_resolution',type:nextException.type,status:nextException.status,at:nextException.at});
  if(next)return Object.freeze({required:true,observed:true,source:'next_agent_decision_signal',action:next.action,outcome:next.outcome,at:next.at});
  return Object.freeze({required:true,observed:false,source:'none',reason:'NO_RECOVERY_EVIDENCE'});
}

function situationAt(at,stateVersion,statuses,fallback){
  const target=at?Date.parse(at):Infinity;
  let candidate=null;
  for(const x of statuses||[]){if(Date.parse(x.at||0)<=target)candidate=x;else break;}
  return Object.freeze({status:candidate?.status||String(fallback||''),stateVersion:Number(stateVersion||0)||null,at:candidate?.at||null,source:candidate?'canonical_status_history':'canonical_mission'});
}

function buildTimeline({statuses,transitions,outcomes,evidence,exceptions,limit}){
  const items=[];
  for(const x of statuses)items.push({kind:'STATUS',at:x.at,status:x.status,source:'canonical_status_history',id:x.id});
  for(const x of transitions)items.push({kind:'TRANSITION',at:x.at,action:x.action,fromStatus:x.fromStatus,toStatus:x.toStatus,outcome:x.outcome,source:'canonical_event_ledger',id:x.id});
  for(const x of outcomes)items.push({kind:'AGENT_OUTCOME',at:x.at,action:x.action,outcome:x.outcome,confidence:x.confidence,decisionId:x.decisionId,source:'agent_outcome_ledger',id:x.id});
  for(const x of evidence)items.push({kind:'EVIDENCE',at:x.at,type:x.type,code:x.code,source:'canonical_evidence',id:x.id});
  for(const x of exceptions)items.push({kind:'EXCEPTION',at:x.at,type:x.type,status:x.status,resolvedAt:x.resolvedAt,source:'canonical_exception',id:x.id});
  items.sort((a,b)=>Date.parse(a.at||0)-Date.parse(b.at||0)||Number(a.id||0)-Number(b.id||0));
  return Object.freeze(items.slice(-limit).reverse().map(Object.freeze));
}

function parseJson(value,fallback){try{const parsed=JSON.parse(String(value||''));return parsed&&typeof parsed==='object'?parsed:fallback;}catch{return fallback;}}
