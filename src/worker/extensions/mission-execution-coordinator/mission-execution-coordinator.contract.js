export const MISSION_EXECUTION_COORDINATOR_VERSION='15.1.0';
export const MISSION_EXECUTION_COORDINATOR_CONTRACT_GATE_VERSION='14.2.0';
export const MISSION_EXECUTION_PHASES=Object.freeze([
  'OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT_SITUATION'
]);
export const MISSION_EXECUTION_CAPABILITIES=Object.freeze([
  'mission_intake','mission_truth','situation_intelligence','responsibility','readiness','planning','mission_assignment','authorization','execution','provider_integration','verification','recovery','outcome','learning','continuity','communication','resource_governance','platform_control'
]);

export function buildMissionExecutionCoordinatorContract({missionId,status,stateToken,executionMode='GOVERNED',phases=[],outcome=null,attempt=null,intent=null,error=null,recovery=null,contractEnvelope=null}={}){
  const completed=Object.freeze((phases||[]).map((phase,index)=>Object.freeze({
    phase:String(phase.phase||''),
    capability:String(phase.capability||''),
    status:String(phase.status||'PENDING'),
    startedAt:phase.startedAt||null,
    completedAt:phase.completedAt||null,
    index,
    errorCode:phase.errorCode||null
  })));
  const capabilitySet=new Set(MISSION_EXECUTION_CAPABILITIES);
  const invalidCapabilities=completed.filter(x=>x.capability&& !capabilitySet.has(x.capability)).map(x=>x.capability);
  const phaseSet=new Set(MISSION_EXECUTION_PHASES);
  const invalidPhases=completed.filter(x=>x.phase&&!phaseSet.has(x.phase)).map(x=>x.phase);
  return Object.freeze({
    version:MISSION_EXECUTION_COORDINATOR_VERSION,
    missionId:Number(missionId||0)||null,
    status:String(status||'UNKNOWN'),
    stateToken:String(stateToken||''),
    executionMode:String(executionMode||'GOVERNED'),
    phases:completed,
    outcome:outcome||null,
    attempt:attempt||null,
    intent:intent||null,
    recovery:recovery||null,
    error:error||null,
    contractEnvelope:contractEnvelope||null,
    invariant:Object.freeze({
      oneCoordinator:true,
      missionIdPresent:Boolean(Number(missionId||0)),
      stateTokenPresent:Boolean(stateToken),
      validPhases:invalidPhases.length===0,
      validCapabilities:invalidCapabilities.length===0,
      unknownIsNotSuccess:!(String(outcome?.status||'')==='SUCCEEDED'&&String(outcome?.verificationStatus||'')==='UNKNOWN'),
      recoveryExplicit:recovery===null||typeof recovery==='object',
    capabilityResourceContracted:Boolean(contractEnvelope?.execution?.invariant?.capabilityCommandContracted),
    providerResourceContracted:!contractEnvelope?.provider||Boolean(contractEnvelope?.provider?.invariant?.resourcesContracted),
    missionAssignmentContracted:Boolean(contractEnvelope?.assignment?.invariant?.capabilityCommandContracted),
    sectorMissionContracted:Boolean(contractEnvelope?.sector?.scenarioCode&&contractEnvelope?.sector?.sectorCode&&contractEnvelope?.sector?.scenarioId),
    outcomeContracted:Boolean(contractEnvelope?.outcome?.invariant?.capabilityCommandContracted),
    continuityContracted:Boolean(contractEnvelope?.continuity?.invariant?.capabilityCommandContracted),
    planningContracted:Boolean(contractEnvelope?.planning?.invariant?.capabilityCommandContracted),
    planEvaluationContracted:Boolean(contractEnvelope?.planning?.evaluationStatus&&contractEnvelope?.planning?.evaluationHash),
    planAccepted:Boolean(contractEnvelope?.planning?.accepted===true),
    planNonExecuting:Boolean(contractEnvelope?.planning?.plan?.execution?.allowed===false)
    }),
    invalidPhases:Object.freeze([...new Set(invalidPhases)]),
    invalidCapabilities:Object.freeze([...new Set(invalidCapabilities)])
  });
}

export function validateMissionExecutionCoordinatorContract(contract){
  const failures=[];
  if(!contract?.invariant?.oneCoordinator)failures.push('execution_coordinator_missing');
  if(!contract?.invariant?.missionIdPresent)failures.push('mission_id_missing');
  if(!contract?.invariant?.stateTokenPresent)failures.push('execution_state_token_missing');
  if(!contract?.invariant?.validPhases)failures.push('execution_phase_invalid');
  if(!contract?.invariant?.validCapabilities)failures.push('execution_capability_invalid');
  if(!contract?.invariant?.unknownIsNotSuccess)failures.push('unknown_execution_misclassified');
  if(!contract?.invariant?.recoveryExplicit)failures.push('recovery_contract_missing');
  if(!contract?.invariant?.capabilityResourceContracted)failures.push('capability_operation_contract_missing');
  if(!contract?.invariant?.providerResourceContracted)failures.push('provider_resource_contract_missing');
  if(!contract?.invariant?.missionAssignmentContracted)failures.push('mission_assignment_contract_missing');
  if(!contract?.invariant?.sectorMissionContracted)failures.push('sector_mission_contract_missing');
  if(!contract?.invariant?.outcomeContracted)failures.push('outcome_contract_missing');
  if(!contract?.invariant?.continuityContracted)failures.push('continuity_contract_missing');
  if(!contract?.invariant?.planningContracted)failures.push('planning_contract_missing');
  if(!contract?.invariant?.planEvaluationContracted)failures.push('plan_evaluation_contract_missing');
  if(!contract?.invariant?.planAccepted)failures.push('plan_acceptance_missing');
  if(!contract?.invariant?.planNonExecuting)failures.push('planning_execution_boundary_invalid');
  return [...new Set(failures)];
}
