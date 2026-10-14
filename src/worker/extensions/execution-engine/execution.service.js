import {orchestrateMissionFlow} from "../mission-flow/mission-flow.orchestrator.js";
import {buildExecutionContract,validateExecutionContract} from "./execution.contract.js";
import {acquisitionStateForMission} from "./acquisition/execution-acquisition.service.js";

export async function executionStateForMission(env,session,mission,{exceptions=[],flowBundle=null}={}){
  const bundle=flowBundle||await orchestrateMissionFlow(env,session,mission,{exceptions});
  const contract=buildExecutionContract({
    mission,flow:bundle.contract,ownership:bundle.ownership,
    featureState:bundle.featureState,availability:bundle.executionAvailability
  });
  const acquisition=await acquisitionStateForMission(env,Number(mission.company_id),Number(mission.id));
  return Object.freeze({
    execution:Object.freeze({...contract,acquisition:acquisition.acquisition}),
    problems:Object.freeze([...validateExecutionContract(contract),...(acquisition.problems||[])]),
    flowBundle:bundle
  });
}
