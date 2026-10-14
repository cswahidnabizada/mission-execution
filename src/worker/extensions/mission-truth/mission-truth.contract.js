import {MISSION_STATUS_FLOW,canonicalMissionStatus} from "../../domains/logistics/logistics-lifecycle.contract.js";
import {CANONICAL_LIFECYCLE_STATUSES,lifecycleEdges,lifecycleStage,transitionDefinition,isLifecycleTerminal,hasPhysicalCustody} from "../../domains/logistics/logistics-lifecycle.contract.js";

export const MISSION_TRUTH_VERSION="1.2";
export const CANONICAL_MISSION_STATUSES=CANONICAL_LIFECYCLE_STATUSES;

export {lifecycleEdges,lifecycleStage,transitionDefinition};
export function canLifecycleTransition(fromStatus,toStatus){return Boolean(transitionDefinition(fromStatus,toStatus));}

export function buildMissionTruthContract({mission={},flow={},execution={},management={},liveness={}}={}){
  const status=canonicalMissionStatus(mission.status||flow.status||execution.status||"Pending");
  const stage=lifecycleStage(status);
  const terminal=isLifecycleTerminal(status);
  const physicalCustodyActive=hasPhysicalCustody(status);
  const ownerCount=Number(flow?.ownership?.ownerCount??(execution?.invariant?.oneExecutionOwner===false?2:1));
  const executionActor=execution?.actor||flow?.ownership?.actor||null;
  const completion=management?.completion||null;
  const livenessState=String(liveness?.state||"");
  const normalizedFlowStatus=canonicalMissionStatus(flow?.status||status);
  const normalizedExecutionStatus=canonicalMissionStatus(execution?.status||status);
  const truth=Object.freeze({
    version:MISSION_TRUTH_VERSION,missionId:Number(mission.id||flow.missionId||execution.missionId||0)||null,
    lifecycle:Object.freeze({status,stage,terminal,allowedSuccessors:Object.freeze(lifecycleEdges(status).map(x=>x.to)),edges:lifecycleEdges(status)}),
    ownership:Object.freeze({ownerCompanyId:Number(flow?.ownership?.ownerCompanyId||mission.company_id||0)||null,executionKind:String(flow?.ownership?.kind||execution?.mode||"UNKNOWN"),executionActor:executionActor?Object.freeze({...executionActor}):null,executionOwnerCount:ownerCount}),
    custody:Object.freeze({physicalActive:physicalCustodyActive,resolutionOpen:Boolean(management?.custody?.currentCase||management?.custody?.openCase),transferRequired:Boolean(execution?.custody?.transferRequired||management?.custody?.required)}),
    distribution:Object.freeze({foryou:String(flow?.distribution?.foryou||"NONE"),network:String(flow?.distribution?.network||"NONE")}),
    completion:Object.freeze({gateKnown:Boolean(completion),allowed:Boolean(completion?.allowed),blockerCount:Number(completion?.blockers?.length||0)}),
    liveness:Object.freeze({state:livenessState||null,reasonCode:liveness?.reasonCode||null,requiresEscalation:Boolean(liveness?.requiresEscalation)}),
    invariant:Object.freeze({knownStatus:CANONICAL_MISSION_STATUSES.includes(status),flowStatusAgrees:normalizedFlowStatus===status,executionStatusAgrees:normalizedExecutionStatus===status,terminalAgrees:!flow||typeof flow.terminal!=="boolean"||Boolean(flow.terminal)===terminal,oneExecutionOwner:ownerCount<=1&&execution?.invariant?.oneExecutionOwner!==false,custodyMatchesLifecycle:Boolean(execution?.custody?.active)===physicalCustodyActive,deliveredHasNoPhysicalCustody:status!=="Delivered"||!physicalCustodyActive,terminalHasNoPhysicalCustody:!terminal||!physicalCustodyActive,completionOnlyAfterDelivery:!completion?.allowed||status==="Delivered",livenessPreserved:terminal||!livenessState||livenessState!=="BREACH"})
  });
  return truth;
}
export function validateMissionTruthContract(truth){const problems=[];if(!truth?.missionId)problems.push("mission_truth_mission_id_missing");for(const [key,value] of Object.entries(truth?.invariant||{}))if(value===false)problems.push(`mission_truth_${snake(key)}`);return problems;}
function snake(s){return String(s).replace(/([a-z0-9])([A-Z])/g,"$1_$2").toLowerCase();}
