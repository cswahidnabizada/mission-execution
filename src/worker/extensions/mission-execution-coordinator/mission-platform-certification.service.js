/**
 * ON Mission 15.0 — Unified Mission Platform Certification.
 * Read-only composition surface. It does not own mission truth, planning,
 * assignment, authorization, execution, provider truth, recovery, outcome,
 * continuity or learning.
 *
 * 15.0 unifies the common contract needed for the reference mission and the
 * future 15.1+ / 16.x / 17.x / 18.x / 19.x / 20.x expansion path. Future
 * capability is expressed as readiness, never as an unproven claim.
 */
import {canonicalAll,canonicalFirst} from '../../core/canonical-db.js';
import {certifyMissionJourney} from './mission-certification.service.js';
import {certifyMissionRuntimeRecovery} from './mission-recovery-certification.service.js';

export const MISSION_PLATFORM_CERTIFICATION_VERSION='15.1.0';
export const EXECUTOR_TYPES=Object.freeze(['human','executor','device','robot','vehicle','drone','provider']);
export const PLATFORM_ROADMAP=Object.freeze([
  Object.freeze({phase:'13.x',name:'Canonical Execution Architecture',status:'COMPLETE'}),
  Object.freeze({phase:'14.0',name:'End-to-End Mission Operating Loop',status:'COMPLETE'}),
  Object.freeze({phase:'14.2-14.5',name:'Runtime / Germany + Logistics Certification',status:'COMPLETE'}),
  Object.freeze({phase:'14.6',name:'Adversarial Runtime',status:'COMPLETE'}),
  Object.freeze({phase:'14.7',name:'Executor + Provider Convergence',status:'COMPLETE'}),
  Object.freeze({phase:'14.8',name:'Provider + Effect Reconciliation',status:'COMPLETE'}),
  Object.freeze({phase:'14.9',name:'Runtime Recovery Certification',status:'COMPLETE'}),
  Object.freeze({phase:'15.0',name:'Real End-to-End Mission',status:'CURRENT'}),
  Object.freeze({phase:'15.1+',name:'Real Executor Polymorphism',status:'READY_AFTER_REFERENCE_PROOF'}),
  Object.freeze({phase:'16.x',name:'Second-Sector Certification',status:'READY_AFTER_REFERENCE_PROOF'}),
  Object.freeze({phase:'17.x',name:'Country Generalization',status:'READY_AFTER_SECOND_SECTOR'}),
  Object.freeze({phase:'18.x',name:'Multi-sector / Multi-country Certification',status:'READY_AFTER_COUNTRY_PROOF'}),
  Object.freeze({phase:'19.x',name:'Controlled Autonomy',status:'GOVERNED_READY_ONLY'}),
  Object.freeze({phase:'20.x',name:'Adaptive Mission Execution Platform',status:'FUTURE'}),
]);

export async function certifyMissionPlatform(env,{companyId,missionId}={}){
  const cid=Number(companyId||0)||0,mid=Number(missionId||0)||0;
  if(!cid||!mid)throw fail('MISSION_PLATFORM_CERTIFICATION_CONTEXT_REQUIRED',400);
  const mission=await canonicalFirst(env,`SELECT id,company_id,reference,status,country_code,sector_code,objective,mission_context_json,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1`,[mid,cid],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const journey=await certifyMissionJourney(env,{companyId:cid,missionId:mid,profile:'GERMANY_LOGISTICS_RUNTIME'});
  const attempt=await canonicalFirst(env,`SELECT attempt_id,assignment_id,assignment_version,executor_id,action_code,status,verification_status,recovery_state,started_at,completed_at,effect_hash,state_token_before,state_token_after,observed_effect_json FROM agent_execution_attempts WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`,[cid,mid],'agent_execution_attempt_store');
  const assignment=await canonicalFirst(env,`SELECT id,assignment_type,assignee_type,assignee_id,assignee_company_id,status,version,assigned_at,updated_at FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`,[cid,mid],'mission_assignment_authority');
  const subject=assignment?await canonicalFirst(env,`SELECT id,subject_type,subject_key,display_name,status,capability_codes_json,last_observed_at,updated_at FROM mission_assignment_subjects WHERE company_id=? AND subject_type=? AND id=? LIMIT 1`,[cid,String(assignment.assignee_type||''),Number(assignment.assignee_id||0)],'mission_assignment_subjects'):null;
  const recovery=attempt?await certifyMissionRuntimeRecovery(env,{attemptId:String(attempt.attempt_id),companyId:cid}):null;
  const external=attempt?await canonicalFirst(env,`SELECT execution_mode,provider_code,provider_operation_id,status FROM mission_execution_intents WHERE company_id=? AND mission_id=? AND attempt_id=? LIMIT 1`,[cid,mid,String(attempt.attempt_id)],'execution_intent_authority'):null;
  const checks=[]; const add=(id,status,reason,evidence={})=>checks.push({id,status,reason,evidence});
  const terminal=['Completed','Cancelled','Canceled'].includes(String(mission.status||''));
  add('REFERENCE_MISSION_SCOPE',String(mission.country_code||'').toUpperCase()==='DE'&&String(mission.sector_code||'').toLowerCase()==='logistics'?'PASS':'BLOCKED','15.0 reference mission is certified against Germany + logistics.',{countryCode:mission.country_code||null,sectorCode:mission.sector_code||null});
  add('REFERENCE_JOURNEY',journey.status==='PASS'?'PASS':journey.status,'Canonical journey certification is observed but cannot manufacture real runtime evidence.',{status:journey.status,passCount:journey.passCount,checkCount:journey.checkCount});
  add('EXECUTOR_CONTRACT',assignment&&EXECUTOR_TYPES.includes(String(assignment.assignee_type||'').toLowerCase())&&subject&&String(subject.status)==='verified'?'PASS':'BLOCKED','Execution subject must be canonical, typed and currently verified.',{assignmentId:assignment?.id||null,assigneeType:assignment?.assignee_type||null,subjectStatus:subject?.status||null});
  const effect=Boolean(String(external?.status||'')==='CANONICAL_EFFECT_COMMITTED'&&attempt?.effect_hash&&attempt?.state_token_after&&parse(attempt?.observed_effect_json));
  add('EFFECT_PROOF',effect?'PASS':'UNKNOWN','Real effect requires persisted canonical effect evidence.',{effectHash:attempt?.effect_hash||null,stateTokenAfter:attempt?.state_token_after||null});
  add('RECOVERY_BOUNDARY',!recovery||['NOT_APPLICABLE','RECOVERY_NOT_REQUIRED','REASSESS_REQUIRED','REPLAN_REAUTHORIZE_REQUIRED','PROVIDER_RECONCILIATION_REQUIRED','RECOVERY_REQUIRED'].includes(String(recovery.decision))?'PASS':'BLOCKED','Recovery remains fail-closed and never dispatches automatically.',{decision:recovery?.decision||null,automaticRetry:recovery?.automaticRetry??false,dispatchAllowed:recovery?.dispatchAllowed??false});
  const verifiedOutcome=journey.checks?.some(x=>x.phase==='RUNTIME_OUTCOME'&&x.status==='PASS');
  add('OUTCOME_PROOF',verifiedOutcome?'PASS':'BLOCKED','Reference mission requires a verified canonical outcome.',{verified:verifiedOutcome});
  const nextReady=journey.checks?.some(x=>x.phase==='RUNTIME_NEXT_SITUATION'&&x.status==='PASS');
  add('NEXT_SITUATION_PROOF',nextReady?'PASS':terminal?'PASS':'BLOCKED','Reference mission requires continuity into a next situation or explicit terminal condition.',{nextSituationReady:nextReady,terminal});
  add('LEARNING_BOUNDARY','PASS','Learning remains derived-only and cannot mutate truth or grant authorization.',{authoritative:false});
  add('AUTONOMY_BOUNDARY','PASS','Controlled autonomy is prepared as a governed capability, not enabled by certification.',{enabled:false,requiresRealOutcomeProof:true,requiresAuthorization:true});
  const roadmap=PLATFORM_ROADMAP.map(x=>({...x}));
  const rank={BLOCKED:0,UNKNOWN:1,PARTIAL:2,PASS:3};
  const worst=checks.reduce((m,c)=>Math.min(m,rank[c.status]),3);
  const status=worst===0?'BLOCKED':worst===1?'UNKNOWN':worst===2?'PARTIAL':'PASS';
  return Object.freeze({version:MISSION_PLATFORM_CERTIFICATION_VERSION,status,missionId:mid,companyId:cid,referenceMission:{countryCode:mission.country_code||null,sectorCode:mission.sector_code||null},journey,executor:{types:EXECUTOR_TYPES,assignment,subject},recovery,provider:{external:Boolean(String(external?.execution_mode||'INTERNAL')!=='INTERNAL'),code:external?.provider_code||null,operationId:external?.provider_operation_id||null,status:external?.status||null},checks,roadmap,architecture:{oneExecutionCoordinator:true,canonicalTruthPreserved:true,canonicalAssignmentPreserved:true,canonicalRecoveryPreserved:true,noNewAuthority:true,noNewMigration:true,unknownIsNotSuccess:true,learningNonAuthoritative:true,autonomyDisabled:true}});
}
function parse(v){try{return JSON.parse(String(v??'{}'))||null}catch{return null}}
function fail(code,status=409){return Object.assign(new Error(code),{code,status})}
