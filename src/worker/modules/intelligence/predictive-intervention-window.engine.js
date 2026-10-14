import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.2.3 — Predictive Intervention Window & Preparation Awareness
 *
 * Deterministic, read-only interpretation of existing predictive horizon and
 * consequence signals. It identifies when preparation may be appropriate,
 * without creating action authority, truth, authorization, or execution.
 */
const STATES=new Set(["NOW","PREPARE","WATCH","NONE","UNKNOWN"]);
const HORIZONS=new Set(["IMMEDIATE","NEAR_TERM","SHORT_TERM","MEDIUM_TERM","LONG_TERM","UNKNOWN"]);

export function buildPredictiveInterventionWindow({candidate=null,predictiveRiskHorizon=null,predictiveConsequence=null,actionAlignment=null}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||predictiveRiskHorizon?.missionId||predictiveConsequence?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||predictiveRiskHorizon?.status||predictiveConsequence?.status||"");
  const terminal=isLifecycleTerminal(status);
  if(terminal) return freeze({missionId,status,terminal,available:false,state:"NONE",window:null,preparation:null,reasonCode:null});

  const signals=Array.isArray(predictiveRiskHorizon?.signals)?predictiveRiskHorizon.signals:[];
  const consequences=Array.isArray(predictiveConsequence?.consequences)?predictiveConsequence.consequences:[];
  const primary=predictiveConsequence?.primary||consequences[0]||null;
  const horizon=normalize(primary?.horizon||predictiveRiskHorizon?.primary?.horizon);
  const likelihood=level(primary?.likelihood||predictiveRiskHorizon?.primary?.likelihood);
  const escalation=String(predictiveRiskHorizon?.escalation?.state||"NONE").toUpperCase();
  const state=deriveState({horizon,likelihood,escalation,hasConsequence:Boolean(primary),signalCount:signals.length});
  const currentAction=actionAlignment?.alignment?.currentAction||null;
  const preparation=state==="NONE"||state==="UNKNOWN"?null:(primary?.recommendedPreparation||currentAction?.label||currentAction?.code||null);
  const window=state==="NONE"||state==="UNKNOWN"?null:{state,horizon,likelihood,escalation};
  return freeze({missionId,status,terminal,available:Boolean(window),state,window,preparation,reasonCode:primary?.reasonCode||predictiveRiskHorizon?.primary?.reasonCode||null,sourcePrediction:primary?.sourcePrediction||predictiveRiskHorizon?.primary?.type||null,authoritative:false,readOnly:true});
}

function deriveState({horizon,likelihood,escalation,hasConsequence,signalCount}){
  if(!hasConsequence && !signalCount) return "NONE";
  if(horizon==="UNKNOWN") return "UNKNOWN";
  if(horizon==="IMMEDIATE" && (likelihood==="HIGH"||escalation==="ESCALATING")) return "NOW";
  if(horizon==="IMMEDIATE"||horizon==="NEAR_TERM") return "PREPARE";
  if(horizon==="SHORT_TERM" && likelihood!=="LOW") return "PREPARE";
  if(escalation==="ESCALATING") return "WATCH";
  return "WATCH";
}
function normalize(v){const x=String(v||"").toUpperCase();return HORIZONS.has(x)?x:"UNKNOWN";}
function level(v){const x=String(v||"").toUpperCase();return new Set(["LOW","MEDIUM","HIGH"]).has(x)?x:"MEDIUM";}
function freeze(r){return Object.freeze({...r,window:r.window?Object.freeze(r.window):null,authoritative:false,readOnly:true,version:"1.0"});}
