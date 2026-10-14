import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.32.10 — Canonical Action Orchestration.
 * Produces a bounded, read-only plan of action -> expected verification -> reassess.
 * It never executes multiple mutations and never becomes workflow authority.
 */
import {decideCanonicalActions,CANONICAL_ACTION_DECISION_VERSION} from "./canonical-action-decision.service.js";

export const CANONICAL_ACTION_ORCHESTRATION_VERSION=RELEASE_VERSION;

export async function buildCanonicalActionOrchestration(env,request,session,{missionId=null,body={},limit=8}={}){
  const decisions=await decideCanonicalActions(env,request,session,{missionId,body,limit:Math.max(4,Math.min(20,Number(limit)||8))});
  const primary=decisions.primary;
  const plan=primary&&primary.state==="READY"?[step(primary.actionCode,0,"EXECUTE",primary),step(primary.actionCode,1,"VERIFY_AND_REASSESS",primary)]:[step(primary?.actionCode||null,0,"REASSESS",primary)];
  return Object.freeze({version:CANONICAL_ACTION_ORCHESTRATION_VERSION,missionId:decisions.missionId,decisionVersion:CANONICAL_ACTION_DECISION_VERSION,primary,ready:decisions.ready,alternatives:decisions.decisions.filter(x=>x!==primary).slice(0,5),plan:Object.freeze(plan),automaticExecution:false,automaticMutationReplay:false,authority:"canonical_action_application_service",truthSource:"authoritative_domain_service"});
}
function step(actionCode,order,type,decision){return Object.freeze({order,type,actionCode,requiresFreshTruth:type!=="REASSESS",decisionState:decision?.state||"UNAVAILABLE",onFailure:"STOP_AND_REASSESS"});}
