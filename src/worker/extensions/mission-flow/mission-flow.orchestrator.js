import {resolveMissionAccess} from "../../security/mission-access.js";
import {buildMissionContext} from "../../modules/intelligence/mission-context.js";
import {buildMissionConditions} from "../../modules/intelligence/mission-conditions.js";
import {buildActionContext} from "../actions-intelligence/action-context.gateway.js";
import {missionReadiness} from "../mission-readiness/mission-readiness.service.js";
import {executionAvailabilityState} from "../mission-readiness/providers/execution-availability.provider.js";
import {executionHandoffForMission} from "../mission-readiness/execution-handoff.service.js";
import {resolveMissionBlocker} from "../mission-readiness/blocker-resolution.engine.js";
import {buildInterventionContract} from "../mission-readiness/intervention-contract.js";
import {executionOwnershipSnapshot} from "../mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {buildMissionFlowContract,validateMissionFlowContract} from "./mission-flow.contract.js";

export async function orchestrateMissionFlow(env,session,mission,{exceptions=[]}={}){
  // Resolve the authoritative viewer/mission access first. Do not infer access
  // from presentation flags such as public_enabled or shared_access: an owner
  // can publish a mission to ForYou and must remain the owner.
  const access=await resolveMissionAccess(env,session,Number(mission.id));
  if(!access){const e=new Error("Mission access lost");e.status=403;throw e;}
  const accessKind=String(access.accessKind||"owner");
  const authoritativeMission=access.mission||mission;
  const context=buildMissionContext(authoritativeMission,{role:session.role,accessKind});
  const conditions=buildMissionConditions(context);
  const featureState=await buildActionContext(env,session,authoritativeMission,conditions,{exceptions});
  const executionAvailability=await executionAvailabilityState(env,featureState,conditions);
  const readiness=missionReadiness({mission:authoritativeMission,featureState,conditions,executionAvailability});
  const resolutions=(readiness.blockers||[]).map(blocker=>resolveMissionBlocker({
    blocker,conditions,featureState,executionAvailability,session
  }));
  const intervention=buildInterventionContract({readiness,resolutions,session});
  const handoff=executionHandoffForMission({conditions,featureState,readiness,session});
  const ownership=await executionOwnershipSnapshot(env,Number(authoritativeMission.company_id),Number(authoritativeMission.id));

  const contract=buildMissionFlowContract({
    conditions,featureState,readiness,handoff,intervention,ownership,session
  });
  const problems=validateMissionFlowContract(contract);
  return Object.freeze({
    contract,
    problems:Object.freeze(problems),
    conditions,
    featureState,
    executionAvailability,
    readiness,
    intervention,
    handoff,
    ownership
  });
}

