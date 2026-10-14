export const ACTION_DEPENDENCY_POLICY=Object.freeze([
  gate("review_network",10,"review_network",s=>s.network.pending),
  gate("review_foryou",20,"review_foryou",s=>s.foryou.pending),

  gate("required_mission_data",30,"edit_mission_data",s=>!s.missionData.executionReady&&s.role==="admin"&&s.responsibility.isOwner),
  gate("required_mission_data_coordinate",35,"message",s=>!s.missionData.executionReady&&!(s.role==="admin"&&s.responsibility.isOwner)&&s.messaging.contactAvailable),

  gate("responsible_assignment",40,"assign_driver",s=>!s.responsibility.acquisitionWaiting&&(s.responsibility.viewerMustAssign||(s.responsibility.assignmentRequired&&s.role==="admin"&&!s.responsibility.partnerAssignmentMissing))),
  gate("owner_assignment_oversight",45,"check_assignment",s=>s.responsibility.isOwner&&s.responsibility.partnerAssignmentMissing),
  gate("assigned_driver_unavailable",50,"change_driver",s=>s.responsibility.driverAvailable===false&&s.responsibility.canReassign&&s.role==="admin"),

  gate("open_exception",60,"resolve_exception",s=>s.exceptions.open&&s.exceptions.resolvable),
  gate("open_exception_coordinate",65,"message",s=>s.exceptions.open&&!s.exceptions.resolvable&&s.messaging.contactAvailable),
  gate("message_escalation",70,"message",s=>s.messaging.escalationNeeded&&s.messaging.contactAvailable),

  gate("flow_pending",100,"confirm_arrival",s=>execution(s)&&s.status==="Pending"&&String(s.sectorCode||"logistics") === "logistics"),
  gate("flow_sector_pending",105,"start_operation",s=>execution(s)&&String(s.sectorCode||"logistics") !== "logistics"&&s.status==="Pending"),
  gate("flow_arrived",110,"confirm_pickup",s=>execution(s)&&s.status==="Arrived"),
  gate("flow_picked_up",120,"start_transit",s=>execution(s)&&s.status==="PickedUp"),

  // The secured status API already requires proof before Delivered/Completed.
  // We surface that prerequisite BEFORE recommending Confirm Delivery.
  gate("delivery_proof_required",125,"capture_delivery_proof",s=>execution(s)&&["InTransit","Delivered"].includes(s.status)&&s.deliveryProof.required&&s.deliveryProof.missing),
  gate("flow_in_transit",130,"confirm_delivery",s=>execution(s)&&s.status==="InTransit"&&s.deliveryProof.complete),
  gate("flow_delivered",140,"complete_mission",s=>execution(s)&&s.status==="Delivered"&&s.deliveryProof.complete),
  gate("flow_sector_in_progress",145,"complete_operation",s=>execution(s)&&String(s.sectorCode||"logistics") !== "logistics"&&s.status==="InProgress")
]);

export function unresolvedDependencies(state){
  if(!state||state.terminal||state.completed)return [];
  return ACTION_DEPENDENCY_POLICY.filter(g=>safe(g.when,state)).sort((a,b)=>a.order-b.order).map(({when,...g})=>g);
}
export function validateDependencyPolicy(){
  const ids=new Set(),orders=new Set(),problems=[];
  for(const g of ACTION_DEPENDENCY_POLICY){
    if(ids.has(g.id))problems.push(`duplicate gate id ${g.id}`);ids.add(g.id);
    if(orders.has(g.order))problems.push(`duplicate gate order ${g.order}`);orders.add(g.order);
    if(!g.actionCode)problems.push(`missing action for ${g.id}`);
  }
  return problems;
}
function execution(s){return Boolean(s.responsibility.isPersonal);}
function gate(id,order,actionCode,when){return Object.freeze({id,order,actionCode,when});}
function safe(fn,state){try{return Boolean(fn(state));}catch{return false;}}
