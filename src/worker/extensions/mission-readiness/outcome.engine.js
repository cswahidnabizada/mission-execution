export function deriveOutcome(state,assessment){
  const f=state.featureState||{},status=state.status;
  if(status==="Completed")return outcome("SUCCESSFUL",false,true);
  if(["Cancelled","Canceled"].includes(status))return outcome("CANCELLED",false,false);

  if(status==="Delivered"&&(!f.deliveryProof?.required||f.deliveryProof?.complete))return outcome("READY_FOR_COMPLETION",true,true);

  const criticalException=Boolean(f.exceptions?.open&&String(f.exceptions?.highestSeverity||"")==="critical");
  const unavailable=state.execution.state==="UNAVAILABLE";
  const overdue=state.timing.state==="OVERDUE";
  if(criticalException&&unavailable&&overdue)return outcome("CANCELLATION_CANDIDATE",true,false);

  if(assessment.readiness==="BLOCKED"||assessment.readiness==="AT_RISK")return outcome("RECOVERABLE",true,true);
  if(status==="Pending")return outcome("NOT_STARTED",true,true);
  return outcome("ACTIVE",true,true);
}
function outcome(state,requiresAction,successPossible){return Object.freeze({state,requiresAction,successPossible});}
