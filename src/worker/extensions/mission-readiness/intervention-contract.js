export const INTERVENTION_CONTRACT_VERSION="1.0";

export function buildInterventionContract({readiness,resolutions=[],session={}}={}){
  const blocked=readiness?.readiness==="BLOCKED";
  if(!blocked)return Object.freeze({version:INTERVENTION_CONTRACT_VERSION,state:"NONE",primary:null,all:Object.freeze([])});

  const ordered=(resolutions||[]).filter(Boolean);
  const primary=ordered[0]||fallback(readiness);
  return Object.freeze({
    version:INTERVENTION_CONTRACT_VERSION,
    state:primary?.executableByViewer?"ACTION_REQUIRED":primary?.valid?"WAITING":"REVIEW_REQUIRED",
    headline:"Mission needs intervention",
    primary,
    all:Object.freeze(ordered)
  });
}
function fallback(readiness){
  const blocker=readiness?.blockers?.[0]||null;
  return Object.freeze({
    blocker,reasonCode:"unresolved_blocker",reason:"The mission is blocked and requires review.",
    actor:null,action:null,executableByViewer:false,waitingFor:null,resolutionState:"REVIEW_REQUIRED",valid:false
  });
}
