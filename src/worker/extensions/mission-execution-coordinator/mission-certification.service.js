/**
 * ON Mission 14.1 — Mission Journey Certification.
 *
 * Read-only production certification surface. It observes canonical mission,
 * planning, assignment, execution, effect, verification, recovery, outcome,
 * learning and continuity records without becoming an authority for any of them.
 */
import {canonicalAll,canonicalFirst} from '../../core/canonical-db.js';

export const MISSION_CERTIFICATION_VERSION='15.1.0';
export const MISSION_CERTIFICATION_PROFILES=Object.freeze(['JOURNEY','GERMANY_LOGISTICS','GERMANY_LOGISTICS_RUNTIME']);
export const CANONICAL_MISSION_JOURNEY=Object.freeze([
  'OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN',
  'EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT_SITUATION'
]);

export async function certifyMissionJourney(env,{companyId,missionId,profile='JOURNEY'}={}){
  const tenant=Number(companyId||0)||0;
  const mid=Number(missionId||0)||0;
  if(!tenant||!mid)throw fail('MISSION_CERTIFICATION_CONTEXT_REQUIRED',400);
  const requestedProfile=String(profile||'JOURNEY').toUpperCase();
  if(!MISSION_CERTIFICATION_PROFILES.includes(requestedProfile))throw fail('MISSION_CERTIFICATION_PROFILE_INVALID',400);

  const mission=await canonicalFirst(env,`SELECT id,company_id,reference,status,state_version,updated_at,country_code,sector_code,capability_code,objective,responsibility_mode,mission_context_json,product_definition_id,lifecycle_definition_id,lifecycle_state_code FROM missions WHERE id=? AND company_id=? LIMIT 1`,[mid,tenant],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);

  const [plan,evaluation,assignment,attempt,intent,evidence,outcome,nextSituation,learning,recovery]=await Promise.all([
    canonicalFirst(env,`SELECT id,plan_key,company_id,mission_id,context_hash,state_token,plan_hash,status,plan_json,source_version,expires_at,created_at,updated_at FROM mission_plans WHERE company_id=? AND mission_id=? AND status IN ('PROPOSED','ACCEPTED') ORDER BY CASE WHEN status='ACCEPTED' THEN 0 ELSE 1 END,id DESC LIMIT 1`,[tenant,mid],'mission_planning_authority'),
    canonicalFirst(env,`SELECT e.id,e.plan_id,e.plan_hash,e.context_hash,e.state_token,e.status,e.evaluation_hash,e.findings_json,e.evidence_json,e.decision_json,e.source_version,e.expires_at,e.created_at FROM mission_plan_evaluations e JOIN mission_plans p ON p.id=e.plan_id AND p.company_id=e.company_id AND p.mission_id=e.mission_id WHERE e.company_id=? AND e.mission_id=? ORDER BY e.id DESC LIMIT 1`,[tenant,mid],'mission_plan_evaluation_authority'),
    canonicalFirst(env,`SELECT id,assignment_type,assignee_type,assignee_id,assignee_company_id,status,version,assigned_at,updated_at,source_type,source_id FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`,[tenant,mid],'mission_assignment_authority'),
    canonicalFirst(env,`SELECT id,attempt_id,decision_id,company_id,mission_id,executor_id,action_code,action_version,authorization_json,status,verification_status,recovery_state,context_hash,state_token_before,state_token_after,observed_effect_json,started_at,completed_at,assignment_id,assignment_version,runtime_lease_id,runtime_lease_expires_at,effect_hash,created_at,updated_at FROM agent_execution_attempts WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`,[tenant,mid],'agent_execution_attempt_store'),
    canonicalFirst(env,`SELECT intent_id,attempt_id,company_id,mission_id,action_code,action_version,idempotency_key,state_token_before,execution_mode,status,provider_code,provider_operation_id,verification_json,recovery_json,created_at,updated_at FROM mission_execution_intents WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`,[tenant,mid],'execution_intent_authority'),
    canonicalAll(env,`SELECT id,evidence_type,event_code,actor_type,actor_id,file_id,metadata_json,created_at FROM mission_evidence_events WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 50`,[tenant,mid],'mission_evidence_authority'),
    canonicalFirst(env,`SELECT outcome_id,assignment_id,attempt_id,outcome_code,confidence,verification_status,objective_hash,evidence_json,execution_summary_json,recovery_summary_json,next_situation_json,decision_reason_json,source_version,occurred_at,created_at FROM mission_outcome_assessments WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`,[tenant,mid],'mission_outcome_authority'),
    canonicalFirst(env,`SELECT continuity_id,continuity_key,sequence_no,source_outcome_id,mission_state_version,outcome_code,state,reason_code,action_code,assignment_id,assignment_version,attempt_id,context_hash,context_json,occurred_at,created_at FROM mission_next_situations WHERE company_id=? AND mission_id=? ORDER BY sequence_no DESC,id DESC LIMIT 1`,[tenant,mid],'mission_continuity_authority'),
    canonicalFirst(env,`SELECT learning_id,event_id,decision_id,action_code,outcome_code,evidence_quality,prediction_confidence,learning_weight,observation_version,occurred_at,learning_hash FROM agent_learning_observations WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`,[tenant,mid],'agent_learning_authority'),
    canonicalFirst(env,`SELECT event_type,recovery_state,strategy,evidence_json,created_at FROM agent_execution_recovery_events WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`,[tenant,mid],'mission_recovery_authority')
  ]);

  const missionContext=parseJson(mission.mission_context_json);
  const planJson=parseJson(plan?.plan_json);
  const evaluationEvidence=parseJson(evaluation?.evidence_json);
  const evaluationDecision=parseJson(evaluation?.decision_json);
  const authorization=parseJson(attempt?.authorization_json);
  const intentVerification=parseJson(intent?.verification_json);
  const intentRecovery=parseJson(intent?.recovery_json);
  const outcomeEvidence=parseJson(outcome?.evidence_json);
  const recoverySummary=parseJson(outcome?.recovery_summary_json);

  const checks=[];
  const add=(phase,status,reason,evidence={})=>checks.push({phase,status,reason,evidence});
  const pass=(phase,reason,evidence={})=>add(phase,'PASS',reason,evidence);
  const partial=(phase,reason,evidence={})=>add(phase,'PARTIAL',reason,evidence);
  const block=(phase,reason,evidence={})=>add(phase,'BLOCKED',reason,evidence);
  const unknown=(phase,reason,evidence={})=>add(phase,'UNKNOWN',reason,evidence);

  pass('OBSERVE','Canonical tenant-scoped mission truth was found.',{missionId:mid,companyId:tenant,stateVersion:Number(mission.state_version||0)});
  const universalReady=Boolean(String(mission.objective||'').trim()&&String(mission.country_code||'').trim()&&String(mission.sector_code||'').trim()&&missionContext&&typeof missionContext==='object');
  universalReady?pass('UNDERSTAND','Universal mission objective, country, sector and context are present.',{countryCode:mission.country_code,sectorCode:mission.sector_code,contextKeys:Object.keys(missionContext)}):block('UNDERSTAND','Universal mission context is incomplete.',{objective:Boolean(String(mission.objective||'').trim()),countryCode:mission.country_code||null,sectorCode:mission.sector_code||null});

  plan?pass('PLAN','A canonical mission plan exists.',{planId:Number(plan.id),status:plan.status,planHash:plan.plan_hash}):block('PLAN','No canonical mission plan exists.');
  if(evaluation){
    const planAligned=Boolean(plan&&String(evaluation.plan_hash||'')===String(plan.plan_hash||''));
    const stateAligned=Boolean(plan&&String(evaluation.state_token||'')===String(plan.state_token||''));
    const acceptable=String(evaluation.status)==='ACCEPTABLE';
    acceptable&&planAligned&&stateAligned?pass('EVALUATE','The latest evaluation is acceptable and hash/state aligned.',{evaluationId:Number(evaluation.id),status:evaluation.status}):block('EVALUATE','Plan evaluation is missing, stale, or not acceptable.',{evaluationId:Number(evaluation.id),status:evaluation.status,planAligned,stateAligned,findings:parseJson(evaluation.findings_json)});
  }else block('EVALUATE','No canonical plan evaluation exists.');
  String(plan?.status||'')==='ACCEPTED'?pass('ACCEPT','The canonical plan is explicitly accepted.',{planId:Number(plan.id)}):block('ACCEPT','The canonical plan has not been accepted.',{planStatus:plan?.status||null});

  const authAllowed=Boolean(authorization.authorized===true || String(authorization.decision||'').toUpperCase()==='ALLOW');
  attempt&&authAllowed?pass('AUTHORIZE','The execution attempt contains an explicit authorization decision.',{attemptId:attempt.attempt_id,decisionId:attempt.decision_id}):block('AUTHORIZE','No execution attempt with explicit authorization evidence was found.',{attemptId:attempt?.attempt_id||null,authorization:authorization.decision||null});
  const prepared=Boolean(attempt&&['AUTHORIZED','DISPATCHED','EXECUTING','SUCCEEDED','FAILED','UNKNOWN','VERIFYING','VERIFIED','RECOVERY_REQUIRED','RECOVERED'].includes(String(attempt.status||'')));
  prepared?pass('PREPARE','Execution runtime recorded a prepared/authorized attempt boundary.',{attemptId:attempt.attempt_id,status:attempt.status}):block('PREPARE','No prepared execution boundary is recorded.');
  assignment?pass('ASSIGN','A canonical active assignment exists.',{assignmentId:Number(assignment.id),assigneeType:assignment.assignee_type,assigneeId:Number(assignment.assignee_id),version:Number(assignment.version||1)}):block('ASSIGN','No active canonical assignment exists.');
  attempt?pass('EXECUTE','A canonical execution attempt is recorded.',{attemptId:attempt.attempt_id,actionCode:attempt.action_code,status:attempt.status}):block('EXECUTE','No canonical execution attempt is recorded.');

  const effectCommitted=String(intent?.status||'')==='CANONICAL_EFFECT_COMMITTED';
  const observedEffect=parseJson(attempt?.observed_effect_json);
  const effectEvidenceBound=Boolean(effectCommitted&&String(attempt?.effect_hash||'').trim()&&attempt?.state_token_after&&observedEffect&&typeof observedEffect==='object'&&!Array.isArray(observedEffect)&&Object.keys(observedEffect).length);
  effectCommitted?pass('EFFECT','Canonical effect commit is explicitly recorded; command acceptance is not treated as effect.',{intentId:intent.intent_id,providerOperationId:intent.provider_operation_id||null,effectHash:attempt?.effect_hash||null}):unknown('EFFECT','The real-world effect is not canonically committed.',{intentId:intent?.intent_id||null,intentStatus:intent?.status||null,providerVerified:Boolean(intentVerification.providerVerified||intentVerification.verified)});
  effectEvidenceBound?pass('EFFECT_EVIDENCE','Canonical effect commit is bound to persisted observed-effect evidence, hash and post-state token.',{effectHash:attempt.effect_hash,stateTokenAfter:attempt.state_token_after}):effectCommitted?block('EFFECT_EVIDENCE','Canonical effect commit exists without a complete persisted effect-evidence fence.',{effectHash:attempt?.effect_hash||null,stateTokenAfter:attempt?.state_token_after||null}):unknown('EFFECT_EVIDENCE','Effect evidence cannot be certified until the canonical effect is committed.',{intentStatus:intent?.status||null});

  const externalExecution=String(intent?.execution_mode||'INTERNAL')!=='INTERNAL';
  const providerEvidenceBound=!externalExecution || (Boolean(intent?.provider_operation_id)&&Boolean(intentVerification.providerVerified===true||intentVerification.verified===true));
  providerEvidenceBound?pass('PROVIDER_EFFECT_EVIDENCE','External execution has provider operation identity and positive provider verification.',{external:externalExecution,providerCode:intent?.provider_code||null,providerOperationId:intent?.provider_operation_id||null}):externalExecution?unknown('PROVIDER_EFFECT_EVIDENCE','External effect cannot be treated as proven without provider evidence.',{providerCode:intent?.provider_code||null,providerOperationId:intent?.provider_operation_id||null}):pass('PROVIDER_EFFECT_EVIDENCE','Internal execution does not require external provider evidence.');

  const verified=effectEvidenceBound && providerEvidenceBound && (String(attempt?.verification_status||'')==='VERIFIED' || String(outcome?.verification_status||'')==='VERIFIED' || intentVerification.canonicalVerified===true);
  verified?pass('VERIFY','Verification evidence confirms the canonical effect.',{attemptVerification:attempt?.verification_status||null,outcomeVerification:outcome?.verification_status||null}):block('VERIFY','Canonical effect verification is not complete.',{attemptVerification:attempt?.verification_status||null,outcomeVerification:outcome?.verification_status||null,effectEvidenceBound,providerEvidenceBound});
  const outcomeAligned=Boolean(outcome&&(!['VERIFIED','ACHIEVED','SUCCEEDED'].includes(String(outcome.verification_status||'').toUpperCase())||verified));
  outcomeAligned?pass('OUTCOME_EFFECT_ALIGNMENT','Outcome evidence does not outrun canonical effect verification.',{outcomeVerification:outcome?.verification_status||null}):block('OUTCOME_EFFECT_ALIGNMENT','Outcome verification claims success without a certified canonical effect.',{outcomeVerification:outcome?.verification_status||null});

  const recoveryNeeded=['RECOVERY_REQUIRED','EXTERNAL_UNKNOWN'].includes(String(intent?.status||'')) || ['RECOVERY_REQUIRED'].includes(String(attempt?.status||''));
  if(recoveryNeeded){
    const recovered=String(recovery?.recovery_state||'')==='RECOVERED' || String(intent?.status||'')==='RECOVERED' || String(attempt?.status||'')==='RECOVERED' || String(recoverySummary?.status||'')==='RECOVERED';
    recovered?pass('RECOVER','A required recovery path is recorded as recovered.',{recoveryState:recovery?.recovery_state||null}):block('RECOVER','Recovery is required but has not reached a recovered state.',{intentStatus:intent?.status||null,attemptStatus:attempt?.status||null,recoveryState:recovery?.recovery_state||null});
  }else pass('RECOVER','No unresolved recovery requirement is recorded.',{intentStatus:intent?.status||null,attemptStatus:attempt?.status||null});

  outcome?pass('OUTCOME','A canonical mission outcome assessment exists.',{outcomeCode:outcome.outcome_code,verificationStatus:outcome.verification_status}):block('OUTCOME','No canonical mission outcome assessment exists.');
  learning?pass('LEARN','Derived learning evidence exists and remains separate from mission truth.',{learningId:learning.learning_id,outcomeCode:learning.outcome_code,evidenceQuality:learning.evidence_quality}):partial('LEARN','Learning is integrated but no mission-specific observation is currently recorded.',{authority:'agent_learning',truthMutation:false});
  nextSituation&&String(nextSituation.state||'')!=='DEFERRED'?pass('NEXT_SITUATION','A governed next situation exists.',{state:nextSituation.state,actionCode:nextSituation.action_code||null,sequence:Number(nextSituation.sequence_no||0)}):partial('NEXT_SITUATION','No ready next situation is currently recorded.',{state:nextSituation?.state||null});

  if(requestedProfile==='GERMANY_LOGISTICS'){
    const de=String(mission.country_code||'').toUpperCase()==='DE';
    const logistics=String(mission.sector_code||'').toLowerCase()==='logistics';
    const hasObject=await scalar(env,`SELECT 1 AS present FROM mission_objects WHERE company_id=? AND mission_id=? LIMIT 1`,[tenant,mid],'mission_object_authority');
    const stopCount=await scalar(env,`SELECT COUNT(*) AS count FROM mission_stops WHERE company_id=? AND mission_id=?`,[tenant,mid],'mission_stop_authority');
    const evidenceCount=Array.isArray(evidence)?evidence.length:0;
    de&&logistics?pass('GERMANY_LOGISTICS_PROFILE','Mission is Germany + logistics.',{countryCode:mission.country_code,sectorCode:mission.sector_code}):block('GERMANY_LOGISTICS_PROFILE','Gold-standard certification requires country DE and sector logistics.',{countryCode:mission.country_code||null,sectorCode:mission.sector_code||null});
    hasObject?pass('LOGISTICS_OBJECT','At least one governed mission object exists.'):block('LOGISTICS_OBJECT','Gold-standard logistics mission requires a governed mission object.');
    Number(stopCount||0)>=2?pass('LOGISTICS_STOPS','Pickup/delivery operational stops are present.',{stopCount:Number(stopCount)}):block('LOGISTICS_STOPS','Gold-standard logistics mission requires at least two governed stops.',{stopCount:Number(stopCount||0)});
    evidenceCount>0?pass('REAL_WORLD_EVIDENCE','Mission evidence events are recorded.',{evidenceCount}):block('REAL_WORLD_EVIDENCE','Gold-standard certification requires explicit mission evidence.');
    mission.product_definition_id&&mission.lifecycle_definition_id?pass('PRODUCT_LIFECYCLE_CONTRACT','Product and lifecycle definitions are bound to the mission.',{productDefinitionId:Number(mission.product_definition_id),lifecycleDefinitionId:Number(mission.lifecycle_definition_id)}):block('PRODUCT_LIFECYCLE_CONTRACT','Gold-standard mission requires explicit product and lifecycle bindings.');
    const capability=await scalar(env,`SELECT 1 AS present FROM canonical_capability_contracts WHERE capability_code='execution' LIMIT 1`,[],'capability_contract_authority');
    capability?pass('EXECUTION_CAPABILITY_CONTRACT','Canonical execution capability contract is present.'):block('EXECUTION_CAPABILITY_CONTRACT','Canonical execution capability contract is unavailable.');
  }

  if(requestedProfile==='GERMANY_LOGISTICS_RUNTIME'){
    const de=String(mission.country_code||'').toUpperCase()==='DE';
    const logistics=String(mission.sector_code||'').toLowerCase()==='logistics';
    const realAttempt=Boolean(attempt?.attempt_id&&attempt?.started_at);
    const realEffect=Boolean(effectCommitted&&effectEvidenceBound);
    const realVerification=Boolean(verified);
    const realOutcome=Boolean(outcome?.outcome_id&&['VERIFIED','ACHIEVED','SUCCEEDED'].includes(String(outcome?.verification_status||'').toUpperCase()));
    const realNext=Boolean(nextSituation&&String(nextSituation.state||'')!=='DEFERRED');
    const externalProvider=String(intent?.execution_mode||'INTERNAL')!=='INTERNAL';
    de&&logistics?pass('RUNTIME_GERMANY_LOGISTICS','Real-runtime profile is bound to Germany + logistics.',{countryCode:mission.country_code,sectorCode:mission.sector_code}):block('RUNTIME_GERMANY_LOGISTICS','Runtime gold-standard requires DE + logistics.');
    realAttempt?pass('RUNTIME_EXECUTION_ATTEMPT','A timestamped canonical execution attempt exists.',{attemptId:attempt.attempt_id,startedAt:attempt.started_at,completedAt:attempt.completed_at||null}):block('RUNTIME_EXECUTION_ATTEMPT','No real canonical execution attempt is recorded.');
    realEffect?pass('RUNTIME_EFFECT','Canonical effect and persisted effect evidence are both present.',{effectHash:attempt.effect_hash,stateTokenAfter:attempt.state_token_after}):unknown('RUNTIME_EFFECT','Real-world effect is not proven; runtime certification cannot claim success.',{intentStatus:intent?.status||null});
    realVerification?pass('RUNTIME_VERIFICATION','Canonical verification confirms the effect.'):block('RUNTIME_VERIFICATION','Real runtime verification is incomplete.');
    realOutcome?pass('RUNTIME_OUTCOME','Outcome is verified against canonical effect.',{outcomeId:outcome.outcome_id,outcomeCode:outcome.outcome_code}):block('RUNTIME_OUTCOME','Verified runtime outcome is not recorded.');
    realNext?pass('RUNTIME_NEXT_SITUATION','A non-deferred next situation is recorded.'):partial('RUNTIME_NEXT_SITUATION','Runtime mission has no ready next situation yet.',{state:nextSituation?.state||null});
    if(externalProvider) providerEvidenceBound?pass('RUNTIME_PROVIDER','External provider evidence is bound to the runtime effect.',{providerOperationId:intent?.provider_operation_id||null}):unknown('RUNTIME_PROVIDER','External provider effect cannot be certified without provider evidence.');
  }

  const rank={BLOCKED:0,UNKNOWN:1,PARTIAL:2,PASS:3};
  const worst=checks.reduce((acc,c)=>Math.min(acc,rank[c.status]),3);
  const status=worst===0?'BLOCKED':worst===1?'UNKNOWN':worst===2?'PARTIAL':'PASS';
  const passCount=checks.filter(c=>c.status==='PASS').length;
  return Object.freeze({
    version:MISSION_CERTIFICATION_VERSION,
    profile:requestedProfile,
    missionId:mid,
    companyId:tenant,
    status,
    passCount,
    checkCount:checks.length,
    journey:Object.freeze(CANONICAL_MISSION_JOURNEY.map(phase=>checks.find(c=>c.phase===phase)||{phase,status:'UNKNOWN',reason:'No certification observation recorded.'})),
    checks:Object.freeze(checks),
    controls:Object.freeze({tenantScoped:true,readOnly:true,canonicalAuthoritiesPreserved:true,unknownEffectNotSuccess:true,effectEvidenceRequired:true,providerEvidenceRequiredForExternal:true,learningNonAuthoritative:true}),
    summary:Object.freeze({missionStatus:mission.status,countryCode:mission.country_code||null,sectorCode:mission.sector_code||null,latestPlanId:plan?.id?Number(plan.id):null,latestAttemptId:attempt?.attempt_id||null,intentStatus:intent?.status||null,outcomeCode:outcome?.outcome_code||null,nextSituationState:nextSituation?.state||null})
  });
}

async function scalar(env,sql,params,authority){
  const row=await canonicalFirst(env,sql,params,authority);
  if(!row)return null;
  const key=Object.keys(row)[0];
  return row[key];
}
function parseJson(value){try{return JSON.parse(String(value??'{}'))||{};}catch{return {};}}
function fail(code,status=409){return Object.assign(new Error(code),{code,status});}
