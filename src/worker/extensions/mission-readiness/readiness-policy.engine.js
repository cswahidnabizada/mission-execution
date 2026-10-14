export const READINESS_BLOCKERS=Object.freeze({
  MISSION_DATA:"mission_data_execution_blocker",
  ASSIGNMENT:"assignment_unresolved",
  DRIVER_UNAVAILABLE:"assigned_driver_unavailable",
  EXECUTOR_UNAVAILABLE:"assigned_executor_unavailable",
  ROUTE:"route_incomplete",
  ACCESS:"access_invalid",
  DELIVERY_PROOF:"delivery_proof_missing"
});
const B=READINESS_BLOCKERS;

export function evaluateReadiness(state){
  const f=state.featureState||{},blockers=[],warnings=[];
  const add=(arr,code,domain,severity="attention")=>arr.push(Object.freeze({code,domain,severity}));

  if(state.status==="Completed")return result("FINISHED",blockers,warnings);
  if(["Cancelled","Canceled"].includes(state.status))return result("FINISHED",blockers,warnings);

  if(f.missionData?.executionReady===false)add(blockers,B.MISSION_DATA,"mission_data");
  else if(f.missionData?.complete===false)add(warnings,"mission_data_incomplete_nonblocking","mission_data","watch");
  if(f.assignment?.assignmentRequired||f.assignment?.unassigned)add(blockers,B.ASSIGNMENT,"assignment");
  if(state.execution.state==="UNAVAILABLE")add(blockers,state.execution.actorType==="executor"?B.EXECUTOR_UNAVAILABLE:B.DRIVER_UNAVAILABLE,"executor");
  if(state.route.state==="BLOCKED")add(blockers,B.ROUTE,"route");
  if(state.access.state==="BLOCKED")add(blockers,B.ACCESS,"access");
  if(f.deliveryProof?.required&&f.deliveryProof?.missing&&["InTransit","Delivered"].includes(state.status))add(blockers,B.DELIVERY_PROOF,"delivery_proof");

  if(f.exceptions?.open)add(warnings,f.exceptions.highestSeverity==="critical"?"critical_exception_open":"exception_open","exceptions",f.exceptions.highestSeverity||"attention");
  if(state.timing.state==="OVERDUE")add(warnings,"deadline_overdue","timing","critical");
  else if(state.timing.state==="AT_RISK")add(warnings,"deadline_near","timing","attention");
  if(state.execution.state==="UNKNOWN"&&f.assignment?.assigned)add(warnings,"execution_availability_unknown","executor","watch");
  if(state.access.state==="UNKNOWN")add(warnings,"access_window_unknown","access","watch");

  if(blockers.length)return result("BLOCKED",blockers,warnings);
  if(warnings.some(x=>x.severity==="critical"||x.severity==="high"))return result("AT_RISK",blockers,warnings);
  if(["Arrived","PickedUp","InTransit","Delivered"].includes(state.status))return result("IN_PROGRESS",blockers,warnings);
  return result("READY",blockers,warnings);
}
function result(readiness,blockers,warnings){return Object.freeze({readiness,blockers:Object.freeze(blockers),warnings:Object.freeze(warnings)});}
