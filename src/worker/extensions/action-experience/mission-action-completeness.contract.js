import {ACTION_REGISTRY} from "../../application/actions/action-registry.js";
import {ACTION_SERVICE_MAP} from "../../application/actions/action-service-map.js";
import {actionExperience} from "./action-experience.contract.js";

export const MISSION_ACTION_COMPLETENESS_VERSION="4.8.0";

/**
 * V4.8: semantic completeness only. This does not authorize or execute.
 * Every registered mission action must have a route and an experience definition;
 * navigation/context actions may intentionally remain non-mutating.
 */
export function missionActionCompleteness(){
  const entries=[];
  for(const [code,definition] of Object.entries(ACTION_REGISTRY)){
    const route=ACTION_SERVICE_MAP[code]||null;
    const experience=actionExperience({code,label:definition.label,confirmation:definition.confirmation});
    entries.push(Object.freeze({code,domain:definition.domain,routeKind:route?.kind||null,hasRoute:Boolean(route),hasExperience:Boolean(experience?.experience),interactive:route?.kind!=="navigate"}));
  }
  return Object.freeze({version:MISSION_ACTION_COMPLETENESS_VERSION,actions:Object.freeze(entries)});
}

const NON_WORKBENCH_ACTIONS=new Set(["open_mission","navigate","review_availability"]);
const WORKBENCH_EXECUTION_CODES=new Set([
  "edit_mission_data","assign_driver","change_driver","accept_network","reject_network","approve_foryou_request","decline_foryou_request","approve_foryou_request","decline_foryou_request",
  "confirm_arrival","confirm_pickup","start_transit","capture_delivery_proof","confirm_delivery","complete_mission",
  "report_exception","resolve_exception","message","reclaim_execution","start_navigation","request_current_location",
  "share_current_location","resolve_traffic","resolve_waiting","cancel_mission","delete_mission","reactivate_mission",
  "start_custody_resolution","start_custody_recovery","confirm_custody_release","finalize_custody_transfer",
  "accept_custody","reassign_custody_receiver","abort_custody_transfer","review_completion_blocker","check_assignment",
  "review_network","review_foryou"
]);

export function validateMissionActionCompleteness(contract=missionActionCompleteness()){
  const problems=[];
  for(const x of contract.actions){
    if(!x.hasRoute||!x.hasExperience)problems.push(`${x.code}:incomplete`);
    if(x.interactive&&!NON_WORKBENCH_ACTIONS.has(x.code)&&!WORKBENCH_EXECUTION_CODES.has(x.code))problems.push(`${x.code}:no_workbench_execution_contract`);
  }
  return problems;
}

export function workbenchExecutionCodes(){return Object.freeze([...WORKBENCH_EXECUTION_CODES]);}
