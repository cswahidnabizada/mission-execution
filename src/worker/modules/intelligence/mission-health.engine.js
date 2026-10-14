/**
 * Mission Health — judges execution quality only.
 * It does not decide UI priority, notification delivery, or user focus.
 */
export function deriveMissionHealth(conditions,flow){
  const c=conditions||{},signals=[];

  if(c.completed)return result("complete",0,"Mission execution is complete.",signals);

  if(c.responsibility?.assignmentRequired)
    signals.push(sig("assignment_required","blocking","responsibility","Execution has no assigned executor."));
  if(c.responsibility?.partnerAssignmentMissing&&!c.responsibility?.viewerMustAssign)
    signals.push(sig("execution_partner_unassigned","risk","responsibility",`${c.responsibility.responsibilityCompanyName||"Execution partner"} has not assigned a driver yet.`));
  if(c.responsibility?.marketplaceWaiting)
    signals.push(sig("marketplace_waiting","waiting","responsibility","Execution is waiting for an executor acceptance."));

  if(c.dataQuality?.missingRequired?.length)
    signals.push(sig("required_data_missing","blocking","data",`Mission is missing required data: ${c.dataQuality.missingRequired.join(", ")}.`));

  // Once physical delivery is confirmed, timing no longer outranks completion integrity.
  // Delivered recovery must focus on proof/requirements/exceptions rather than an already-achieved delivery deadline.
  if(!["Delivered","Completed"].includes(String(c.status||""))){
    switch(c.time?.deadline){
      case "overdue": signals.push(sig("overdue","critical","time","Mission deadline has passed.")); break;
      case "critical": signals.push(sig("deadline_critical","critical","time","Mission deadline is within 15 minutes.")); break;
      case "soon": signals.push(sig("deadline_soon","risk","time","Mission deadline is within 30 minutes.")); break;
      case "watch": signals.push(sig("deadline_watch","watch","time","Mission deadline is within one hour.")); break;
    }
  }

  const pickup=c.time?.pickup||c.time?.actionOne;
  if(pickup==="late")signals.push(sig("pickup_late","risk","flow","Pickup time has passed without pickup completion."));
  if(pickup==="waiting")signals.push(sig("pickup_waiting","delay","flow",`Pickup has been waiting for ${Number(c.time?.statusAgeMinutes||0)} minutes.`));

  if(c.progress?.reason==="delivered_not_completed")
    signals.push(sig("completion_pending","incomplete","completion","Delivery is confirmed but mission completion is still pending."));
  if(c.progress?.reason==="no_recent_update")
    signals.push(sig("stale_progress","watch","freshness",`Mission has had no update for ${Number(c.time?.updateAgeMinutes||0)} minutes.`));

  const state=deriveState(signals,flow);
  const riskScore=healthRisk(signals);
  return result(state,riskScore,summaryFor(state,signals,flow),signals);
}

function deriveState(signals,flow){
  if(signals.some(s=>s.severity==="blocking"))return "blocked";
  if(signals.some(s=>s.severity==="critical"||s.severity==="risk"))return "at_risk";
  if(signals.some(s=>s.severity==="incomplete"))return "incomplete";
  if(signals.some(s=>s.severity==="delay"))return "delayed";
  if(signals.some(s=>s.severity==="waiting"))return "waiting";
  if(signals.some(s=>s.severity==="watch"))return "watch";
  return flow?.state==="complete"?"complete":"healthy";
}

function healthRisk(signals){
  const weight={blocking:90,critical:80,risk:55,incomplete:40,delay:35,waiting:20,watch:12};
  return Math.min(100,signals.reduce((n,s)=>Math.max(n,weight[s.severity]||0),0));
}
function summaryFor(state,signals,flow){
  const order=["blocking","critical","risk","incomplete","delay","waiting","watch"];
  for(const sev of order){const s=signals.find(x=>x.severity===sev);if(s)return s.label;}
  return flow?.reason||"Mission is progressing normally.";
}
function sig(code,severity,domain,label){return {code,severity,domain,label};}
function result(state,riskScore,summary,signals){return {state,riskScore,summary,signals};}
