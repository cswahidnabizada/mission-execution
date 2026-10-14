import {RELEASE_VERSION} from '../../core/release.js';
import {canonicalFirst} from '../../core/canonical-db.js';
import {buildOperationalOutcomeAwareness} from '../../modules/intelligence/operational-outcome-awareness.engine.js';
import {profileUpsertStatements} from './agent-memory.service.js';
import {projectMissionTrajectoryForSemanticMemory} from './agent-semantic-memory.service.js';

export async function appendAgentOutcomeEvent(env,input={}){
  const eventId=String(input.eventId||crypto.randomUUID()).slice(0,120);
  const decisionId=String(input.decisionId||'').trim().slice(0,120);
  if(!decisionId)throw Object.assign(new Error('AGENT_DECISION_ID_REQUIRED'),{status:400});
  const companyId=Number(input.companyId||input.tenantId||0)||null;
  if(!companyId)throw Object.assign(new Error('AGENT_COMPANY_ID_REQUIRED'),{status:400});
  const missionId=Number(input.missionId||0)||null;
  const executorId=Number(input.executorId||0)||null;
  const actionCode=String(input.actionCode||'').trim().slice(0,120);
  if(!actionCode)throw Object.assign(new Error('AGENT_ACTION_CODE_REQUIRED'),{status:400});
  const existing=await canonicalFirst(env,'SELECT event_id,decision_id,event_hash,company_id,mission_id,action_code,context_hash FROM agent_outcome_events WHERE decision_id=? LIMIT 1',[decisionId],'agent_outcome_event_store');
  if(existing){
    if(Number(existing.company_id)!==companyId)throw Object.assign(new Error('AGENT_OUTCOME_TENANT_MISMATCH'),{status:403,code:'AGENT_OUTCOME_TENANT_MISMATCH'});
    if(Number(existing.mission_id||0)!==Number(missionId||0))throw Object.assign(new Error('AGENT_OUTCOME_MISSION_MISMATCH'),{status:409,code:'AGENT_OUTCOME_MISSION_MISMATCH'});
    if(String(existing.action_code)!==actionCode)throw Object.assign(new Error('AGENT_OUTCOME_ACTION_MISMATCH'),{status:409,code:'AGENT_OUTCOME_ACTION_MISMATCH'});
    if(String(input.contextHash||'') && String(existing.context_hash||'')!==String(input.contextHash||''))throw Object.assign(new Error('AGENT_OUTCOME_CONTEXT_HASH_MISMATCH'),{status:409,code:'AGENT_OUTCOME_CONTEXT_HASH_MISMATCH'});
    return {created:false,idempotent:true,eventId:existing.event_id,decisionId:existing.decision_id,eventHash:existing.event_hash};
  }
  const decision=await canonicalFirst(env,'SELECT decision_id,company_id,mission_id,action_code,context_hash FROM agent_decision_events WHERE decision_id=? LIMIT 1',[decisionId],'agent_decision_event_store');
  if(!decision)throw Object.assign(new Error('AGENT_DECISION_NOT_FOUND'),{status:409,code:'AGENT_DECISION_NOT_FOUND'});
  if(Number(decision.company_id)!==companyId)throw Object.assign(new Error('AGENT_DECISION_TENANT_MISMATCH'),{status:403,code:'AGENT_DECISION_TENANT_MISMATCH'});
  if(Number(decision.mission_id||0)!==Number(missionId||0))throw Object.assign(new Error('AGENT_DECISION_MISSION_MISMATCH'),{status:409,code:'AGENT_DECISION_MISSION_MISMATCH'});
  if(String(decision.action_code)!==actionCode)throw Object.assign(new Error('AGENT_DECISION_ACTION_MISMATCH'),{status:409,code:'AGENT_DECISION_ACTION_MISMATCH'});
  const suppliedContextHash=String(input.contextHash||'').trim();
  if(!suppliedContextHash)throw Object.assign(new Error('AGENT_CONTEXT_HASH_REQUIRED'),{status:400,code:'AGENT_CONTEXT_HASH_REQUIRED'});
  if(String(decision.context_hash||'')!==suppliedContextHash)throw Object.assign(new Error('AGENT_CONTEXT_HASH_MISMATCH'),{status:409,code:'AGENT_CONTEXT_HASH_MISMATCH'});
  if(Number(executorId||0)>0 && Number(missionId||0)>0){
    const assignment=await canonicalFirst(env,`SELECT id FROM mission_active_assignment_projection WHERE company_id=? AND mission_id=? AND assignment_type='executor' AND assignee_type='executor' AND assignee_id=? AND status='active' LIMIT 1`,[companyId,missionId,Number(executorId)],'canonical_assignment_authority');
    if(!assignment)throw Object.assign(new Error('AGENT_EXECUTOR_SCOPE_MISMATCH'),{status:403,code:'AGENT_EXECUTOR_SCOPE_MISMATCH'});
  }
  const previous=await canonicalFirst(env,'SELECT event_hash FROM agent_outcome_events WHERE company_id=? ORDER BY id DESC LIMIT 1',[companyId],'agent_outcome_event_store');
  const before=Number(input.stateVersionBefore||0)||null;
  const after=Number(input.stateVersionAfter||0)||null;
  const outcome=String(input.outcomeCode||'UNKNOWN').toUpperCase();
  const confidence=String(input.outcomeConfidence||'LOW').toUpperCase();
  const executionStatus=String(input.executionStatus||'UNKNOWN').toUpperCase();
  const event={
    eventId,decisionId,companyId,missionId,executorId,
    actorType:['agent','human','system'].includes(String(input.actorType||'agent'))?String(input.actorType||'agent'):'agent',
    agentId:String(input.agentId||'').slice(0,120)||null,actionCode,
    intent:object(input.intent),contextVersion:String(input.contextVersion||'1.0').slice(0,32),contextHash:String(input.contextHash||'').slice(0,128),
    plan:object(input.plan),authorization:object(input.authorization),executionStatus,
    outcomeCode:['RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN'].includes(outcome)?outcome:'UNKNOWN',
    outcomeConfidence:['LOW','MEDIUM','HIGH'].includes(confidence)?confidence:'LOW',evidence:Array.isArray(input.evidence)?input.evidence.slice(0,32):[],
    stateVersionBefore:before,stateVersionAfter:after,modelProvider:String(input.modelProvider||'').slice(0,80)||null,
    modelId:String(input.modelId||'').slice(0,120)||null,modelVersion:String(input.modelVersion||'').slice(0,80)||null,
    policyVersion:String(input.policyVersion||RELEASE_VERSION).slice(0,80),recalibrationVersion:String(input.recalibrationVersion||'BASELINE').slice(0,80),
    occurredAt:String(input.occurredAt||new Date().toISOString()),metadata:object(input.metadata)
  };
  event.previousEventHash=previous?.event_hash||null;
  event.eventHash=await sha256(stableStringify(event));
  const outcomeInsert=env.DB.prepare(`INSERT INTO agent_outcome_events
    (event_id,decision_id,company_id,mission_id,executor_id,actor_type,agent_id,action_code,intent_json,context_version,context_hash,plan_json,authorization_json,execution_status,outcome_code,outcome_confidence,evidence_json,state_version_before,state_version_after,model_provider,model_id,model_version,policy_version,recalibration_version,occurred_at,previous_event_hash,event_hash,metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      event.eventId,event.decisionId,event.companyId,event.missionId,event.executorId,event.actorType,event.agentId,event.actionCode,
      JSON.stringify(event.intent),event.contextVersion,event.contextHash,JSON.stringify(event.plan),JSON.stringify(event.authorization),event.executionStatus,
      event.outcomeCode,event.outcomeConfidence,JSON.stringify(event.evidence),event.stateVersionBefore,event.stateVersionAfter,event.modelProvider,event.modelId,event.modelVersion,
      event.policyVersion,event.recalibrationVersion,event.occurredAt,event.previousEventHash,event.eventHash,JSON.stringify(event.metadata)
    );
  const profileStatements=profileUpsertStatements(env,event);
  await env.DB.batch([outcomeInsert,...profileStatements]);
  let semanticProjection=null;
  if(Number(event.missionId||0)>0){
    try{semanticProjection=await projectMissionTrajectoryForSemanticMemory(env,{companyId:event.companyId,missionId:event.missionId});}
    catch(e){semanticProjection={status:'DEGRADED',code:e?.code||e?.message||'AGENT_SEMANTIC_PROJECTION_FAILED'};}
  }
  return {created:true,idempotent:false,eventId:event.eventId,decisionId:event.decisionId,eventHash:event.eventHash,profilesUpdated:true,semanticProjection};
}

export async function appendOutcomeFromCanonicalExecution(env,{request,session,prepared,actionResult,missionId,decisionId,contextHash,beforeMission=null,afterMission=null,agentMeta={}}={}){
  if(!decisionId)return null;
  const mission=missionId?await canonicalFirst(env,'SELECT company_id,state_version FROM missions WHERE id=? LIMIT 1',[Number(missionId)],'mission_authority'):null;
  const execution=actionResult||{};
  const success=Boolean(execution.executed&&execution.success!==false);
  const status=success?'EXECUTED':execution.stale?'BLOCKED':'FAILED';
  const derived=deriveAgentOutcome({before:beforeMission,current:afterMission,actionAlignment:{alignment:{currentAction:{code:prepared?.actionCode||prepared?.action?.code||''}}},candidate:{missionId}});
  const outcome=execution.stale?'BLOCKED':derived.outcome|| (success?'PROGRESSED':'UNKNOWN');
  const evidence=[...(Array.isArray(execution.evidence)?execution.evidence:[]),...(Array.isArray(derived.evidence)?derived.evidence:[])].slice(0,32);
  return appendAgentOutcomeEvent(env,{decisionId,companyId:Number(mission?.company_id||session?.tenantId||0),missionId:Number(missionId||0)||null,executorId:Number(session?.executorId||0)||null,actorType:'agent',agentId:agentMeta.agentId||'on-mission-agent',actionCode:prepared?.actionCode||prepared?.action?.code||'',intent:agentMeta.intent,contextVersion:agentMeta.contextVersion,contextHash,plan:agentMeta.plan,authorization:execution.authorization||{},executionStatus:status,outcomeCode:outcome,outcomeConfidence:derived.confidence|| (evidence.length?'HIGH':'MEDIUM'),evidence,stateVersionBefore:Number(beforeMission?.state_version||prepared?.state?.currentToken?.replace?.(/^v:/,'')||0)||null,stateVersionAfter:Number(afterMission?.state_version||0)||null,modelProvider:agentMeta.modelProvider,modelId:agentMeta.modelId,modelVersion:agentMeta.modelVersion,policyVersion:RELEASE_VERSION,recalibrationVersion:agentMeta.recalibrationVersion||'BASELINE',metadata:{requestId:request?.headers?.get?.('X-Request-ID')||null,responseStatus:execution.status||null,derivedOutcomeReason:derived.reasonCode||null}});
}

export function deriveAgentOutcome(input){return buildOperationalOutcomeAwareness(input);}

function object(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
function stableStringify(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
