const BASE={
  resolve_exception:120,
  assign_driver:115,
  confirm_arrival:110,
  confirm_pickup:110,
  start_transit:110,
  confirm_delivery:110,
  complete_mission:110,
  accept_network:105,
  approve_foryou_request:105,
  check_assignment:90,
  change_driver:65,
  navigate:55,
  report_exception:50,
  message:35,
  open_mission:20,
  reject_network:15,
  decline_foryou_request:15
};

/** Ranking only: capability must already be allowed. */
export function rankActions(capabilityResult={}){
  const allowed=(capabilityResult.capabilities||[]).map(action=>({
    ...action,
    score:score(action,capabilityResult),
    importance:importance(action)
  }));
  allowed.sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));
  return allowed;
}
function score(action,result){
  let n=Number(BASE[action.code]||10);
  if(action.confirmation)n-=2;
  if(result.terminal&&action.code!=="open_mission"&&action.code!=="message")n-=100;
  return n;
}
function importance(action){
  if(["resolve_exception","assign_driver"].includes(action.code))return "required";
  if(String(action.code).startsWith("confirm_")||action.code==="start_transit"||action.code==="complete_mission")return "recommended";
  if(["accept_network","approve_foryou_request","check_assignment"].includes(action.code))return "recommended";
  return "optional";
}
