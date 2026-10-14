export const OPERATIONAL_ACTION_EXECUTION_VERSION="4.10.0";

const EXECUTABLE=new Set([
  "edit_mission_data","assign_driver","change_driver","reclaim_execution",
  "confirm_arrival","confirm_pickup","start_transit","capture_delivery_proof","confirm_delivery","complete_mission",
  "report_exception","resolve_exception","message","start_navigation","request_current_location","share_current_location",
  "resolve_traffic","resolve_waiting","cancel_mission","delete_mission","reactivate_mission","start_custody_resolution","start_custody_recovery",
  "confirm_custody_release","finalize_custody_transfer","accept_custody","reassign_custody_receiver","abort_custody_transfer",
  "accept_network","reject_network","approve_foryou_request","decline_foryou_request","approve_foryou_request","decline_foryou_request","repost_foryou","restart_network"
]);

export function operationalActionExecutionContract(codes=[]){
  return Object.freeze([...new Set(codes)].map(code=>Object.freeze({code:String(code),executable:EXECUTABLE.has(String(code))})));
}

export function validateOperationalActionExecution(contract=operationalActionExecutionContract()){
  return contract.filter(x=>!x.executable).map(x=>`${x.code}:not_executable`);
}

export function executableActionCodes(){return Object.freeze([...EXECUTABLE]);}
