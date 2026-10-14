import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.2.0 — Predictive Intelligence Foundation
 *
 * Bounded, deterministic, read-only predictive interpretation.
 * Predictions are never canonical truth, authorization, or execution authority.
 */

const LEVELS=new Set(["LOW","MEDIUM","HIGH"]);
const TYPES=new Set(["RISK_ESCALATION","DELAY","BLOCKER_PERSISTENCE","RESOLUTION_LIKELIHOOD","WAITING_PERSISTENCE","NO_PREDICTION"]);

export function buildPredictiveIntelligenceFoundation({
  candidate=null,
  trajectory=null,
  outcomeAwareness=null,
  actionAlignment=null,
  evidenceConfidence=null,
  prediction=null
}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||trajectory?.missionId||outcomeAwareness?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||"");
  const terminal=isLifecycleTerminal(status);

  if(terminal){
    return freezeResult({missionId,status,signals:[],primary:null,terminal});
  }

  const explicit=normalizeExplicitPrediction(prediction);
  const signals=explicit.length?explicit:deriveSignals({trajectory,outcomeAwareness,actionAlignment,evidenceConfidence});
  const primary=signals[0]||null;

  return freezeResult({missionId,status,signals,primary,terminal});
}

function deriveSignals({trajectory,outcomeAwareness,actionAlignment,evidenceConfidence}){
  const out=[];
  const riskDirection=String(trajectory?.direction||trajectory?.trend||trajectory?.trajectory||"").toUpperCase();
  const outcome=String(outcomeAwareness?.outcome||"").toUpperCase();
  const action=actionAlignment?.alignment?.currentAction||null;
  const confidence=evidenceConfidence?.confidence||outcomeAwareness?.confidence||"MEDIUM";

  if(riskDirection.includes("WORSEN")||riskDirection.includes("RISING")||outcome==="WORSENED"){
    out.push(signal({type:"RISK_ESCALATION",horizon:"NEAR_TERM",likelihood:level(confidence),consequence:"operational_risk_may_increase",reasonCode:"risk_trajectory_or_outcome_deterioration",evidence:2,prepare:action?.label||action?.code||null}));
  }
  if(outcome==="BLOCKED"){
    out.push(signal({type:"BLOCKER_PERSISTENCE",horizon:"NEAR_TERM",likelihood:level(confidence),consequence:"current_progress_may_remain_blocked",reasonCode:"active_blocker_without_resolving_change",evidence:Math.max(1,Number(outcomeAwareness?.evidenceCount||0)),prepare:action?.label||action?.code||null}));
  }
  if(outcome==="WAITING"){
    out.push(signal({type:"WAITING_PERSISTENCE",horizon:"NEAR_TERM",likelihood:level(confidence),consequence:"mission_may_remain_waiting",reasonCode:"legitimate_waiting_condition",evidence:Math.max(1,Number(outcomeAwareness?.evidenceCount||0)),prepare:action?.label||action?.code||null}));
  }
  if(outcome==="PROGRESSED" && action){
    out.push(signal({type:"RESOLUTION_LIKELIHOOD",horizon:"NEAR_TERM",likelihood:level(confidence),consequence:"current_operational_progress_is_likely_to_continue",reasonCode:"positive_outcome_with_valid_action_context",evidence:Math.max(1,Number(outcomeAwareness?.evidenceCount||0)),prepare:action.label||action.code||null}));
  }
  if(outcome==="UNCHANGED" && action){
    out.push(signal({type:"DELAY",horizon:"NEAR_TERM",likelihood:level(confidence),consequence:"mission_may_fail_to_progress_without_change",reasonCode:"no_material_change_after_action_context",evidence:Math.max(1,Number(outcomeAwareness?.evidenceCount||0)),prepare:action.label||action.code||null}));
  }
  return out;
}

function normalizeExplicitPrediction(prediction){
  const list=Array.isArray(prediction)?prediction:(prediction?[prediction]:[]);
  return list.map(p=>{
    const type=String(p?.type||"").toUpperCase();
    if(!TYPES.has(type)||type==="NO_PREDICTION")return null;
    return signal({type,horizon:p.horizon||"NEAR_TERM",likelihood:p.likelihood||p.confidence||"MEDIUM",consequence:p.consequence||null,reasonCode:p.reasonCode||"explicit_predictive_signal",evidence:Number(p.evidence||p.evidenceCount||0),prepare:p.prepare||p.recommendedPreparation||null});
  }).filter(Boolean).slice(0,8);
}

function level(value){const v=String(value||"").toUpperCase();return LEVELS.has(v)?v:"MEDIUM";}
function signal({type,horizon,likelihood,consequence,reasonCode,evidence,prepare}){
  return Object.freeze({type,horizon:String(horizon),likelihood:level(likelihood),consequence,reasonCode,evidenceCount:Math.max(0,Number(evidence||0)),recommendedPreparation:prepare,authoritative:false,readOnly:true});
}
function freezeResult({missionId,status,signals,primary,terminal}){
  return Object.freeze({version:"1.0",missionId,status,available:Boolean(signals.length),signals:Object.freeze(signals),primary,terminal,authoritative:false,readOnly:true});
}
