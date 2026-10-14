import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.3.1 — Preventive Outcome Awareness
 *
 * Read-only interpretation of what happened after a preventive opportunity
 * was surfaced or an existing action was used. It never proves causality,
 * changes truth, or creates an action.
 */
const STATES=new Set(["PREVENTION_CONFIRMED","IMPROVING","UNCHANGED","WORSENING","PENDING","UNKNOWN"]);

export function buildPreventiveOutcomeAwareness({candidate=null,preventiveIntelligence=null,outcomeAwareness=null,evidenceConfidence=null,history=null,operationalEvents=[]}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||preventiveIntelligence?.missionId||outcomeAwareness?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||preventiveIntelligence?.status||outcomeAwareness?.status||"");
  const terminal=isLifecycleTerminal(status)||Boolean(outcomeAwareness?.terminal);
  if(terminal)return freeze(empty({missionId,status,terminal,reasonCode:"mission_terminal"}));

  const observed=readOutcome(outcomeAwareness);
  const eventSignal=readEventSignal(operationalEvents,preventiveIntelligence);
  const evidence=evidenceConfidence||null;
  const evidenceCount=Number(evidence?.count||evidence?.evidenceCount||0);
  const opportunityState=String(preventiveIntelligence?.state||"UNKNOWN").toUpperCase();
  const hasOpportunity=Boolean(preventiveIntelligence?.available)&&opportunityState!=="NO_OPPORTUNITY";

  let state="UNKNOWN",reasonCode="preventive_outcome_unresolved",summary="",direction="UNKNOWN";
  if(!hasOpportunity){
    state="UNKNOWN"; reasonCode="no_preventive_opportunity"; summary="No preventive opportunity is currently available to evaluate.";
  } else if(observed.pending||(!observed.hasOutcome&&!eventSignal.hasSignal)){
    state="PENDING"; reasonCode="preventive_outcome_pending"; summary="Watch the mission for evidence of whether the preventive response changed the predicted condition."; direction="PENDING";
  } else if(observed.direction==="IMPROVING"||eventSignal.direction==="IMPROVING"){
    state=evidenceCount>0?"PREVENTION_CONFIRMED":"IMPROVING";
    reasonCode=evidenceCount>0?"preventive_effect_supported":"preventive_condition_improving";
    summary=evidenceCount>0?"Observed evidence supports improvement after the preventive response; causality is not assumed.":"The predicted condition is improving after the preventive response; continue verifying the outcome.";
    direction="IMPROVING";
  } else if(observed.direction==="WORSENING"||eventSignal.direction==="WORSENING"){
    state="WORSENING"; reasonCode="preventive_condition_worsening"; summary="The predicted condition is worsening; reassess the existing authorized operational response."; direction="WORSENING";
  } else if(observed.direction==="UNCHANGED"||eventSignal.direction==="UNCHANGED"){
    state="UNCHANGED"; reasonCode="preventive_condition_unchanged"; summary="The predicted condition has not materially improved; continue with the existing operational decision surface."; direction="UNCHANGED";
  } else {
    state="UNKNOWN"; reasonCode="preventive_outcome_unresolved"; summary="Outcome evidence is insufficient to determine the effect of prevention.";
  }

  return freeze({missionId,status,terminal,available:state!=="UNKNOWN",state,direction,predictedConsequence:preventiveIntelligence?.predictedConsequence||null,preventiveAction:preventiveIntelligence?.action||null,observation:{hasOutcome:observed.hasOutcome,direction:observed.direction,source:observed.source||eventSignal.source||null},evidence:evidence?{confidence:evidence.confidence||evidence.level||null,count:evidenceCount}:null,summary,reasonCode,presentation:{surface:"operations_workbench",compact:true,title:titleFor(state),summary,direction,readOnly:true},authoritative:false,readOnly:true});
}

function readOutcome(o){
  const direction=String(o?.direction||o?.trend||o?.outcome?.direction||o?.signal?.direction||"").toUpperCase();
  const hasOutcome=Boolean(o?.available&&o?.outcome||o?.direction||o?.trend||o?.signal||o?.result);
  const pending=Boolean(o?.pending||o?.state==="PENDING");
  return {hasOutcome,direction:["IMPROVING","WORSENING","UNCHANGED"].includes(direction)?direction:"",pending,source:o?.source||o?.outcome?.source||null};
}
function readEventSignal(events,preventive){
  const actionCode=String(preventive?.action?.code||"");
  let best=null;
  for(const e of Array.isArray(events)?events:[]){
    const text=String(e?.type||e?.code||e?.eventType||e?.name||"").toUpperCase();
    if(actionCode&&String(e?.actionCode||e?.action?.code||"")===actionCode)best=e;
    else if(/PREVENT|RECOVER|RESOLVE|INTERVENE/.test(text))best=e;
  }
  if(!best)return {hasSignal:false,direction:"",source:null};
  const direction=String(best?.direction||best?.outcomeDirection||best?.trend||"").toUpperCase();
  return {hasSignal:true,direction:["IMPROVING","WORSENING","UNCHANGED"].includes(direction)?direction:"",source:"operational_event"};
}
function titleFor(state){return ({PREVENTION_CONFIRMED:"PREVENTION IMPROVING",IMPROVING:"PREVENTION IMPROVING",UNCHANGED:"PREVENTION UNCHANGED",WORSENING:"PREVENTION NOT WORKING",PENDING:"VERIFY PREVENTION",UNKNOWN:""})[state]||"";}
function empty(x){return {...x,available:false,state:"UNKNOWN",direction:"UNKNOWN",predictedConsequence:null,preventiveAction:null,observation:{hasOutcome:false,direction:"",source:null},evidence:null,summary:null,reasonCode:"",presentation:{surface:"operations_workbench",compact:true,title:"",summary:null,direction:"UNKNOWN",readOnly:true}};}
function freeze(r){return Object.freeze({...r,authoritative:false,readOnly:true,version:"1.0"});}
