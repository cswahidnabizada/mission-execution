import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.32.11 — Canonical Operational Journeys.
 * A journey is a bounded sequence of canonical action intents derived from current
 * Truth. It is a plan, not an autonomous workflow engine.
 */
import {buildCanonicalActionOrchestration} from "./canonical-action-orchestration.service.js";

export const CANONICAL_OPERATIONAL_JOURNEY_VERSION=RELEASE_VERSION;
const JOURNEY_BY_ACTION=Object.freeze({
  assign_driver:["assign_driver","check_assignment"],
  change_driver:["change_driver","check_assignment"],
  confirm_arrival:["confirm_arrival","confirm_pickup","start_transit"],
  confirm_pickup:["confirm_pickup","start_transit","confirm_delivery"],
  start_transit:["start_transit","confirm_delivery","complete_mission"],
  confirm_delivery:["confirm_delivery","complete_mission"],
  share_network:["share_network","review_network"],
  share_foryou:["share_foryou","review_foryou"],
  accept_custody:["accept_custody","finalize_custody_transfer"],
  start_custody_recovery:["start_custody_recovery","accept_custody","finalize_custody_transfer"]
});

export async function buildCanonicalOperationalJourney(env,request,session,{missionId=null,body={},limit=8}={}){
  const orchestration=await buildCanonicalActionOrchestration(env,request,session,{missionId,body,limit});
  const root=orchestration.primary?.actionCode||null;
  const codes=JOURNEY_BY_ACTION[root]||[];
  const steps=Object.freeze(codes.map((code,index)=>Object.freeze({order:index,actionCode:code,dependsOn:index?codes[index-1]:null,execution:"canonical_action_application_service",requiresReassessment:true,automaticExecution:false})));
  return Object.freeze({version:CANONICAL_OPERATIONAL_JOURNEY_VERSION,missionId:Number(missionId||0)||null,rootAction:root,journey:steps.length?steps:Object.freeze([{order:0,actionCode:root,dependsOn:null,execution:"canonical_action_application_service",requiresReassessment:true,automaticExecution:false}]),orchestration,closedLoop:{afterEachAction:"READ_AUTHORITATIVE_TRUTH_THEN_REASSESS",onStale:"STOP_REPREPARE",onFailure:"STOP_REASSESS",mutationReplay:false},authority:"canonical_action_application_service",truthSource:"authoritative_domain_service"});
}
