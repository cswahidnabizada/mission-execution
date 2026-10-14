import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
import {isLivenessWaiting} from "../../core/canonical-liveness-registry.js";
/* ON Mission 10.29.48 — Canonical Execution Readiness
 * Read-only presentation contract. It separates lifecycle next step, operational
 * readiness, viewer execution availability, waiting/liveness and risk.
 * It does not create truth, authorization, custody or mutation.
 */
export const OPERATIONAL_READINESS_CONTRACT_VERSION="3.0";



const EXECUTION_STATES=new Set(["EXECUTABLE","NOT_EXPOSED","REQUIRES_VALIDATION","NOT_APPLICABLE","NOT_ESTABLISHED"]);

export function buildOperationalReadinessContract({mission,flow,liveness,primaryAction,capabilityAudit,capabilityExposure=null}={}){
  const f=flow||{};
  const terminal=Boolean(f.terminal)||isLifecycleTerminal(mission?.status||f.status);
  const l=liveness||{};
  const readiness=f.readiness||{};
  const lifecycle=f.next?.action||null;
  const action=primaryAction||null;
  const actor=f.next?.actor||l.responsibleActor||null;
  const livenessState=String(l.state||"UNKNOWN").toUpperCase();
  const actualWaiting=isLivenessWaiting(livenessState);
  const responsibleActor=l.responsibleActor||actor||null;
  const waitingFor=actualWaiting?String(l.actor||f.next?.waitingFor||l.responsibleActor?.name||"")||null:null;
  const readinessState=String(readiness.state||"UNKNOWN").toUpperCase();
  const blocker=Array.isArray(readiness.blockers)?readiness.blockers[0]||null:null;
  const warning=Array.isArray(readiness.warnings)?readiness.warnings[0]||null:null;
  const waitingSignals=actualWaiting&&Boolean(waitingFor||l.reasonCode||f.next?.waitingFor||l.reason||l.explanation);
  const waitingCondition=waitingSignals?{code:String(l.reasonCode||f.next?.reasonCode||"known_wait")||"known_wait",label:waitingFor?`Waiting for ${waitingFor} to progress.`:"Waiting for the known operational condition to change."}:null;
  const deadline=mission?.deadline_at||mission?.deadlineAt||mission?.deadline_at_utc||mission?.deadlineAtUtc||null;
  const overdue=Boolean(deadline)&&Number.isFinite(Date.parse(deadline))&&Date.parse(deadline)<Date.now()&&!terminal;

  let state=readinessState;
  let reason=String(readiness.summary||"Canonical operational readiness is not sufficiently established.");
  if(terminal){state="TERMINAL";reason="The mission is terminal; no further operational mutation belongs in the active flow.";}
  else if(["BLOCKED","AT_RISK","READY","FINISHED","IN_PROGRESS"].includes(readinessState)){
    state=readinessState==="FINISHED"?"TERMINAL":readinessState;
    reason=String(blocker?.message||blocker?.reason||warning?.message||warning?.reason||readiness.summary||reason);
  }else if(readinessState==="UNKNOWN"&&livenessState==="BREACH"){state="REVIEW";reason=String(l.reason||"Liveness requires operational review before proceeding.");}
  else if(readinessState==="UNKNOWN"){state="UNKNOWN";reason="Canonical operational readiness is not sufficiently established.";}

  let executionState="NOT_ESTABLISHED",executionReason="No canonical lifecycle step is currently established.";
  if(terminal){executionState="NOT_APPLICABLE";executionReason="The mission is terminal; there is no active execution step.";}
  else if(!lifecycle){executionState="NOT_ESTABLISHED";executionReason="The canonical mission flow does not currently expose a next lifecycle step.";}
  else if(capabilityExposure?.exposureState){executionState=String(capabilityExposure.exposureState);executionReason=String(capabilityExposure.reason||executionReason);}
  else if(capabilityAudit?.complete===false){executionState="REQUIRES_VALIDATION";executionReason="Capability routing requires review before viewer execution availability can be established.";}
  else if(f.next?.viewerCanExecute&&action&&String(action.code||"")===String(lifecycle.code||"")){executionState="EXECUTABLE";executionReason="This viewer has the canonical execution capability exposed; the secured service must revalidate current truth and preconditions before mutation.";}
  else {executionState="NOT_EXPOSED";executionReason=`${String(lifecycle.label||lifecycle.code||"The next lifecycle step")} is not currently exposed as an executable capability to this viewer.`;}

  const risk=overdue?{code:"deadline_overdue",label:"Deadline overdue",level:"AT_RISK"}:warning?{code:String(warning.code||"operational_warning"),label:String(warning.message||warning.reason||"Operational warning"),level:"AT_RISK"}:null;
  const wait=actualWaiting&&waitingCondition?waitingCondition:null;
  const unblock=wait?{code:wait.code,label:`${wait.label.replace(/\.$/,"")}; continue when that condition changes.`}:null;
  const primaryLabel=String(lifecycle?.label||lifecycle?.code||"")||null;
  return Object.freeze({
    version:OPERATIONAL_READINESS_CONTRACT_VERSION,advisory:true,authoritative:false,
    missionId:Number(mission?.id||f.missionId||0)||null,
    next:Object.freeze({code:String(lifecycle?.code||"")||null,label:primaryLabel,actor:actor||null}),
    readiness:Object.freeze({state,reason,blocker,warning}),
    execution:Object.freeze({state:executionState,reason:executionReason,capability:String(capabilityExposure?.code||action?.code||lifecycle?.code||"")||null}),
    responsibility:Object.freeze({actor:responsibleActor||null}),
    waiting:Object.freeze({isActive:Boolean(wait),condition:wait,actor:wait?responsibleActor||null:null}),
    unblock:Object.freeze({condition:unblock}),
    risk:Object.freeze(risk||{}),
    liveness:Object.freeze({state:livenessState,reason:String(l.reason||l.explanation||""),reasonCode:String(l.reasonCode||f.next?.reasonCode||"")||null}),
    waitingFor,
    condition:wait?.code||null,
    reasonCode:String(l.reasonCode||f.next?.reasonCode||"")||null,
    blocker,warning,
    source:"canonical_mission_flow_and_liveness",
    safety:Object.freeze({createsTruth:false,createsAuthorization:false,changesCustody:false,changesResponsibility:false,executesAction:false})
  });
}

export function validateOperationalReadinessContract(contract){
  const problems=[];
  if(!contract?.missionId)problems.push("mission_id_missing");
  if(contract?.advisory!==true)problems.push("readiness_not_advisory");
  if(contract?.authoritative!==false)problems.push("readiness_claims_authority");
  if(contract?.next?.code&&!contract?.next?.label)problems.push("next_action_without_label");
  if(!EXECUTION_STATES.has(String(contract?.execution?.state||"")))problems.push("invalid_execution_state");
  if(contract?.execution?.state==="EXECUTABLE"&&!contract?.next?.code)problems.push("executable_without_next_step");
  if(contract?.execution?.state==="EXECUTABLE"&&!contract?.execution?.capability)problems.push("executable_without_capability");
  if(contract?.waiting?.isActive!==true&&contract?.waiting?.condition)problems.push("inactive_waiting_has_condition");
  if(contract?.waiting?.isActive===true&&!contract?.waiting?.condition)problems.push("active_waiting_without_condition");
  if(contract?.waiting?.isActive===true&&!contract?.waiting?.actor&&!contract?.waitingFor)problems.push("waiting_without_actor");
  if(contract?.waiting?.isActive===true&&!isLivenessWaiting(String(contract?.liveness?.state||"")))problems.push("waiting_state_mismatch");
  if(contract?.waiting?.isActive!==true&&contract?.waitingFor)problems.push("responsible_actor_misrepresented_as_waiting");
  if(contract?.risk?.code&&contract?.condition===contract.risk.code)problems.push("risk_misrepresented_as_unblock_condition");
  if(contract?.safety?.createsTruth!==false||contract?.safety?.executesAction!==false)problems.push("readiness_mutation_boundary_violation");
  return [...new Set(problems)];
}
