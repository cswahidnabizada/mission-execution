export const MISSION_MANAGEMENT_CONTRACT_VERSION="1.0";
export function buildManagementContract({
  flow={},permissions={},requirements=[],managementActions=[],cancellation=null,reactivation=null,custody=null,completion=null
}={}){
  return Object.freeze({
    version:MISSION_MANAGEMENT_CONTRACT_VERSION,
    advisory:true,
    missionId:Number(flow.missionId||0)||null,
    state:managementState(flow),
    flow,
    permissions:Object.freeze({...permissions}),
    requirements:Object.freeze(requirements),
    actions:Object.freeze(managementActions),
    cancellation:cancellation?Object.freeze(cancellation):null,
    reactivation:reactivation?Object.freeze(reactivation):null,
    custody:custody?Object.freeze(custody):null,
    completion:completion?Object.freeze(completion):null
  });
}
function managementState(flow){
  if(flow.terminal)return flow.status==="Completed"?"COMPLETED":"CANCELLED";
  if(flow.readiness?.state==="BLOCKED")return "BLOCKED";
  if(flow.readiness?.state==="AT_RISK")return "AT_RISK";
  if(flow.readiness?.outcome==="READY_FOR_COMPLETION")return "READY_TO_COMPLETE";
  if(["Arrived","PickedUp","InTransit","Delivered"].includes(flow.status))return "ACTIVE";
  if(flow.ownership?.kind==="OWNER_UNASSIGNED")return "PREPARING";
  return "READY";
}
