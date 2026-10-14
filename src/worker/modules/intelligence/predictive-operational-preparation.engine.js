import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.2.6 — Predictive Operational Preparation
 *
 * Read-only preparation recommendation built from existing predictive and
 * action-readiness authorities. It never creates truth, authorizes, executes,
 * persists, or mutates an operational action.
 */
const STATES=new Set(["PREPARE","INTERVENE_NOW","WATCH","NONE","UNKNOWN"]);

export function buildPredictiveOperationalPreparation({candidate=null,predictiveIntelligence=null,predictiveRiskHorizon=null,predictiveConsequence=null,predictiveInterventionWindow=null,predictiveActionReadiness=null,predictiveOperationalReadiness=null,actionAlignment=null}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||predictiveOperationalReadiness?.missionId||predictiveConsequence?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||predictiveOperationalReadiness?.status||predictiveConsequence?.status||"");
  const terminal=isLifecycleTerminal(status);
  if(terminal)return freeze({missionId,status,terminal,available:false,state:"UNKNOWN",recommendation:null,action:null,reasonCode:"mission_terminal",source:"mission_truth"});

  const consequence=predictiveConsequence?.primary||predictiveConsequence?.consequences?.[0]||null;
  const interventionState=String(predictiveInterventionWindow?.state||"UNKNOWN").toUpperCase();
  const readinessState=String(predictiveOperationalReadiness?.state||"UNKNOWN").toUpperCase();
  const actionReadinessState=String(predictiveActionReadiness?.state||"UNKNOWN").toUpperCase();
  const action=predictiveActionReadiness?.action||actionAlignment?.alignment?.currentAction||null;
  const viewerCanExecute=Boolean(predictiveActionReadiness?.viewerCanExecute??actionAlignment?.alignment?.viewerCanExecute??false);
  const predictiveAvailable=Boolean(predictiveIntelligence?.available||predictiveRiskHorizon?.available||predictiveConsequence?.available||predictiveInterventionWindow?.available);

  let state="UNKNOWN",reasonCode="preparation_unknown",recommendation=null;
  if(!predictiveAvailable||!consequence){
    state="NONE";reasonCode="no_predictive_consequence";
  }else if(readinessState==="BLOCKED"||actionReadinessState==="BLOCKED"){
    state="PREPARE";reasonCode="prepare_around_blocked_action";
    recommendation="Prepare an authorized recovery path before the predicted consequence materializes.";
  }else if(interventionState==="NOW"){
    state="INTERVENE_NOW";reasonCode="intervention_window_open";
    recommendation="Intervene now using the existing valid operational action.";
  }else if(interventionState==="PREPARE"||readinessState==="PREPARING"){
    state="PREPARE";reasonCode="approaching_predicted_consequence";
    recommendation="Prepare the existing valid operational action before the intervention window closes.";
  }else if(interventionState==="WATCH"||readinessState==="AT_RISK"){
    state="WATCH";reasonCode="monitor_predicted_consequence";
    recommendation="Watch the predicted condition and be ready to use the existing valid action if the situation progresses.";
  }else if(actionReadinessState==="READY"&&action){
    state="PREPARE";reasonCode="predictive_action_ready";
    recommendation="Prepare to use the existing valid operational action if the prediction materializes.";
  }else{
    state="UNKNOWN";reasonCode="preparation_unresolved";
  }

  const horizon=consequence?.horizon||predictiveRiskHorizon?.primary?.horizon||"UNKNOWN";
  const likelihood=consequence?.likelihood||predictiveRiskHorizon?.primary?.likelihood||"UNKNOWN";
  const severity=consequence?.severity||"UNKNOWN";
  const affected=consequence?.consequence||null;
  return freeze({
    missionId,status,terminal,available:state!=="UNKNOWN"&&state!=="NONE",state,
    recommendation,action,viewerCanExecute,reasonCode,
    preparation:{horizon,likelihood,severity,affected,interventionState,operationalReadiness:readinessState,actionReadiness:actionReadinessState},
    presentation:{
      surface:"operations_workbench",
      priority:state==="INTERVENE_NOW"?"urgent":state==="PREPARE"?"high":state==="WATCH"?"watch":"none",
      title:state==="INTERVENE_NOW"?"INTERVENE NOW":state==="PREPARE"?"PREPARE NOW":state==="WATCH"?"WATCH":"",
      consequence:affected,
      reason:recommendation,
      action:action?{label:String(action.label||action.code||""),code:String(action.code||""),viewerCanExecute}:null,
      compact:true,
      readOnly:true
    },
    source:"predictive_intelligence",
    authoritative:false,readOnly:true
  });
}
function freeze(r){return Object.freeze({...r,authoritative:false,readOnly:true,version:"1.0"});}
