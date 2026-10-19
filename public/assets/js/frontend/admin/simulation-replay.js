import {simulate} from './simulation-engine.js';
import {buildSimulationPlan} from './simulation-planner-adapter.js';

import {fingerprint,outcomeProjection} from './simulation-fingerprint.js';
export function replaySimulation(original){
  if(!original||original.schema!=='onmission.simulation-run.v1'||original.simulationOnly!==true)throw new Error('SIMULATION_REPLAY_INPUT_INVALID');
  const input=original.replay?.input;
  if(!input||input.scenarioVersion!=='1')throw new Error('SIMULATION_REPLAY_VERSION_UNSUPPORTED');
  const replayed=simulate({scenarioId:input.scenarioId,executor:input.executorId,missionId:input.missionId,deadline:input.deadlineMinutes,seed:input.seed,resources:input.resources,runTimestamp:original.createdAt});
  const expected=original.replay?.outcomeFingerprint||fingerprint(outcomeProjection(original));
  const sourceObserved=fingerprint(outcomeProjection(original));
  const actual=fingerprint(outcomeProjection(replayed));
  return {replayId:`replay-${fingerprint({runId:original.runId,seed:input.seed,actual})}`,sourceRunId:original.runId,scenarioVersion:input.scenarioVersion,seed:input.seed,expectedFingerprint:expected,sourceFingerprint:sourceObserved,observedFingerprint:actual,match:expected===sourceObserved&&expected===actual,classification:'SIMULATION_ONLY',replayedRun:replayed,productionMutation:false,deviceCommandSent:false};
}
export {fingerprint,outcomeProjection};
