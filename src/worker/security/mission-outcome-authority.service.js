import crypto from 'node:crypto';
import {canonicalAll,canonicalFirst} from '../core/canonical-db.js';
import {requireCapabilityOperation} from './capability-resource-contract.service.js';
import {recordMissionNextSituation,MISSION_CONTINUITY_AUTHORITY_VERSION} from './mission-continuity-authority.service.js';

export const MISSION_OUTCOME_AUTHORITY_VERSION='13.6.0';
export const MISSION_OUTCOME_CODES=Object.freeze(['ACHIEVED','PARTIALLY_ACHIEVED','NOT_ACHIEVED','BLOCKED','WAITING','UNKNOWN','CANCELLED']);

const parse=(v,f={})=>{try{const x=JSON.parse(String(v??''));return x??f}catch{return f}};
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const fail=(code,status=409,extra={})=>Object.assign(new Error(code),{code,status,...extra});

/**
 * Canonical mission-outcome authority.
 * It assesses whether the mission objective was actually achieved from canonical
 * mission truth plus assignment, execution, verification, evidence and recovery.
 * It never mutates mission truth and never authorizes execution.
 */
export async function assessMissionOutcome(env,{companyId,missionId,attemptId=null,force=false}={}){
  const company=Number(companyId||0),missionIdN=Number(missionId||0);
  if(!company||!missionIdN)throw fail('MISSION_OUTCOME_CONTEXT_REQUIRED',400);
  await requireCapabilityOperation(env,{capabilityCode:'outcome',command:'assess_mission_outcome',riskClass:'medium',tenantScope:'tenant'});

  const mission=await canonicalFirst(env,`SELECT id,company_id,status,state_version,updated_at,objective,country_code,sector_code,lifecycle_definition_id FROM missions WHERE id=? AND company_id=? LIMIT 1`,[missionIdN,company],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const assignment=await canonicalFirst(env,`SELECT id,assignment_type,assignee_type,assignee_id,status,version,assigned_at,updated_at FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`,[company,missionIdN],'mission_assignment_authority');
  const attempt=attemptId
    ? await canonicalFirst(env,`SELECT * FROM agent_execution_attempts WHERE company_id=? AND mission_id=? AND attempt_id=? LIMIT 1`,[company,missionIdN,String(attemptId)],'agent_execution_attempt_store')
    : await canonicalFirst(env,`SELECT * FROM agent_execution_attempts WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`,[company,missionIdN],'agent_execution_attempt_store');
  const intent=attempt?.execution_intent_id?await canonicalFirst(env,`SELECT * FROM mission_execution_intents WHERE intent_id=? LIMIT 1`,[String(attempt.execution_intent_id)],'execution_intent_authority'):null;
  const recovery=attempt?.attempt_id?(await canonicalAll(env,`SELECT event_type,recovery_state,strategy,evidence_json,created_at FROM agent_execution_recovery_events WHERE company_id=? AND mission_id=? AND attempt_id=? ORDER BY id DESC LIMIT 20`,[company,missionIdN,String(attempt.attempt_id)],'agent_execution_recovery_event_store')).map(x=>({eventType:x.event_type,state:x.recovery_state,strategy:x.strategy,evidence:parse(x.evidence_json,{}),at:x.created_at})):[];
  const evidence=(await canonicalAll(env,`SELECT id,evidence_type,event_code,actor_type,actor_id,metadata_json,created_at FROM mission_evidence_events WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 100`,[company,missionIdN],'mission_evidence_events')).map(x=>({id:Number(x.id),type:x.evidence_type,code:x.event_code,actorType:x.actor_type,actorId:Number(x.actor_id||0)||null,metadata:parse(x.metadata_json,{}),at:x.created_at}));
  const exceptions=(await canonicalAll(env,`SELECT id,exception_type,status,resolved_at,created_at FROM mission_exceptions WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 50`,[company,missionIdN],'mission_exception_authority')).map(x=>({id:Number(x.id),type:x.exception_type,status:x.status,resolvedAt:x.resolved_at,at:x.created_at}));
  const unresolvedRecovery=recovery.some(x=>['RECOVERY_REQUIRED','ESCALATED'].includes(String(x.eventType||''))||['REASSESS','RETRY_CANDIDATE','ESCALATE_HUMAN'].includes(String(x.state||'')));
  const openCritical=exceptions.some(x=>!['resolved','closed','RESOLVED','CLOSED'].includes(String(x.status||'')) && /critical/i.test(String(x.type||'')));
  const intentVerification=parse(intent?.verification_json,{});
  const verificationStatus=['VERIFIED','FAILED','UNKNOWN'].includes(String(attempt?.verification_status||''))?String(attempt.verification_status).toUpperCase():(intentVerification.canonicalVerified===true?'VERIFIED':'UNKNOWN');
  const canonicalVerified=verificationStatus==='VERIFIED'||parse(intent?.verification_json,{}).canonicalVerified===true||String(intent?.status||'')==='CANONICAL_EFFECT_COMMITTED';
  const providerVerified=parse(intent?.verification_json,{}).providerVerified===true;
  const terminal=['Completed','Cancelled','Canceled'].includes(String(mission.status||''));
  const objective=clean(mission.objective,2000);
  const objectiveHash=await sha256(objective||`mission:${missionIdN}`);
  const evidenceRefs=evidence.slice(0,24);
  const reasons=[];
  let outcome='UNKNOWN',confidence='LOW';

  if(['Cancelled','Canceled'].includes(String(mission.status||''))){outcome='CANCELLED';confidence='HIGH';reasons.push('Canonical mission status is terminal cancellation.');}
  else if(unresolvedRecovery){outcome='BLOCKED';confidence='HIGH';reasons.push('Execution recovery remains unresolved; objective achievement cannot be asserted.');}
  else if(openCritical){outcome='BLOCKED';confidence='HIGH';reasons.push('Open critical exception prevents safe objective closure.');}
  else if(String(mission.status||'')==='Completed'){
    if(canonicalVerified || evidenceRefs.length>0){outcome='ACHIEVED';confidence=canonicalVerified&&evidenceRefs.length?'HIGH':'MEDIUM';reasons.push('Canonical mission is terminal and supporting execution/evidence exists.');}
    else {outcome='UNKNOWN';confidence='LOW';reasons.push('Terminal mission lacks sufficient objective evidence.');}
  } else if(canonicalVerified){outcome='PARTIALLY_ACHIEVED';confidence=providerVerified?'HIGH':'MEDIUM';reasons.push('The latest intended effect is verified, but the mission objective is not yet terminal.');}
  else if(['Pending','Created'].includes(String(mission.status||''))){outcome='WAITING';confidence='MEDIUM';reasons.push('Mission has not reached an executable/terminal objective state.');}
  else if(attempt?.status==='FAILED'){outcome='NOT_ACHIEVED';confidence='MEDIUM';reasons.push('Latest execution attempt failed without verified effect.');}
  else reasons.push('Objective achievement cannot be proven from current canonical evidence.');

  const executionSummary={attemptId:attempt?.attempt_id||null,status:attempt?.status||null,verificationStatus,canonicalVerified,providerVerified,actionCode:attempt?.action_code||null,stateTokenBefore:attempt?.state_token_before||null,stateTokenAfter:attempt?.state_token_after||null,effectHash:attempt?.effect_hash||null};
  const recoverySummary={required:unresolvedRecovery,latest:recovery[0]||null,count:recovery.length};
  const evidenceFingerprint=evidenceRefs.map(x=>`${x.id}:${x.type}:${x.code}:${x.at}`).join('|');
  const recoveryFingerprint=recovery.slice(0,5).map(x=>`${x.eventType}:${x.state}:${x.strategy}:${x.at}`).join('|');
  const assessmentKey=await sha256(`${company}:${missionIdN}:${mission.state_version||0}:${mission.status}:${assignment?.id||'none'}:${assignment?.version||0}:${attempt?.attempt_id||'none'}:${attempt?.status||'none'}:${outcome}:${objectiveHash}:${evidenceFingerprint}:${recoveryFingerprint}`);
  const outcomeId=`assessment:${assessmentKey}`;
  const nextSituation=await recordMissionNextSituation(env,{companyId:company,missionId:missionIdN,outcomeId,outcomeCode:outcome,assignment,attempt,unresolvedRecovery,openCritical,terminal,context:{objectiveHash,verificationStatus,canonicalVerified,providerVerified}}).then(x=>x.nextSituation);
  const assessment={outcomeId,assessmentKey,companyId:company,missionId:missionIdN,assignmentId:assignment?.id||null,attemptId:attempt?.attempt_id||null,outcome,confidence,verificationStatus:verificationStatus==='VERIFIED'?'VERIFIED':canonicalVerified?'CANONICAL_ONLY':attempt?'UNKNOWN':'NOT_APPLICABLE',objectiveHash,evidence:evidenceRefs,executionSummary,recoverySummary,nextSituation,decisionReasons:reasons,occurredAt:new Date().toISOString()};

  const existing=await canonicalFirst(env,`SELECT * FROM mission_outcome_assessments WHERE assessment_key=? LIMIT 1`,[assessment.assessmentKey],'mission_outcome_authority');
  if(existing&&!force)return {version:MISSION_OUTCOME_AUTHORITY_VERSION,continuityVersion:MISSION_CONTINUITY_AUTHORITY_VERSION,idempotent:true,assessment:normalize(existing)};
  const row=await env.DB.prepare(`INSERT INTO mission_outcome_assessments(outcome_id,assessment_key,company_id,mission_id,assignment_id,attempt_id,outcome_code,confidence,verification_status,objective_hash,evidence_json,execution_summary_json,recovery_summary_json,next_situation_json,decision_reason_json,source_version,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).bind(assessment.outcomeId,assessment.assessmentKey,assessment.companyId,assessment.missionId,assessment.assignmentId,assessment.attemptId,assessment.outcome,assessment.confidence,assessment.verificationStatus,assessment.objectiveHash,JSON.stringify(assessment.evidence),JSON.stringify(executionSummary),JSON.stringify(recoverySummary),JSON.stringify(nextSituation),JSON.stringify(reasons),MISSION_OUTCOME_AUTHORITY_VERSION,assessment.occurredAt).first();
  return {version:MISSION_OUTCOME_AUTHORITY_VERSION,continuityVersion:MISSION_CONTINUITY_AUTHORITY_VERSION,idempotent:false,assessment:normalize(row),terminal,objectivePresent:Boolean(objective),evidenceCount:evidenceRefs.length};
}

export async function getMissionOutcome(env,{companyId,missionId,limit=20}={}){
  const company=Number(companyId||0),mid=Number(missionId||0);if(!company||!mid)throw fail('MISSION_OUTCOME_CONTEXT_REQUIRED',400);
  const rows=await canonicalAll(env,`SELECT * FROM mission_outcome_assessments WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT ?`,[company,mid,Math.min(100,Math.max(1,Number(limit)||20))],'mission_outcome_authority');
  return rows.map(normalize);
}

function normalize(row){if(!row)return null;return {id:Number(row.id),outcomeId:row.outcome_id,assessmentKey:row.assessment_key,companyId:Number(row.company_id),missionId:Number(row.mission_id),assignmentId:Number(row.assignment_id||0)||null,attemptId:row.attempt_id||null,outcome:row.outcome_code,confidence:row.confidence,verificationStatus:row.verification_status,objectiveHash:row.objective_hash,evidence:parse(row.evidence_json,[]),execution:parse(row.execution_summary_json,{}),recovery:parse(row.recovery_summary_json,{}),nextSituation:parse(row.next_situation_json,{}),reasons:parse(row.decision_reason_json,[]),sourceVersion:row.source_version,occurredAt:row.occurred_at,createdAt:row.created_at};}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
