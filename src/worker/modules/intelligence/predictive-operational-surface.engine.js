import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.2.7 — Predictive Operational Surface
 *
 * Holistic, read-only consolidation of the 9.2 predictive chain into one
 * operator-facing contract. It does not create truth, authorize, execute,
 * persist, or mutate operational state.
 */
const PREP_PRIORITY={INTERVENE_NOW:100,PREPARE:80,WATCH:50,NONE:0,UNKNOWN:0};

export function buildPredictiveOperationalSurface({candidate=null,predictiveIntelligence=null,predictiveRiskHorizon=null,predictiveConsequence=null,predictiveInterventionWindow=null,predictiveActionReadiness=null,predictiveOperationalReadiness=null,predictiveOperationalPreparation=null,actionAlignment=null,evidenceConfidence=null}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||predictiveOperationalPreparation?.missionId||predictiveOperationalReadiness?.missionId||predictiveConsequence?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||predictiveOperationalPreparation?.status||predictiveOperationalReadiness?.status||predictiveConsequence?.status||"");
  const terminal=isLifecycleTerminal(status)||Boolean(predictiveOperationalPreparation?.terminal||predictiveOperationalReadiness?.terminal);
  if(terminal)return freeze({missionId,status,terminal,available:false,state:"NONE",current:null,prediction:null,consequence:null,window:null,readiness:null,action:null,evidence:null,presentation:emptyPresentation(),reasonCode:"mission_terminal"});

  const prepState=String(predictiveOperationalPreparation?.state||"UNKNOWN").toUpperCase();
  const readinessState=String(predictiveOperationalReadiness?.state||"UNKNOWN").toUpperCase();
  const actionState=String(predictiveActionReadiness?.state||"UNKNOWN").toUpperCase();
  const interventionState=String(predictiveInterventionWindow?.state||"UNKNOWN").toUpperCase();
  const prediction=primary(predictiveIntelligence?.predictions||predictiveIntelligence?.signals,predictiveIntelligence?.primary);
  const consequence=primary(predictiveConsequence?.consequences,predictiveConsequence?.primary);
  const action=predictiveActionReadiness?.action||actionAlignment?.alignment?.currentAction||null;
  const actor=predictiveActionReadiness?.actor||actionAlignment?.alignment?.actor||null;
  const evidence=evidenceConfidence||null;
  const state=deriveState({prepState,readinessState,actionState,interventionState,hasPrediction:Boolean(prediction),hasConsequence:Boolean(consequence)});
  const available=state!=="NONE"&&state!=="UNKNOWN";
  const reasonCode=String(predictiveOperationalPreparation?.reasonCode||predictiveOperationalReadiness?.reasonCode||predictiveConsequence?.reasonCode||"predictive_surface");
  const title=state==="INTERVENE_NOW"?"INTERVENE NOW":state==="PREPARE"?"PREPARE NOW":state==="WATCH"?"WATCH":state==="BLOCKED"?"ACTION BLOCKED":state==="WAITING"?"WAITING":"";
  const recommendation=String(predictiveOperationalPreparation?.recommendation||"");
  const presentation={surface:"operations_workbench",compact:true,title,summary:recommendation||consequence?.consequence||null,prediction:prediction?labelOf(prediction):null,consequence:consequence?labelOf(consequence):null,horizon:String(consequence?.horizon||predictiveRiskHorizon?.primary?.horizon||"UNKNOWN"),window:interventionState,readiness:readinessState,action:action?{label:String(action.label||action.code||"ACTION"),code:String(action.code||""),viewerCanExecute:Boolean(predictiveActionReadiness?.viewerCanExecute??actionAlignment?.alignment?.viewerCanExecute??false)}:null,actor:actor?{type:String(actor.type||""),id:Number(actor.id||0)||null,name:String(actor.name||"")}:null,evidence:evidence?{confidence:evidence.confidence||evidence.level||null,count:Number(evidence.count||evidence.evidenceCount||0)}:null,reason:reasonCode};
  return freeze({missionId,status,terminal,available,state,current:{readiness:readinessState,actionReadiness:actionState,intervention:interventionState,preparation:prepState},prediction,consequence,window:predictiveInterventionWindow?.window||null,readiness:predictiveOperationalReadiness?.summary||null,action,actor,evidence,reasonCode,presentation,authoritative:false,readOnly:true});
}
function deriveState({prepState,readinessState,actionState,interventionState,hasPrediction,hasConsequence}){
  if(prepState==="INTERVENE_NOW")return "INTERVENE_NOW";
  if(prepState==="PREPARE")return "PREPARE";
  if(actionState==="BLOCKED"||readinessState==="BLOCKED")return "BLOCKED";
  if(actionState==="WAITING"||readinessState==="WAITING")return "WAITING";
  if(prepState==="WATCH"||interventionState==="WATCH"||readinessState==="AT_RISK")return "WATCH";
  if(hasPrediction||hasConsequence)return "WATCH";
  return "NONE";
}
function primary(list,preferred){if(preferred)return preferred;return Array.isArray(list)&&list.length?list[0]:null;}
function labelOf(x){return String(x?.consequence||x?.label||x?.reason||x?.description||x?.type||"");}
function emptyPresentation(){return {surface:"operations_workbench",compact:true,title:"",summary:null,prediction:null,consequence:null,horizon:"UNKNOWN",window:"UNKNOWN",readiness:"UNKNOWN",action:null,actor:null,evidence:null,reason:"mission_terminal"};}
function freeze(r){return Object.freeze({...r,current:Object.freeze(r.current||{}),presentation:Object.freeze(r.presentation||{}),authoritative:false,readOnly:true,version:"1.0"});}
