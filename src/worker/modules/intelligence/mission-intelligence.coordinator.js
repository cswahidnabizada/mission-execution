import {buildMissionConditions} from "./mission-conditions.js";
import {buildMissionContext} from "./mission-context.js";
import {deriveMissionFlow} from "./mission-flow.engine.js";
import {deriveMissionHealth} from "./mission-health.engine.js";
import {buildFocusRecommendation} from "./focus.engine.js";
import {attentionFromHealthSignal,attentionLevelFromScore} from "./attention-policy.engine.js";
import {buildMissionSituations,situationEvents} from "./mission-situation.engine.js";
import {buildTvContract} from "./tv-contract.engine.js";
import {deriveOperationalRiskTrajectory} from "./operational-risk-trajectory.engine.js";
import {buildActionDecisionAlignment} from "./action-decision-alignment.engine.js";
import {buildOperationalIntelligenceEvidence} from "./operational-intelligence-evidence.engine.js";
import {buildOperationalOutcomeAwareness} from "./operational-outcome-awareness.engine.js";
import {buildPredictiveIntelligenceFoundation} from "./predictive-intelligence.foundation.engine.js";
import {buildPredictiveRiskHorizon} from "./predictive-risk-horizon.engine.js";
import {buildPredictiveConsequence} from "./predictive-consequence.engine.js";
import {buildPredictiveInterventionWindow} from "./predictive-intervention-window.engine.js";
import {buildPredictiveActionReadiness} from "./predictive-action-readiness.engine.js";
import {buildPredictiveOperationalReadiness} from "./predictive-operational-readiness.engine.js";
import {buildPredictiveOperationalPreparation} from "./predictive-operational-preparation.engine.js";
import {buildPredictiveOperationalSurface} from "./predictive-operational-surface.engine.js";
import {buildPreventiveIntelligenceFoundation} from "./preventive-intelligence.foundation.engine.js";
import {buildPreventiveOutcomeAwareness} from "./preventive-outcome-awareness.engine.js";
import {buildFinalOperationalProduct} from "./final-operational-product.engine.js";
import {operationalMissionHref} from "./operational-mission-route.js";

/**
 * Read-only coordinator. It never writes mission state and never owns another engine's rules.
 * Its only job is to normalize engine outputs into one UI/notification contract.
 */
export function coordinateMissionIntelligence({items=[],summary={},focus=null,awareness=null,audience="tenant",operationalEvents=[]}={}){
  const top=items[0]||null;
  const normalizedFocus=focus||buildFocusRecommendation(items,{role:audience});
  if(!top&&!normalizedFocus?.available){
    const situations=situationContract([],enrichEventsWithMissionMeta(mergeEvents([],operationalEvents,null),[]),null);
    const base={
      available:false,audience,missionId:null,reference:"",flow:null,perspective:null,status:null,statusLabel:null,
      health:{state:"healthy",riskScore:0,summary:"No mission currently needs attention."},
      attention:{level:"none",score:0,total:Number(summary.total||0),reason:""},
      priority:{level:"none",score:0},marketplace:null,focus:normalizedFocus||{available:false},
      ...situations,awareness:normalizeAwareness(awareness),
      notification:{dedupeMissionId:null,suppressDuplicateToast:false},
      trajectory:null,
      actionAlignment:buildActionDecisionAlignment({candidate:{missionId:null,status:null}}),
      evidenceConfidence:buildOperationalIntelligenceEvidence({candidate:{missionId:null,status:null}}),
      outcomeAwareness:buildOperationalOutcomeAwareness({candidate:{missionId:null,status:null}}),
      predictiveIntelligence:buildPredictiveIntelligenceFoundation({candidate:{missionId:null,status:null}}),
      predictiveRiskHorizon:buildPredictiveRiskHorizon({candidate:{missionId:null,status:null}}),
      predictiveConsequence:buildPredictiveConsequence({candidate:{missionId:null,status:null}}),
      predictiveInterventionWindow:buildPredictiveInterventionWindow({candidate:{missionId:null,status:null}}),
      predictiveActionReadiness:buildPredictiveActionReadiness({candidate:{missionId:null,status:null}}),
      predictiveOperationalReadiness:buildPredictiveOperationalReadiness({candidate:{missionId:null,status:null}}),
      predictiveOperationalPreparation:buildPredictiveOperationalPreparation({candidate:{missionId:null,status:null}}),
      predictiveOperationalSurface:buildPredictiveOperationalSurface({candidate:{missionId:null,status:null}}),
      preventiveIntelligence:buildPreventiveIntelligenceFoundation({candidate:{missionId:null,status:null}}),
      preventiveOutcomeAwareness:buildPreventiveOutcomeAwareness({candidate:{missionId:null,status:null}}),
      finalOperationalProduct:buildFinalOperationalProduct({candidate:{missionId:null,status:null}})
    };
    return {...base,tv:buildTvContract({audience,events:base.events,focus:base.focus,priority:base.priority,health:base.health})};
  }

  const missionId=Number(normalizedFocus?.missionId||top?.missionId||0)||null;
  const matched=items.find(x=>Number(x.missionId)===missionId)||top;
  const health=matched?.health||{state:"unknown",riskScore:Number(matched?.score||0),summary:matched?.reasons?.[0]?.label||"Mission needs attention."};
  const flow=matched?.flow||null;
  const firstReason=matched?.reasons?.[0]||null;
  const focusResult=normalizedFocus||{available:false};
  const trajectory=deriveOperationalRiskTrajectory({
    current:matched?.trajectoryObservation||matched?.trajectoryCurrent||null,
    previous:matched?.trajectoryPrevious||null
  });
  const actionAlignment=buildActionDecisionAlignment({
    operationalIntelligence:matched?.operationalIntelligence||matched?.intelligence||null,
    compoundOperationalIntelligence:matched?.compoundOperationalIntelligence||null,
    trajectory,
    actionContract:matched?.actionContract||null,
    missionFlow:matched?.flowContract||matched?.flow||null,
    executionHandoff:matched?.executionHandoff||null,
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null}
  });

  const evidenceConfidence=buildOperationalIntelligenceEvidence({
    operationalIntelligence:matched?.operationalIntelligence||matched?.intelligence||null,
    compoundOperationalIntelligence:matched?.compoundOperationalIntelligence||null,
    trajectory,
    actionAlignment,
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null}
  });
  const outcomeAwareness=buildOperationalOutcomeAwareness({
    before:matched?.outcomeBefore||matched?.previousTruth||null,
    current:matched?.outcomeCurrent||matched?.currentTruth||matched?.truth||null,
    actionAlignment,
    evidenceConfidence,
    history:matched?.operationalHistory||null,
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null}
  });
  const predictiveIntelligence=buildPredictiveIntelligenceFoundation({
    trajectory,
    outcomeAwareness,
    actionAlignment,
    evidenceConfidence,
    prediction:matched?.prediction||matched?.predictiveIntelligence||null,
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null}
  });
  const predictiveRiskHorizon=buildPredictiveRiskHorizon({
    predictiveIntelligence,
    trajectory,
    evidenceConfidence,
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null}
  });
  const predictiveConsequence=buildPredictiveConsequence({
    predictiveIntelligence,
    predictiveRiskHorizon,
    actionAlignment,
    outcomeAwareness,
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null}
  });
  const predictiveInterventionWindow=buildPredictiveInterventionWindow({
    predictiveRiskHorizon,
    predictiveConsequence,
    actionAlignment,
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null}
  });
  const predictiveActionReadiness=buildPredictiveActionReadiness({
    predictiveInterventionWindow,
    predictiveConsequence,
    actionAlignment,
    executionHandoff:matched?.executionHandoff||null,
    readiness:matched?.readiness||null,
    actionContract:matched?.actionContract||null,
    missionFlow:matched?.flowContract||matched?.flow||null,
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null}
  });
  const predictiveOperationalReadiness=buildPredictiveOperationalReadiness({
    predictiveIntelligence,
    predictiveRiskHorizon,
    predictiveConsequence,
    predictiveInterventionWindow,
    predictiveActionReadiness,
    actionAlignment,
    readiness:matched?.readiness||null,
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null}
  });
  const predictiveOperationalPreparation=buildPredictiveOperationalPreparation({
    predictiveIntelligence,
    predictiveRiskHorizon,
    predictiveConsequence,
    predictiveInterventionWindow,
    predictiveActionReadiness,
    predictiveOperationalReadiness,
    actionAlignment,
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null}
  });
  const predictiveOperationalSurface=buildPredictiveOperationalSurface({
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null},
    predictiveIntelligence, predictiveRiskHorizon, predictiveConsequence, predictiveInterventionWindow,
    predictiveActionReadiness, predictiveOperationalReadiness, predictiveOperationalPreparation, actionAlignment, evidenceConfidence
  });
  const preventiveIntelligence=buildPreventiveIntelligenceFoundation({
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null},
    predictiveIntelligence,predictiveRiskHorizon,predictiveConsequence,predictiveInterventionWindow,
    predictiveActionReadiness,predictiveOperationalReadiness,predictiveOperationalPreparation,
    predictiveOperationalSurface,actionAlignment,evidenceConfidence
  });

  const preventiveOutcomeAwareness=buildPreventiveOutcomeAwareness({
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null},
    preventiveIntelligence,
    outcomeAwareness,
    evidenceConfidence,
    history:matched?.operationalHistory||null,
    operationalEvents:matched?.operationalEvents||operationalEvents||[]
  });

  const finalOperationalProduct=buildFinalOperationalProduct({
    candidate:{missionId,status:matched?.status||null,truth:matched?.truth||null},
    coordination:matched?.coordination||null,
    actionAlignment, outcomeAwareness, predictiveOperationalSurface,
    preventiveIntelligence, preventiveOutcomeAwareness, evidenceConfidence,
    trajectory, liveness:matched?.liveness||matched?.coordination?.liveness||null
  });

  const situations=situationContract(items,enrichEventsWithMissionMeta(mergeEvents(collectEvents(items,missionId),operationalEvents,missionId),items),missionId);
  const base={
    available:Boolean(matched||focusResult?.available),audience,missionId,
    reference:String(focusResult?.reference||matched?.reference||""),
    status:matched?.status||null,statusLabel:matched?.statusLabel||matched?.status||null,
    perspective:matched?.perspective||null,flow,
    health:{state:health.state||"unknown",riskScore:Number(health.riskScore||0),summary:health.summary||firstReason?.label||"Mission needs attention."},
    attention:{level:matched?.level||"none",score:Number(matched?.score||0),total:Number(summary.total||items.length||0),critical:Number(summary.critical||0),action:Number(summary.attention||0),watch:Number(summary.watch||0),reason:firstReason?.label||focusResult?.reason||""},
    priority:{level:focusResult?.priority||priorityFromAttention(matched?.level),score:Number(focusResult?.score||matched?.score||0)},
    marketplace:matched?.marketplace||null,
    focus:focusResult,...situations,awareness:normalizeAwareness(awareness),
    notification:{dedupeMissionId:missionId,reasonCode:focusResult?.reasonCode||firstReason?.code||null,suppressDuplicateToast:Boolean(missionId&&focusResult?.available)},
    trajectory,
    actionAlignment,
    evidenceConfidence,
    outcomeAwareness,
    predictiveIntelligence,
    predictiveRiskHorizon,
    predictiveConsequence,
    predictiveInterventionWindow,
    predictiveActionReadiness,
    predictiveOperationalReadiness,
    predictiveOperationalPreparation,
    predictiveOperationalSurface,
    preventiveIntelligence,
    preventiveOutcomeAwareness,
    finalOperationalProduct
  };
  return {...base,tv:buildTvContract({audience,events:base.events,focus:base.focus,priority:base.priority,health:base.health,status:base.status,missionId:base.missionId,reference:base.reference,perspective:base.perspective})};
}

/**
 * Lightweight per-mission snapshot for future channels/tests. This remains pure/read-only.
 */
export function intelligenceFromMission(mission,{role="",accessKind="owner",now=Date.now()}={}){
  const context=buildMissionContext(mission,{role,accessKind,now});
  const conditions=buildMissionConditions(context);
  const flow=deriveMissionFlow(conditions);
  const health=deriveMissionHealth(conditions,flow);
  const reasons=(health.signals||[]).map(signal=>attentionFromHealthSignal(signal,{role})).filter(Boolean).map(a=>({code:a.code,label:a.label,points:a.points,icon:""}));
  const score=Math.min(100,reasons.reduce((n,r)=>n+Number(r.points||0),0));
  const level=attentionLevelFromScore(score);
  const item={
    missionId:Number(mission?.id||0),reference:String(mission?.reference||""),status:conditions.status,statusLabel:conditions.status,
    score,level,reasons,perspective:conditions.perspective,flow,health,link:operationalMissionHref(mission?.id,{role})
  };
  const items=score>0?[item]:[];
  const summary={critical:level==="critical"?1:0,attention:level==="attention"?1:0,watch:level==="watch"?1:0,total:items.length};
  const focus=buildFocusRecommendation(items,{role});
  return coordinateMissionIntelligence({items,summary,focus,audience:role});
}



function enrichEventsWithMissionMeta(events,items){
  const meta=new Map((items||[]).map(item=>[Number(item.missionId),{
    status:item.status||null,
    missionPriority:priorityFromAttention(item.level),
    missionScore:Number(item.score||0)
  }]));
  return (events||[]).map(event=>{
    const own=meta.get(Number(event.missionId||0));
    return {
      ...event,
      status:event.status||own?.status||null,
      missionPriority:event.missionPriority||own?.missionPriority||null,
      missionScore:Number(event.missionScore??own?.missionScore??0)
    };
  });
}

function situationContract(items,events,focusMissionId){
  const situations=buildMissionSituations({items,events,focusMissionId});
  const stories=situationEvents(situations);
  // If a mission cannot be correlated, preserve its authorized operational event.
  const represented=new Set(stories.map(e=>Number(e.missionId||0)));
  const passthrough=events.filter(e=>e.kind==="network"||e.kind==="foryou"||!represented.has(Number(e.missionId||0)));
  const combined=[...stories,...passthrough];
  combined.sort((a,b)=>{if(Boolean(a.persistent)!==Boolean(b.persistent))return Number(Boolean(b.persistent))-Number(Boolean(a.persistent));return Date.parse(b.at||0)-Date.parse(a.at||0);});
  return {events:combined.slice(0,16),situations};
}

function priorityFromAttention(level){return level==="critical"?"critical":level==="attention"?"high":level==="watch"?"medium":"low";}

function normalizeAwareness(value){
  const a=value||{};
  const latest=a.latest||null;
  return {active:Number(a.active||0),newCount:Number(a.newCount||0),latest:latest?{missionId:Number(latest.mission_id||latest.missionId||0)||null,reference:String(latest.reference||""),pickupCompany:String(latest.pickup_company||latest.pickupCompany||""),deliveryCompany:String(latest.delivery_company||latest.deliveryCompany||"")}:null};
}

function collectEvents(items,focusMissionId){
  const events=[];
  for(const item of items||[])for(const event of item.events||[])events.push(event);
  events.sort((a,b)=>{
    const af=Number(a.missionId)===Number(focusMissionId)?1:0,bf=Number(b.missionId)===Number(focusMissionId)?1:0;
    if(af!==bf)return bf-af;
    if(Boolean(a.alert)!==Boolean(b.alert))return Number(Boolean(b.alert))-Number(Boolean(a.alert));
    return Date.parse(b.at||0)-Date.parse(a.at||0);
  });
  const seen=new Set(),out=[];
  for(const e of events){const key=`${e.missionId}:${e.code}:${e.actor||''}`;if(seen.has(key))continue;seen.add(key);out.push(e);if(out.length>=8)break;}
  return out;
}

function mergeEvents(conditionEvents,operationalEvents,focusMissionId){
  const all=[...(conditionEvents||[]),...(operationalEvents||[])];
  all.sort((a,b)=>{const af=Number(a.missionId)===Number(focusMissionId)?1:0,bf=Number(b.missionId)===Number(focusMissionId)?1:0;if(af!==bf)return bf-af;if(Boolean(a.alert)!==Boolean(b.alert))return Number(Boolean(b.alert))-Number(Boolean(a.alert));if(Boolean(a.persistent)!==Boolean(b.persistent))return Number(Boolean(b.persistent))-Number(Boolean(a.persistent));return Date.parse(b.at||0)-Date.parse(a.at||0);});
  const seen=new Set(),out=[];for(const e of all){const key=`${e.kind||"event"}:${e.code||""}:${e.missionId||0}:${e.label||""}`;if(seen.has(key))continue;seen.add(key);out.push(e);if(out.length>=16)break;}return out;
}
