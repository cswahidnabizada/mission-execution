import {buildReadinessState} from "./readiness-state.engine.js";
import {evaluateReadiness} from "./readiness-policy.engine.js";
import {deriveOutcome} from "./outcome.engine.js";
import {buildReadinessContract} from "./readiness-contract.js";

export function missionReadiness({mission,featureState,conditions,executionAvailability=null,now=Date.now()}={}){
  const state=buildReadinessState({mission,featureState,conditions,executionAvailability,now});
  const assessment=evaluateReadiness(state);
  const outcome=deriveOutcome(state,assessment);
  return buildReadinessContract(state,assessment,outcome);
}
