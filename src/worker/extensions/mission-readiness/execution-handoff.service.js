import {deriveExecutionHandoff} from "./execution-handoff.engine.js";

export function executionHandoffForMission({conditions,featureState,readiness,session}={}){
  if(!conditions||!featureState||!session)throw new Error("Execution Handoff requires authorized mission context");
  return deriveExecutionHandoff({conditions,featureState,readiness,session});
}
