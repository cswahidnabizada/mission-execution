import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.3.0 — Preventive Intelligence Foundation
 *
 * Read-only preventive opportunity derived from the verified predictive chain.
 * Prevention may recommend reducing the likelihood/impact of a predicted
 * consequence, but it never creates an action, truth, authorization, or state.
 */
const STATES=new Set(["PREVENT_NOW","PREPARE_TO_PREVENT","WATCH","NO_OPPORTUNITY","UNKNOWN"]);

export function buildPreventiveIntelligenceFoundation({candidate=null,predictiveIntelligence=null,predictiveRiskHorizon=null,predictiveConsequence=null,predictiveInterventionWindow=null,predictiveActionReadiness=null,predictiveOperationalReadiness=null,predictiveOperationalPreparation=null,predictiveOperationalSurface=null,actionAlignment=null,evidenceConfidence=null}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||predictiveOperationalSurface?.missionId||predictiveOperationalReadiness?.missionId||predictiveConsequence?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||predictiveOperationalSurface?.status||predictiveOperationalReadiness?.status||predictiveConsequence?.status||"");
  const terminal=isLifecycleTerminal(status)||Boolean(predictiveOperationalSurface?.terminal||predictiveOperationalReadiness?.terminal);
  if(terminal)return freeze(empty({missionId,status,terminal,reasonCode:"mission_terminal"}));

  const prediction=primary(predictiveIntelligence?.predictions||predictiveIntelligence?.signals,predictiveIntelligence?.primary);
  const consequence=primary(predictiveConsequence?.consequences,predictiveConsequence?.primary);
  const interventionState=upper(predictiveInterventionWindow?.state);
  const prepState=upper(predictiveOperationalPreparation?.state);
  const readinessState=upper(predictiveOperationalReadiness?.state);
  const actionState=upper(predictiveActionReadiness?.state);
  const action=predictiveActionReadiness?.action||actionAlignment?.alignment?.currentAction||null;
  const viewerCanExecute=Boolean(predictiveActionReadiness?.viewerCanExecute??actionAlignment?.alignment?.viewerCanExecute??false);
  const evidence=evidenceConfidence||null;
  const hasPredictiveSignal=Boolean(prediction||consequence||predictiveIntelligence?.available||predictiveRiskHorizon?.available);

  let state="UNKNOWN",reasonCode="preventive_opportunity_unresolved",recommendation=null,opportunity=null;
  if(!hasPredictiveSignal){ state="NO_OPPORTUNITY"; reasonCode="no_predictive_signal"; }
  else if(!consequence){ state="WATCH"; reasonCode="prediction_without_consequence"; recommendation="Watch the predicted condition and use the existing operational action if a preventable consequence becomes actionable."; }
  else if((actionState==="BLOCKED"||readinessState==="BLOCKED")&&action){
    state="PREPARE_TO_PREVENT"; reasonCode="preventive_recovery_preparation";
    recommendation="Prepare the existing authorized recovery path to reduce the predicted consequence if the condition progresses.";
  } else if(interventionState==="NOW"||prepState==="INTERVENE_NOW"){
    state="PREVENT_NOW"; reasonCode="preventive_window_open";
    recommendation="Use the existing valid operational action now to reduce the likelihood or impact of the predicted consequence.";
  } else if(interventionState==="PREPARE"||prepState==="PREPARE"||readinessState==="PREPARING"){
    state="PREPARE_TO_PREVENT"; reasonCode="preventive_window_approaching";
    recommendation="Prepare the existing valid operational action before the prevention window closes.";
  } else if(interventionState==="WATCH"||prepState==="WATCH"||readinessState==="AT_RISK"){
    state="WATCH"; reasonCode="preventive_watch";
    recommendation="Watch the predicted condition and be ready to use the existing valid action if it progresses.";
  } else if(actionState==="READY"&&action){
    state="PREPARE_TO_PREVENT"; reasonCode="preventive_action_ready";
    recommendation="Prepare the existing valid operational action to reduce the predicted consequence if it materializes.";
  } else { state="WATCH"; reasonCode="preventive_signal_requires_observation"; recommendation="Watch the predicted condition; no additional preventive action is authorized by intelligence alone."; }

  opportunity={target:labelOf(prediction)||prediction?.type||null,consequence:labelOf(consequence),goal:"reduce_likelihood_or_impact",horizon:String(consequence?.horizon||predictiveRiskHorizon?.primary?.horizon||"UNKNOWN"),likelihood:String(consequence?.likelihood||predictiveRiskHorizon?.primary?.likelihood||"UNKNOWN"),severity:String(consequence?.severity||"UNKNOWN")};
  return freeze({missionId,status,terminal,available:state!=="NO_OPPORTUNITY"&&state!=="UNKNOWN",state,targetCondition:opportunity.target,predictedConsequence:opportunity.consequence,preventionWindow:{state:interventionState,window:predictiveInterventionWindow?.window||null,horizon:opportunity.horizon},preventiveOpportunity:opportunity,recommendation,action:action?{label:String(action.label||action.code||"ACTION"),code:String(action.code||""),viewerCanExecute}:null,evidence:evidence?{confidence:evidence.confidence||evidence.level||null,count:Number(evidence.count||evidence.evidenceCount||0)}:null,reasonCode,presentation:{surface:"operations_workbench",compact:true,title:state==="PREVENT_NOW"?"PREVENT NOW":state==="PREPARE_TO_PREVENT"?"PREPARE TO PREVENT":state==="WATCH"?"WATCH":"",summary:recommendation,consequence:opportunity.consequence,horizon:opportunity.horizon,window:interventionState,action:action?{label:String(action.label||action.code||"ACTION"),code:String(action.code||""),viewerCanExecute}:null,readOnly:true},authoritative:false,readOnly:true});
}
function empty(x){return {...x,available:false,state:"NO_OPPORTUNITY",targetCondition:null,predictedConsequence:null,preventionWindow:null,preventiveOpportunity:null,recommendation:null,action:null,evidence:null,presentation:{surface:"operations_workbench",compact:true,title:"",summary:null,consequence:null,horizon:"UNKNOWN",window:"UNKNOWN",action:null,readOnly:true}};}
function upper(v){return String(v||"UNKNOWN").toUpperCase();}
function primary(list,preferred){if(preferred)return preferred;return Array.isArray(list)&&list.length?list[0]:null;}
function labelOf(x){return String(x?.consequence||x?.label||x?.reason||x?.description||x?.type||"");}
function freeze(r){return Object.freeze({...r,authoritative:false,readOnly:true,version:"1.0"});}
