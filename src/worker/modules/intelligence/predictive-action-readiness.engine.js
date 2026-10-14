import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.2.4 — Predictive Action Readiness
 *
 * Read-only adapter that determines whether the already-authoritative current
 * action is ready in the context of a predictive intervention window.
 * It never creates, authorizes, executes, persists, or mutates an action.
 */
const STATES=new Set(["READY","NOT_READY","WAITING","BLOCKED","UNKNOWN"]);

export function buildPredictiveActionReadiness({candidate=null,predictiveInterventionWindow=null,predictiveConsequence=null,actionAlignment=null,executionHandoff=null,readiness=null,actionContract=null,missionFlow=null}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||actionAlignment?.missionId||predictiveInterventionWindow?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||actionContract?.status||missionFlow?.status||predictiveInterventionWindow?.status||"");
  const terminal=isLifecycleTerminal(status)||Boolean(actionContract?.terminal||missionFlow?.terminal);
  if(terminal)return freeze({missionId,status,terminal,available:false,state:"UNKNOWN",action:null,actor:null,viewerCanExecute:false,reasonCode:"mission_terminal",source:"mission_flow"});

  const alignment=actionAlignment?.alignment||{};
  const action=alignment.currentAction||normalizeAction(actionContract?.primary||executionHandoff?.nextAction||missionFlow?.next?.action);
  const actor=alignment.actor||normalizeActor(missionFlow?.next?.actor||executionHandoff?.nextActor||action?.actor);
  const viewerCanExecute=Boolean(alignment.viewerCanExecute??executionHandoff?.canViewerExecute??missionFlow?.next?.viewerCanExecute??false);
  const alignmentState=String(alignment.state||"").toUpperCase();
  const interventionState=String(predictiveInterventionWindow?.state||"UNKNOWN").toUpperCase();
  const interventionAvailable=Boolean(predictiveInterventionWindow?.available);
  const readinessState=String(readiness?.readiness||"").toUpperCase();
  const executionState=String(executionHandoff?.state||"").toUpperCase();

  let state="UNKNOWN",reasonCode=null;
  if(!action){
    state=alignmentState==="WAITING"||executionState==="WAITING"?"WAITING":"UNKNOWN";
    reasonCode=alignment.reasonCode||executionHandoff?.handoffReason||"no_authoritative_action";
  }else if(alignmentState==="BLOCKED"||readinessState==="BLOCKED"||executionState==="BLOCKED"){
    state="BLOCKED"; reasonCode=alignment.reasonCode||executionHandoff?.handoffReason||"action_blocked";
  }else if(alignmentState==="WAITING"||executionState==="WAITING"||alignment.waitingFor){
    state="WAITING"; reasonCode=alignment.reasonCode||executionHandoff?.handoffReason||"action_waiting";
  }else if(readinessState==="BLOCKED"){
    state="BLOCKED"; reasonCode="mission_readiness_blocked";
  }else if(!viewerCanExecute && alignmentState!=="READY"){
    state="WAITING"; reasonCode=alignment.reasonCode||"viewer_not_current_actor";
  }else if(interventionState==="UNKNOWN"&&!interventionAvailable){
    state="UNKNOWN"; reasonCode="intervention_window_unknown";
  }else if(alignmentState==="READY" && viewerCanExecute){
    state="READY"; reasonCode=alignment.reasonCode||"action_authority_ready";
  }else{
    state="UNKNOWN"; reasonCode="action_readiness_unresolved";
  }

  const predictiveContext={
    interventionState:interventionState||"UNKNOWN",
    interventionAvailable,
    consequence:predictiveConsequence?.primary||predictiveConsequence?.consequences?.[0]||null
  };
  return freeze({missionId,status,terminal,available:Boolean(action),state,action,actor,viewerCanExecute,waitingFor:alignment.waitingFor||executionHandoff?.waitingFor||null,reasonCode,predictiveContext,source:alignment.source||"action_authority",authoritative:false,readOnly:true});
}
function normalizeAction(action){
  if(!action)return null;
  return Object.freeze({code:String(action.code||""),label:String(action.label||action.code||""),reasonCode:String(action.reasonCode||action.reason||""),source:action.source||null});
}
function normalizeActor(actor){
  if(!actor)return null;
  return Object.freeze({type:String(actor.type||""),id:Number(actor.id||0)||null,name:String(actor.name||"")});
}
function freeze(r){
  if(!STATES.has(r.state))r.state="UNKNOWN";
  return Object.freeze({...r,authoritative:false,readOnly:true,version:"1.0"});
}
