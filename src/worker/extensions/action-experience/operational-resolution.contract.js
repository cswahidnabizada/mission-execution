import {ACTION_REGISTRY} from "../../application/actions/action-registry.js";
import {ACTION_SERVICE_MAP} from "../../application/actions/action-service-map.js";

export const OPERATIONAL_RESOLUTION_VERSION="4.9.0";

const CONTEXT_ONLY=new Set(["open_mission","navigate","review_availability"]);
const EXPLICIT_WORKBENCH=new Set([
  "check_assignment","edit_mission_data","review_network","review_foryou",
  "assign_driver","change_driver","accept_network","reject_network","approve_foryou_request","decline_foryou_request","approve_foryou_request","decline_foryou_request",
  "confirm_arrival","confirm_pickup","start_transit","capture_delivery_proof","confirm_delivery","complete_mission",
  "report_exception","resolve_exception","message","reclaim_execution","start_navigation",
  "request_current_location","share_current_location","resolve_traffic","resolve_waiting","cancel_mission",
  "repost_foryou","restart_network","withdraw_foryou","withdraw_network","reactivate_mission","start_custody_resolution","start_custody_recovery",
  "confirm_custody_release","finalize_custody_transfer","accept_custody","reassign_custody_receiver",
  "abort_custody_transfer","review_completion_blocker"
]);

export function operationalResolutionContract(){
  return Object.freeze(Object.entries(ACTION_REGISTRY).map(([code,definition])=>{
    const route=ACTION_SERVICE_MAP[code];
    return Object.freeze({
      code,
      domain:definition.domain,
      routeKind:route?.kind||null,
      contextOnly:CONTEXT_ONLY.has(code),
      workbenchCapable:EXPLICIT_WORKBENCH.has(code)||Boolean(route?.kind==="api"||route?.kind==="mission_status")
    });
  }));
}

export function validateOperationalResolution(contract=operationalResolutionContract()){
  const problems=[];
  for(const item of contract){
    if(!item.routeKind)problems.push(`${item.code}:missing_service_route`);
    if(!item.contextOnly&&!item.workbenchCapable)problems.push(`${item.code}:missing_workbench_resolution`);
  }
  return problems;
}
