import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission Final Product Contract — Final Operational Product
 *
 * Read-only consolidation of the verified 9.x operational stack.
 * This is a presentation/orchestration contract only. Canonical truth,
 * liveness, authorization, custody, action authority and execution remain
 * owned by their existing secured domain services.
 */

const MODES=new Set(["ACT","PREPARE","WATCH","WAIT","ESCALATE","BLOCKED","CLOSED","STABLE"]);

export function buildFinalOperationalProduct({
  candidate=null,
  coordination=null,
  actionAlignment=null,
  outcomeAwareness=null,
  predictiveOperationalSurface=null,
  preventiveIntelligence=null,
  preventiveOutcomeAwareness=null,
  evidenceConfidence=null,
  trajectory=null,
  liveness=null
}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||coordination?.missionId||actionAlignment?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||coordination?.status||"Pending");
  const terminal=isLifecycleTerminal(status)||Boolean(coordination?.terminal||liveness?.state==="TERMINAL");
  const liveState=String(liveness?.state||coordination?.liveness?.state||"").toUpperCase();
  const alignment=String(actionAlignment?.alignment?.state||"").toUpperCase();
  const predictiveState=String(predictiveOperationalSurface?.state||"").toUpperCase();
  const preventiveState=String(preventiveIntelligence?.state||"").toUpperCase();
  const preventiveOutcome=String(preventiveOutcomeAwareness?.state||"").toUpperCase();
  const outcome=String(outcomeAwareness?.outcome||"").toUpperCase();

  const decisionQuality=resolveDecisionQuality({
    terminal,liveState,alignment,predictiveState,preventiveState,preventiveOutcome,outcome,evidenceConfidence
  });

  let mode="STABLE",reasonCode="operationally_stable";
  if(terminal){mode="CLOSED";reasonCode="mission_terminal";}
  else if(liveState==="BREACH"||liveState==="ESCALATED"){mode="ESCALATE";reasonCode=liveState.toLowerCase();}
  else if(alignment==="BLOCKED"||predictiveState==="BLOCKED"){mode="BLOCKED";reasonCode="authoritative_dependency_blocked";}
  else if(liveState==="WAITING"||alignment==="WAITING"||predictiveState==="WAITING"){mode="WAIT";reasonCode="legitimate_waiting_condition";}
  else if(preventiveOutcome==="WORSENING"||outcome==="WORSENED"){mode="ACT";reasonCode="condition_worsening";}
  else if(preventiveState==="PREVENT_NOW"||predictiveState==="INTERVENE_NOW"||alignment==="READY"){mode="ACT";reasonCode=preventiveState==="PREVENT_NOW"?"preventive_window_open":predictiveState==="INTERVENE_NOW"?"predictive_intervention_window_open":"current_action_ready";}
  else if(preventiveState==="PREPARE_TO_PREVENT"||predictiveState==="PREPARE"||predictiveState==="PREPARING"){mode="PREPARE";reasonCode="preparation_window";}
  else if(preventiveState==="WATCH"||predictiveState==="WATCH"){mode="WATCH";reasonCode="monitor_condition";}

  const action=normalizeAction(actionAlignment?.alignment?.currentAction||coordination?.unified?.primary||coordination?.primary||preventiveIntelligence?.action||predictiveOperationalSurface?.presentation?.action);
  const actor=normalizeActor(actionAlignment?.alignment?.actor||coordination?.execution?.actor||coordination?.flow?.next?.actor||predictiveOperationalSurface?.actor);
  const viewerCanExecute=Boolean(actionAlignment?.alignment?.viewerCanExecute||coordination?.unified?.primary?.viewerCanExecute||predictiveOperationalSurface?.presentation?.action?.viewerCanExecute);
  const waitingFor=actionAlignment?.alignment?.waitingFor||coordination?.liveness?.reason||null;
  const consequence=preventiveIntelligence?.predictedConsequence||predictiveOperationalSurface?.consequence||predictiveOperationalSurface?.presentation?.consequence||null;
  const evidence=normalizeEvidence(evidenceConfidence,preventiveOutcomeAwareness);
  const title=titleFor(mode);
  const summary=buildSummary({mode,action,actor,waitingFor,consequence,preventiveOutcome,trajectory,reasonCode});

  return Object.freeze({
    version:"1.0",
    missionId,status,terminal,
    mode,
    systemContract:Object.freeze({capability:"One operational product contract across the verified 9.x stack.",sourceOfTruth:"existing_domain_services",mutation:false}),
    intelligenceContract:Object.freeze({
      meaning:summary,
      severity:evidence?.severity||null,
      confidence:evidence?.confidence||"UNSPECIFIED",
      evidenceCount:Number(evidence?.evidenceCount||0),
      evidenceSufficient:Boolean(evidence?.evidenceSufficient),
      trajectory:trajectory?.trajectory||null,
      prediction:predictiveOperationalSurface?.state||null,
      prevention:preventiveIntelligence?.state||null,
      outcome:preventiveOutcomeAwareness?.state||outcome||null
    }),
    experienceContract:Object.freeze({
      surface:"operations_workbench",
      title,
      summary,
      primaryDecision:title,
      why:buildWhy({mode,reasonCode,evidence,trajectory,consequence}),
      nextAction:action?.label||null,
      actor:actor?.name||actor?.type||null,
      readOnly:true,
      compact:true
    }),
    actionContract:Object.freeze({action,viewerCanExecute,authority:"existing_secured_action_service",execution:"existing_action_surface"}),
    safetyContract:Object.freeze({authoritative:false,readOnly:true,createsTruth:false,createsAuthorization:false,createsAction:false,executesAction:false,bypassesServices:false}),
    coordination:Object.freeze({state:mode,waitingFor,actor,dependency:actionAlignment?.alignment?.dependency||coordination?.management?.completionBlocked?"authoritative_dependency":null}),
    evidence,
    reasonCode,
    decisionQuality
  });
}


function resolveDecisionQuality({terminal,liveState,alignment,predictiveState,preventiveState,preventiveOutcome,outcome,evidenceConfidence}){
  const conflicts=[];
  if(terminal && ["READY","BLOCKED","WAITING"].includes(alignment))conflicts.push("terminal_overrides_non_terminal_alignment");
  if(liveState==="WAITING" && (alignment==="READY"||predictiveState==="INTERVENE_NOW"||preventiveState==="PREVENT_NOW"))conflicts.push("waiting_overrides_action_signal");
  if(alignment==="BLOCKED" && (predictiveState==="INTERVENE_NOW"||preventiveState==="PREVENT_NOW"))conflicts.push("authoritative_block_overrides_intelligence_action_signal");
  if(preventiveOutcome==="WORSENING" && outcome==="IMPROVED")conflicts.push("outcome_signal_conflict");
  const evidenceSufficient=Boolean(evidenceConfidence?.evidenceSufficient);
  const confidence=String(evidenceConfidence?.confidence||"UNSPECIFIED").toUpperCase();
  return Object.freeze({
    state:conflicts.length?"CONSTRAINED":"COHERENT",
    conflicts:Object.freeze([...conflicts]),
    evidenceSufficient,
    confidence,
    actionRecommendationAllowed:!terminal && liveState!=="WAITING" && alignment!=="BLOCKED" && evidenceSufficient
  });
}

function normalizeAction(a){if(!a)return null;const code=String(a.code||"");if(!code)return null;return Object.freeze({code,label:String(a.label||code),viewerCanExecute:Boolean(a.viewerCanExecute)});}
function normalizeActor(a){if(!a)return null;return Object.freeze({type:String(a.type||""),id:Number(a.id||0)||null,name:String(a.name||"")});}
function normalizeEvidence(e,p){return Object.freeze({severity:e?.severity||e?.levelSeverity||null,confidence:e?.confidence||e?.level||null,evidenceCount:Number(e?.evidenceCount||e?.count||0),evidenceSufficient:Boolean(e?.evidenceSufficient),count:Number(e?.count||e?.evidenceCount||0),preventionState:p?.state||null});}
function titleFor(mode){return ({ACT:"ACT NOW",PREPARE:"PREPARE NOW",WATCH:"WATCH",WAIT:"WAIT",ESCALATE:"ESCALATE",BLOCKED:"ACTION BLOCKED",CLOSED:"MISSION CLOSED",STABLE:"NO ACTION REQUIRED"})[mode]||"REVIEW";}
function buildWhy({mode,reasonCode,evidence,trajectory,consequence}){
  const parts=[];
  if(reasonCode&&reasonCode!=="operationally_stable")parts.push(reasonCode.replaceAll("_"," "));
  if(evidence?.severity)parts.push(`severity ${String(evidence.severity).toLowerCase()}`);
  if(evidence?.confidence&&evidence.confidence!=="UNSPECIFIED")parts.push(`confidence ${String(evidence.confidence).toLowerCase()}`);
  if(trajectory?.trajectory)parts.push(`trajectory ${String(trajectory.trajectory).toLowerCase()}`);
  if(consequence)parts.push(`predicted consequence ${String(consequence).toLowerCase()}`);
  if(!parts.length)return "No higher-priority intelligence signal is established from the available evidence.";
  return `Based on ${parts.join(", ")}.`;
}

function buildSummary({mode,action,actor,waitingFor,consequence,preventiveOutcome,trajectory,reasonCode}){
  if(mode==="CLOSED")return "The mission is terminal; no further operational action is presented.";
  if(mode==="ESCALATE")return "The mission requires explicit operational review under the existing escalation path.";
  if(mode==="BLOCKED")return "The next operational action is blocked by an authoritative dependency; do not bypass it.";
  if(mode==="WAIT")return waitingFor?`The mission is waiting for ${String(waitingFor)}.`:"The mission is waiting for an authorized condition or actor.";
  if(mode==="ACT")return action?`Use ${action.label}${actor?.name?` with ${actor.name}`:""} through the existing secured action path${consequence?` to reduce the predicted ${String(consequence).toLowerCase()}`:""}.`:"A current operational response is indicated, but no new action is created by intelligence.";
  if(mode==="PREPARE")return action?`Prepare ${action.label} before the operational window closes.`:"Prepare the existing operational response; intelligence does not create a new action.";
  if(mode==="WATCH")return `Watch the condition${trajectory?.trajectory?` while risk is ${String(trajectory.trajectory).toLowerCase()}`:""}; remain ready to use the existing action if the situation changes.`;
  if(preventiveOutcome==="PREVENTION_CONFIRMED")return "Observed evidence supports improvement after the preventive response; causality is not assumed.";
  return reasonCode==="operationally_stable"?"No higher-priority operational intervention is currently indicated.":"Continue with the existing operational flow.";
}
