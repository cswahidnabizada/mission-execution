import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.1.7 — Operational Intelligence Outcome Awareness
 *
 * Pure/read-only interpretation of authoritative before/after operational context.
 * It never changes canonical truth, authorizes, executes, or persists anything.
 */

const OUTCOMES=new Set(["RESOLVED","PROGRESSED","UNCHANGED","WORSENED","BLOCKED","WAITING","UNKNOWN"]);

export function buildOperationalOutcomeAwareness({
  before=null,
  current=null,
  actionAlignment=null,
  evidenceConfidence=null,
  history=null,
  candidate=null
}={}){
  const missionId=Number(candidate?.missionId||current?.missionId||before?.missionId||actionAlignment?.missionId||0)||null;
  const currentStatus=String(candidate?.status||current?.status||candidate?.truth?.status||"");
  const terminal=isLifecycleTerminal(currentStatus);
  const explicit=normalizeOutcome(current?.outcome||current?.result||null);
  const blockers=collectBlockers(current,before);
  const waiting=collectWaiting(current,before);
  const statusChange=compareStatus(before?.status,currentStatus);
  const progress=compareProgress(before,current);
  const riskChange=compareRisk(before,current);

  let outcome="UNKNOWN";
  let reasonCode="insufficient_evidence";
  if(terminal){ outcome=currentStatus==="Cancelled"||currentStatus==="Canceled"?"BLOCKED":"RESOLVED"; reasonCode=terminalReason(currentStatus); }
  else if(explicit){ outcome=explicit; reasonCode="authoritative_outcome_signal"; }
  else if(blockers.length){ outcome="BLOCKED"; reasonCode="active_blocker"; }
  else if(waiting){ outcome="WAITING"; reasonCode="legitimate_waiting_condition"; }
  else if(riskChange>0){ outcome="WORSENED"; reasonCode="risk_deteriorated"; }
  else if(progress>0||statusChange||riskChange<0){ outcome="PROGRESSED"; reasonCode=riskChange<0?"risk_improved":"operational_progress"; }
  else if(before&&current){ outcome="UNCHANGED"; reasonCode="no_material_change"; }

  const evidence=normalizeEvidence({before,current,history,evidenceConfidence,actionAlignment,statusChange,progress,riskChange,blockers,waiting});
  const confidence=deriveConfidence({outcome,evidence,explicit,evidenceConfidence});
  const explanation=buildExplanation({outcome,reasonCode,statusChange,progress,riskChange,blockers,waiting,actionAlignment,evidence,terminal});

  return Object.freeze({
    version:"1.0",
    missionId,
    outcome,
    reasonCode,
    confidence,
    evidenceCount:evidence.length,
    evidence,
    action:actionAlignment?.alignment?.currentAction||null,
    actor:actionAlignment?.alignment?.actor||null,
    explanation,
    authoritative:false,
    readOnly:true,
    terminal
  });
}

function normalizeOutcome(value){const v=String(value||"").toUpperCase();return OUTCOMES.has(v)?v:null;}
function terminalReason(status){return status==="Completed"||status==="Delivered"?"terminal_success":"terminal_cancellation";}
function compareStatus(before,status){const b=String(before?.status||"");return Boolean(b&&status&&b!==status);}
function compareProgress(before,current){
  const b=Number(before?.progress??before?.progressScore??NaN),c=Number(current?.progress??current?.progressScore??NaN);
  if(Number.isFinite(b)&&Number.isFinite(c))return c>b?1:c<b?-1:0;
  const bStep=Number(before?.stepIndex??before?.step??NaN),cStep=Number(current?.stepIndex??current?.step??NaN);
  if(Number.isFinite(bStep)&&Number.isFinite(cStep))return cStep>bStep?1:cStep<bStep?-1:0;
  return 0;
}
function compareRisk(before,current){
  const b=Number(before?.riskScore??before?.score??NaN),c=Number(current?.riskScore??current?.score??NaN);
  if(!Number.isFinite(b)||!Number.isFinite(c))return 0;
  return c<b?-1:c>b?1:0;
}
function collectBlockers(current,before){
  const values=[...(Array.isArray(before?.blockers)?before.blockers:[]),...(Array.isArray(current?.blockers)?current.blockers:[])];
  return (Array.isArray(current?.blockers)?current.blockers:[]).filter(Boolean).slice(0,8).map(x=>String(x.code||x.type||x.message||x));
}
function collectWaiting(current,before){
  return current?.waiting===true||Boolean(current?.waitingFor)||String(current?.state||"").toUpperCase()==="WAITING"||String(current?.liveness||"").toUpperCase()==="WAITING";
}
function normalizeEvidence({before,current,history,evidenceConfidence,actionAlignment,statusChange,progress,riskChange,blockers,waiting}){
  const out=[];
  const add=(type,source,value)=>{if(value===null||value===undefined||value==="")return;out.push({type,source,value});};
  add("status_change","canonical_truth",statusChange?`${String(before?.status||"")}→${String(current?.status||"")}`:null);
  add("progress_change","canonical_truth",progress===1?"improved":progress===-1?"regressed":null);
  add("risk_change","canonical_truth",riskChange===-1?"improved":riskChange===1?"deteriorated":null);
  if(blockers.length)add("blocker","canonical_truth",blockers.join(", "));
  if(waiting)add("waiting_condition","canonical_truth",current?.waitingFor||current?.state||"waiting");
  if(history?.summary)add("history_summary","operational_history",history.summary);
  if(evidenceConfidence?.evidenceCount)add("evidence_count","intelligence_evidence",evidenceConfidence.evidenceCount);
  if(actionAlignment?.alignment?.currentAction)add("action_context","action_authority",actionAlignment.alignment.currentAction.code||actionAlignment.alignment.currentAction.label);
  return out.slice(0,12).map(Object.freeze);
}
function deriveConfidence({outcome,evidence,explicit,evidenceConfidence}){
  if(explicit)return "HIGH";
  if(outcome==="UNKNOWN")return "LOW";
  if(evidence.length>=2)return evidenceConfidence?.confidence||"HIGH";
  if(evidence.length===1)return evidenceConfidence?.confidence||"MEDIUM";
  return "LOW";
}
function buildExplanation({outcome,reasonCode,statusChange,progress,riskChange,blockers,waiting,actionAlignment,evidence,terminal}){
  return Object.freeze({
    outcome,
    why:reasonCode,
    materialChange:Boolean(statusChange||progress||riskChange),
    blocker:blockers[0]||null,
    waitingFor:waiting?(actionAlignment?.alignment?.waitingFor||null):null,
    action:actionAlignment?.alignment?.currentAction?.label||actionAlignment?.alignment?.currentAction?.code||null,
    evidenceBacked:evidence.length>0,
    terminal
  });
}
