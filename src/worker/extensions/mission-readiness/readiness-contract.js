export const READINESS_CONTRACT_VERSION="1.0";
export function buildReadinessContract(state,assessment,outcome){
  return Object.freeze({
    version:READINESS_CONTRACT_VERSION,
    advisory:true,
    missionId:state.missionId,
    missionStatus:state.status,
    readiness:assessment.readiness,
    outcome,
    blockers:assessment.blockers,
    warnings:assessment.warnings,
    domains:Object.freeze({
      data:state.featureState?.missionData?.executionReady===false?"BLOCKED":state.featureState?.missionData?.complete===false?"REPAIR":"READY",
      assignment:state.featureState?.assignment?.assigned?"READY":"BLOCKED",
      executor:state.execution.state,
      route:state.route.state,
      timing:state.timing.state,
      access:state.access.state,
      exceptions:state.featureState?.exceptions?.open?"ATTENTION":"CLEAR",
      proof:state.featureState?.deliveryProof?.complete?"READY":state.featureState?.deliveryProof?.required?"MISSING":"NOT_REQUIRED",
      distribution:(state.featureState?.foryou?.pending||state.featureState?.network?.invitationPending)?"PENDING":"RESOLVED"
    })
  });
}
