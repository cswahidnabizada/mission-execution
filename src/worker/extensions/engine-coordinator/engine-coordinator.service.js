import {orchestrateMissionFlow} from "../mission-flow/mission-flow.orchestrator.js";
import {executionStateForMission} from "../execution-engine/execution.service.js";
import {missionManagement} from "../mission-management/mission-management.service.js";
import {actionContractForMissionIntelligence} from "../actions-intelligence/actions-intelligence.service.js";
import {buildUnifiedActionContract,validateUnifiedActionContract} from "../unified-action/unified-action.contract.js";
import {buildEngineCoordinationContract,validateEngineCoordination} from "./engine-coordination.contract.js";
import {assessCanonicalMissionLiveness,validateCanonicalMissionLiveness} from "../../core/canonical-liveness-registry.js";
import {buildMissionTruthContract,validateMissionTruthContract} from "../mission-truth/mission-truth.contract.js";
import {buildFinalOperationalProduct} from "../../modules/intelligence/final-operational-product.engine.js";
import {getMissionTransitionRecoveryPosture} from "../../modules/transitions/transition-recovery-posture.service.js";

export async function coordinateMissionEngines(env,session,mission,{exceptions=[],executionLocation=null}={}){
  const flowBundle=await orchestrateMissionFlow(env,session,mission,{exceptions});
  const executionResult=await executionStateForMission(env,session,mission,{exceptions,flowBundle});

  const conditions=flowBundle.conditions;
  const featureState=flowBundle.featureState;
  const management=await missionManagement(env,session,mission,{
    exceptions,executionLocation,flowBundle
  });
  const networkInvitation=featureState.network?.pending?{id:featureState.network.id,status:featureState.network.status,relation:featureState.network.relation}:null;
  const forYouRequest=featureState.foryou?.pending?{id:featureState.foryou.id,status:"Pending",relation:featureState.foryou.relation}:null;
  const actions=actionContractForMissionIntelligence({
    conditions,
    viewerDriverId:session.role==="driver"?Number(session.driverId||0):null,
    viewerExecutorId:session.role==="executor"?Number(session.executorId||0):null,
    openException:Boolean(featureState.exceptions.open),
    openExceptionId:featureState.exceptions.primaryExceptionId||null,
    canResolveException:Boolean(featureState.exceptions.resolvable),
    networkInvitation,forYouRequest,featureState,
    missionUpdatedAt:mission.updated_at||null,
    stateToken:Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:null,
    managementActions:management?.actions||[]
  });

  const unified=buildUnifiedActionContract({mission,actions,management});
  const recovery=await getMissionTransitionRecoveryPosture(env,{companyId:Number(mission?.company_id||0),missionId:Number(mission?.id||0)});
  const liveness=assessCanonicalMissionLiveness({mission,flow:flowBundle.contract,management,unified,recovery});

  // V8.8.0: one protected, read-only truth projection is built after all
  // authoritative domain projections exist. It validates agreement; it never
  // authorizes or mutates lifecycle, assignment, responsibility or custody.
  const truth=buildMissionTruthContract({
    mission,
    flow:flowBundle.contract,
    execution:executionResult.execution,
    management,
    liveness
  });
  const truthProblems=validateMissionTruthContract(truth);

  const problems=[
    ...(flowBundle.problems||[]),
    ...(executionResult.problems||[]),
    ...validateUnifiedActionContract(unified),
    ...validateCanonicalMissionLiveness(liveness),
    ...truthProblems
  ];

  const coordination=buildEngineCoordinationContract({
    mission,
    truth,
    flow:flowBundle.contract,
    execution:executionResult.execution,
    assignment:flowBundle.featureState?.assignment||null,
    management,
    actions,
    unified,
    liveness,
    recovery,
    problems
  });

  const finalOperationalProduct=buildFinalOperationalProduct({
    candidate:{missionId:Number(mission?.id||0)||null,status:mission?.status||flowBundle.contract?.status||null,truth},
    coordination,
    actionAlignment:{alignment:{
      state:unified?.primary?"READY":"NONE",
      currentAction:unified?.primary||null,
      actor:flowBundle.contract?.next?.actor||executionResult.execution?.actor||null,
      viewerCanExecute:Boolean(unified?.primary?.viewerCanExecute),
      dependency:unified?.waiting||null,
      waitingFor:flowBundle.contract?.next?.waitingFor||null
    }},
    liveness
  });

  return Object.freeze({
    coordination:Object.freeze({...coordination,finalOperationalProduct}),
    finalOperationalProduct,
    problems:Object.freeze(validateEngineCoordination(coordination)),
    flowBundle
  });
}
