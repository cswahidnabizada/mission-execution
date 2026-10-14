export function timingReadinessState(mission={},now=Date.now()){
  const status=String(mission.status||"Pending");
  if(["Completed","Cancelled","Canceled"].includes(status))return Object.freeze({state:"CLOSED",overdue:false,deadlineMs:null});
  const deadline=parse(mission.deadline_at_utc||mission.deadline_at);
  const pickup=parse(mission.pickup_at_utc);
  if(!deadline)return Object.freeze({state:"UNKNOWN",overdue:false,deadlineMs:null});
  const remaining=deadline-now;
  const overdue=remaining<0;
  const soon=!overdue&&remaining<=60*60*1000;
  const early=pickup&&now<pickup-2*60*60*1000;
  return Object.freeze({
    state:overdue?"OVERDUE":soon?"AT_RISK":early?"UPCOMING":"READY",
    overdue,soon,early,deadlineMs:deadline,remainingMs:remaining
  });
}
function parse(v){const n=Date.parse(String(v||""));return Number.isFinite(n)?n:null;}
