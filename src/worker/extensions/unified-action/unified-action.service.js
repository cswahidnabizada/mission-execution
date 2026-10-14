import {coordinateMissionEngines} from "../engine-coordinator/engine-coordinator.service.js";

export async function unifiedActionForMission(env,session,mission,{exceptions=[],executionLocation=null}={}){
  const result=await coordinateMissionEngines(env,session,mission,{exceptions,executionLocation});
  return Object.freeze({
    surface:result.coordination.unified,
    problems:result.problems,
    coordination:result.coordination
  });
}
