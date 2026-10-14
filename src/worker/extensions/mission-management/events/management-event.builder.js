export function managementEvent(type,data={}){
  const actor=String(data.actorName||"Mission management");
  const ref=String(data.reference||`Mission ${data.missionId||""}`).trim();
  if(type==="cancelled")return `${actor} cancelled ${ref} · ${reasonLabel(data.reasonCode)}${data.note?` · ${data.note}`:""}`;
  if(type==="reactivated")return `${actor} reactivated ${ref} · execution assignment is required`;
  if(type==="location_requested")return `${actor} requested the current execution location for ${ref}`;
  if(type==="location_shared")return `${actor} shared the current location for ${ref}`;
  if(type==="traffic_resolved")return `${actor} resolved the traffic condition on ${ref}`;
  if(type==="waiting_resolved")return `${actor} confirmed the waiting is over on ${ref}`;
  if(type==="navigation_started")return `${actor} started navigation for ${ref}`;
  if(type==="requirement_created")return `${actor} created a mission requirement for ${ref}`;
  return `${actor} updated mission management for ${ref}`;
}
function reasonLabel(code){
  return ({
    customer_cancelled:"Customer cancelled",
    address_impossible:"Address cannot be completed",
    execution_unavailable:"Execution unavailable",
    duplicate_mission:"Duplicate mission",
    operational_failure:"Operational failure",
    other:"Other"
  })[String(code||"")]||String(code||"Cancellation");
}
