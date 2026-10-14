export function accessReadinessState(mission={}){
  const pickup=windowState(mission.pickup_access_from,mission.pickup_access_to);
  const delivery=windowState(mission.delivery_access_from,mission.delivery_access_to);
  const invalid=pickup==="INVALID"||delivery==="INVALID";
  return Object.freeze({
    state:invalid?"BLOCKED":pickup==="UNKNOWN"&&delivery==="UNKNOWN"?"UNKNOWN":"READY",
    pickup,delivery,
    blockers:Object.freeze(invalid?["invalid_access_window"]:[])
  });
}
function windowState(from,to){
  const a=String(from||"").trim(),b=String(to||"").trim();
  if(!a&&!b)return "UNKNOWN";
  if(!a||!b)return "INVALID";
  return /^\d{2}:\d{2}/.test(a)&&/^\d{2}:\d{2}/.test(b)?"CONFIGURED":"INVALID";
}
