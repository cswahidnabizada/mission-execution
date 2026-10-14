export const MISSION_ASSIGNMENT_CAPABILITY_VERSION='13.4.0';
export const MISSION_ASSIGNMENT_DECISION_TYPES=Object.freeze(['ASSIGN','REASSIGN','SHARE','WAIT','ESCALATE']);
export const MISSION_ASSIGNMENT_SUBJECT_TYPES=Object.freeze(['driver','executor','device','robot']);

export function buildMissionAssignmentDecision({missionId,decisionType,target=null,score=null,confidence=null,reasons=[],constraints=[],contextHash=null}={}){
  return Object.freeze({
    version:MISSION_ASSIGNMENT_CAPABILITY_VERSION,
    missionId:Number(missionId||0)||null,
    decisionType:String(decisionType||'ESCALATE'),
    target:target?Object.freeze({type:String(target.type||''),id:Number(target.id||0)||null,name:target.name||null}):null,
    score:Number.isFinite(Number(score))?Number(score):null,
    confidence:Number.isFinite(Number(confidence))?Number(confidence):0,
    reasons:Object.freeze(Array.isArray(reasons)?reasons.slice(0,20):[]),
    constraints:Object.freeze(Array.isArray(constraints)?constraints.slice(0,20):[]),
    contextHash:contextHash?String(contextHash):null,
    invariant:Object.freeze({
      canonicalAuthority:'mission_assignment_authority',
      oneActiveExecutionAssignment:true,
      noAuthorityTransfer:true,
      recommendationIsNonAuthoritative:true,
      unknownNeverMeansEligible:true
    })
  });
}

export function validateMissionAssignmentDecision(decision){
  const failures=[];
  if(!decision?.invariant?.canonicalAuthority)failures.push('assignment_authority_missing');
  if(!decision?.invariant?.oneActiveExecutionAssignment)failures.push('assignment_cardinality_missing');
  if(!decision?.invariant?.noAuthorityTransfer)failures.push('assignment_authority_transfer');
  if(!decision?.invariant?.recommendationIsNonAuthoritative)failures.push('assignment_recommendation_is_authoritative');
  if(!decision?.invariant?.unknownNeverMeansEligible)failures.push('unknown_candidate_treated_as_eligible');
  if(!decision?.missionId)failures.push('mission_id_missing');
  if(!MISSION_ASSIGNMENT_DECISION_TYPES.includes(decision?.decisionType))failures.push('invalid_decision_type');
  return [...new Set(failures)];
}
