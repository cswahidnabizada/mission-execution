import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.2.5 — Predictive Operational Readiness
 *
 * Read-only mission-level interpretation of predictive consequence,
 * intervention window, and existing action readiness. It never creates
 * canonical truth, authorization, execution, persistence, or mutation.
 */
const STATES=new Set(["READY","PREPARING","AT_RISK","BLOCKED","WAITING","UNKNOWN"]);
const HORIZONS=new Set(["IMMEDIATE","NEAR_TERM","SHORT_TERM","MEDIUM_TERM","LONG_TERM","UNKNOWN"]);
const LEVELS=new Set(["LOW","MEDIUM","HIGH"]);

export function buildPredictiveOperationalReadiness({candidate=null,predictiveIntelligence=null,predictiveRiskHorizon=null,predictiveConsequence=null,predictiveInterventionWindow=null,predictiveActionReadiness=null,actionAlignment=null,readiness=null}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||predictiveActionReadiness?.missionId||predictiveConsequence?.missionId||predictiveRiskHorizon?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||predictiveActionReadiness?.status||predictiveConsequence?.status||predictiveRiskHorizon?.status||"");
  const terminal=isLifecycleTerminal(status);
  if(terminal)return freeze({missionId,status,terminal,available:false,state:"UNKNOWN",summary:null,signals:[],reasonCode:"mission_terminal"});

  const consequence=normalizeConsequence(predictiveConsequence?.primary||predictiveConsequence?.consequences?.[0]);
  const interventionState=String(predictiveInterventionWindow?.state||"UNKNOWN").toUpperCase();
  const actionState=String(predictiveActionReadiness?.state||"UNKNOWN").toUpperCase();
  const actionAvailable=Boolean(predictiveActionReadiness?.available||actionAlignment?.alignment?.currentAction);
  const missionReadinessState=String(readiness?.readiness||readiness?.state||"").toUpperCase();
  const predictiveAvailable=Boolean(predictiveIntelligence?.available||predictiveRiskHorizon?.available||predictiveConsequence?.available||predictiveInterventionWindow?.available);

  let state="UNKNOWN",reasonCode="predictive_readiness_unknown";
  if(!predictiveAvailable && !consequence){
    state="UNKNOWN"; reasonCode="no_predictive_signal";
  }else if(actionState==="BLOCKED" || missionReadinessState==="BLOCKED"){
    state="BLOCKED"; reasonCode=predictiveActionReadiness?.reasonCode||"action_or_mission_blocked";
  }else if(actionState==="WAITING"){
    state="WAITING"; reasonCode=predictiveActionReadiness?.reasonCode||"action_waiting";
  }else if(interventionState==="NOW" || (consequence?.severity==="HIGH" && consequence?.horizon==="IMMEDIATE")){
    state="AT_RISK"; reasonCode=consequence?.reasonCode||"immediate_predicted_consequence";
  }else if(interventionState==="PREPARE" || (consequence?.severity==="HIGH" && consequence?.horizon!=="LONG_TERM")){
    state="PREPARING"; reasonCode=consequence?.reasonCode||"approaching_predicted_consequence";
  }else if(interventionState==="WATCH" || consequence?.severity==="MEDIUM"){
    state="AT_RISK"; reasonCode=consequence?.reasonCode||"predicted_consequence_requires_watch";
  }else if(actionState==="READY" && actionAvailable){
    state="READY"; reasonCode=predictiveActionReadiness?.reasonCode||"predictive_action_ready";
  }else if(missionReadinessState==="WAITING"){
    state="WAITING"; reasonCode="mission_readiness_waiting";
  }else{
    state="UNKNOWN";
  }

  const summary=state==="UNKNOWN"?null:{state,consequence:consequence?.consequence||null,horizon:consequence?.horizon||normalizeHorizon(predictiveRiskHorizon?.primary?.horizon),likelihood:consequence?.likelihood||normalizeLevel(predictiveRiskHorizon?.primary?.likelihood),intervention:interventionState,actionReadiness:actionState};
  const signals=[];
  if(consequence)signals.push({type:consequence.type,impact:consequence.impact,severity:consequence.severity,horizon:consequence.horizon,likelihood:consequence.likelihood,reasonCode:consequence.reasonCode});
  return freeze({missionId,status,terminal,available:state!=="UNKNOWN",state,summary,signals,actionReadiness:{state:actionState,available:actionAvailable,action:predictiveActionReadiness?.action||actionAlignment?.alignment?.currentAction||null,viewerCanExecute:Boolean(predictiveActionReadiness?.viewerCanExecute??actionAlignment?.alignment?.viewerCanExecute??false)},intervention:{state:interventionState,available:Boolean(predictiveInterventionWindow?.available)},reasonCode,authoritative:false,readOnly:true});
}

function normalizeConsequence(c){
  if(!c)return null;
  return {type:String(c.type||"UNKNOWN").toUpperCase(),impact:String(c.impact||"OPERATION").toUpperCase(),severity:normalizeLevel(c.severity),horizon:normalizeHorizon(c.horizon),likelihood:normalizeLevel(c.likelihood),consequence:String(c.consequence||""),reasonCode:String(c.reasonCode||"predicted_consequence")};
}
function normalizeHorizon(v){const x=String(v||"").toUpperCase();return HORIZONS.has(x)?x:"UNKNOWN";}
function normalizeLevel(v){const x=String(v||"").toUpperCase();return LEVELS.has(x)?x:"MEDIUM";}
function freeze(r){if(!STATES.has(r.state))r.state="UNKNOWN";return Object.freeze({...r,summary:r.summary?Object.freeze(r.summary):null,signals:Object.freeze((r.signals||[]).map(Object.freeze)),actionReadiness:Object.freeze(r.actionReadiness),intervention:Object.freeze(r.intervention),authoritative:false,readOnly:true,version:"1.0"});}
