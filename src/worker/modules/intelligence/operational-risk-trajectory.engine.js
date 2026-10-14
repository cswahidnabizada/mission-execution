import {MISSION_LIVENESS_STATES} from "../../core/canonical-liveness-registry.js";
/**
 * Operational Risk Trajectory — 9.1.3
 *
 * Pure/read-only interpretation layer. It does not own truth, liveness,
 * priority, authorization, or action execution. It compares two already-
 * authorized normalized observations and returns an evidence-backed trajectory.
 */

const DEADLINE_RANK={safe:0,watch:1,soon:2,critical:3,overdue:4,none:0};

const READINESS_RANK={progressing:0,ready:0,waiting:1,at_risk:2,blocked:3,unavailable:4,stale:2,complete:0};
const RISK_RANK={watch:1,waiting:2,delay:3,risk:3,assignment:3,execution:4,critical:5,none:0};

export function deriveOperationalRiskTrajectory({current=null,previous=null}={}){
  if(!current||!previous)return null;
  const missionId=Number(current.missionId||previous.missionId||0)||null;
  if(!missionId)return null;
  if(Number(previous.missionId||missionId)!==missionId)return null;

  const currentTruth=current.truth||{};
  const previousTruth=previous.truth||{};
  const currentLifecycle=String(currentTruth.status||current.status||"");
  const previousLifecycle=String(previousTruth.status||previous.status||"");

  if(isTerminal(current)||isTerminalTruth(currentTruth)){
    return null;
  }

  const currentRisk=normalizeRisk(current);
  const previousRisk=normalizeRisk(previous);
  if(!currentRisk.category&&!previousRisk.category)return null;

  const changes=[];
  const currentDeadline=normalizeDeadline(current);
  const previousDeadline=normalizeDeadline(previous);
  if(currentDeadline!==previousDeadline){
    changes.push({field:"deadline",from:previousDeadline,to:currentDeadline});
  }

  const currentLiveness=normalizeLiveness(current);
  const previousLiveness=normalizeLiveness(previous);
  if(currentLiveness!==previousLiveness){
    changes.push({field:"liveness",from:previousLiveness,to:currentLiveness});
  }

  const currentReadiness=normalizeReadiness(current);
  const previousReadiness=normalizeReadiness(previous);
  if(currentReadiness!==previousReadiness){
    changes.push({field:"readiness",from:previousReadiness,to:currentReadiness});
  }

  const currentSignals=signalSet(current);
  const previousSignals=signalSet(previous);
  const added=[...currentSignals].filter(x=>!previousSignals.has(x));
  const resolved=[...previousSignals].filter(x=>!currentSignals.has(x));
  for(const signal of added)changes.push({field:"signal",change:"added",value:signal});
  for(const signal of resolved)changes.push({field:"signal",change:"resolved",value:signal});

  const currentWaitingMinutes=numberOrNull(current.waitingMinutes??current.time?.statusAgeMinutes??current.liveness?.waitingMinutes);
  const previousWaitingMinutes=numberOrNull(previous.waitingMinutes??previous.time?.statusAgeMinutes??previous.liveness?.waitingMinutes);
  if(Number.isFinite(currentWaitingMinutes)&&Number.isFinite(previousWaitingMinutes)&&currentWaitingMinutes!==previousWaitingMinutes){
    changes.push({field:"waitingMinutes",from:previousWaitingMinutes,to:currentWaitingMinutes});
  }

  const direction=classifyDirection({currentRisk,previousRisk,currentDeadline,previousDeadline,currentLiveness,previousLiveness,currentReadiness,previousReadiness,added,resolved,currentWaitingMinutes,previousWaitingMinutes,currentLifecycle,previousLifecycle});
  if(!direction)return null;

  const trajectory=direction.trajectory;
  const category=currentRisk.category||previousRisk.category;
  const evidence=buildEvidence({current,previous,currentRisk,previousRisk,currentDeadline,previousDeadline,currentLiveness,previousLiveness,currentReadiness,previousReadiness,added,resolved,currentWaitingMinutes,previousWaitingMinutes});
  if(!evidence.length)return null;

  return {
    missionId,
    trajectory,
    riskCategory:category||null,
    confidence:direction.confidence,
    ruleCode:direction.ruleCode,
    evidence,
    comparison:{
      previousState:previousRisk.state||previousLifecycle||null,
      currentState:currentRisk.state||currentLifecycle||null,
      changedSignals:changes.slice(0,12)
    },
    causalChain:direction.causalChain,
    impact:direction.impact,
    consideration:direction.consideration,
    sourceSignals:[...new Set([...currentSignals,...previousSignals])],
    sourceAuthorities:["canonical_truth","liveness","health","readiness","operational_history"],
    authoritative:false,
    readOnly:true
  };
}

function classifyDirection({currentRisk,previousRisk,currentDeadline,previousDeadline,currentLiveness,previousLiveness,currentReadiness,previousReadiness,added,resolved,currentWaitingMinutes,previousWaitingMinutes,currentLifecycle,previousLifecycle}){
  const deadlineDelta=DEADLINE_RANK[currentDeadline]-DEADLINE_RANK[previousDeadline];
  const livenessDelta=MISSION_LIVENESS_STATES.indexOf(currentLiveness)-MISSION_LIVENESS_STATES.indexOf(previousLiveness);
  const readinessDelta=READINESS_RANK[currentReadiness]-READINESS_RANK[previousReadiness];
  const riskDelta=RISK_RANK[currentRisk.level]-RISK_RANK[previousRisk.level];
  const waitingDelta=Number.isFinite(currentWaitingMinutes)&&Number.isFinite(previousWaitingMinutes)?currentWaitingMinutes-previousWaitingMinutes:0;

  const escalation=Boolean(
    !["Completed","Delivered"].includes(currentLifecycle) &&
    ((currentDeadline==="overdue"&&isPersistentRisk(currentRisk)) ||
     (currentDeadline==="critical"&&isPersistentRisk(currentRisk)&&(
       livenessDelta>0||readinessDelta>0||waitingDelta>=30||added.includes("stale_progress")
     )))
  );
  if(escalation){
    return {
      trajectory:"ESCALATION_RELEVANT",confidence:"HIGH",ruleCode:"OI-TRAJECTORY-ESCALATION-BOUNDARY",
      causalChain:["persistent operational risk","time or execution pressure reached a deterministic boundary","escalation is operationally relevant"],
      impact:{type:impactType(currentRisk.category),summary:"The existing operational risk has reached a deterministic escalation-relevant boundary."},
      consideration:{summary:"Review the existing operational decision path before the current condition becomes harder to recover."}
    };
  }

  if(deadlineDelta>0||livenessDelta>0||readinessDelta>0||riskDelta>0||waitingDelta>=15||added.some(isWorseningSignal)){
    return {
      trajectory:"WORSENING",confidence:confidenceFor({deadlineDelta,livenessDelta,readinessDelta,riskDelta,waitingDelta}),ruleCode:"OI-TRAJECTORY-WORSENING",
      causalChain:causalChain("worsening",currentRisk.category),
      impact:{type:impactType(currentRisk.category),summary:"The active operational risk is becoming more constrained based on the observed evidence change."},
      consideration:{summary:"Review the existing operational decision and available recovery path while the condition is worsening."}
    };
  }

  if(resolved.length||deadlineDelta<0||livenessDelta<0||readinessDelta<0||riskDelta<0||waitingDelta<=-15||currentRisk.category!==previousRisk.category){
    return {
      trajectory:"IMPROVING",confidence:confidenceFor({deadlineDelta,livenessDelta,readinessDelta,riskDelta,waitingDelta}),ruleCode:"OI-TRAJECTORY-IMPROVING",
      causalChain:causalChain("improving",currentRisk.category),
      impact:{type:impactType(currentRisk.category),summary:"Evidence indicates that the active operational condition is becoming less constrained."},
      consideration:{summary:"Continue using the existing operational decision path and verify that the improvement persists."}
    };
  }

  if(currentRisk.category&&previousRisk.category){
    return {
      trajectory:"STABLE",confidence:"MEDIUM",ruleCode:"OI-TRAJECTORY-STABLE",
      causalChain:["same operational risk remains present","no material directional change was observed"],
      impact:{type:impactType(currentRisk.category),summary:"The active operational risk remains materially unchanged across the available observations."},
      consideration:{summary:"Keep the existing operational attention in place and wait for a material change or valid resolution."}
    };
  }
  return null;
}

function buildEvidence({current,previous,currentRisk,previousRisk,currentDeadline,previousDeadline,currentLiveness,previousLiveness,currentReadiness,previousReadiness,added,resolved,currentWaitingMinutes,previousWaitingMinutes}){
  const evidence=[];
  if(currentRisk.category) evidence.push({type:"risk",source:"operational_intelligence",current:currentRisk.category,previous:previousRisk.category||null});
  if(currentDeadline!==previousDeadline) evidence.push({type:"deadline",source:"time",current:currentDeadline,previous:previousDeadline});
  if(currentLiveness!==previousLiveness) evidence.push({type:"liveness",source:"liveness",current:currentLiveness,previous:previousLiveness});
  if(currentReadiness!==previousReadiness) evidence.push({type:"readiness",source:"readiness",current:currentReadiness,previous:previousReadiness});
  for(const signal of added.slice(0,4))evidence.push({type:"signal",source:"health",change:"added",value:signal});
  for(const signal of resolved.slice(0,4))evidence.push({type:"signal",source:"health",change:"resolved",value:signal});
  if(Number.isFinite(currentWaitingMinutes)&&Number.isFinite(previousWaitingMinutes)&&currentWaitingMinutes!==previousWaitingMinutes)evidence.push({type:"waiting_duration",source:"operational_history",currentMinutes:currentWaitingMinutes,previousMinutes:previousWaitingMinutes});
  if(!evidence.length&&current.at&&previous.at)evidence.push({type:"observation",source:"operational_history",currentAt:current.at,previousAt:previous.at});
  return evidence;
}

function normalizeRisk(o){
  const i=o.intelligence||{};
  const r=i.primaryRisk||i.risk||o.primaryRisk||o.risk||{};
  const category=String(r.category||i.category||o.riskCategory||"").toUpperCase()||null;
  const level=String(r.severity||r.level||i.severity||o.severity||"").toLowerCase()||"none";
  return {category,level,state:String(r.state||o.status||"")};
}
function normalizeDeadline(o){return String(o.time?.deadline||o.deadline||o.deadlineState||"none").toLowerCase();}
function normalizeLiveness(o){return String(o.liveness?.state||o.livenessState||o.workState||"ACTIONABLE").toUpperCase();}
function normalizeReadiness(o){return String(o.readiness?.state||o.readinessState||o.progress?.state||"progressing").toLowerCase();}
function signalSet(o){
  const values=[...(o.sourceSignals||[]),...(o.signals||[]),...(o.intelligence?.sourceSignals||[])];
  return new Set(values.map(v=>String(v).toLowerCase()).filter(Boolean));
}
function isTerminal(o){return ["Completed","Delivered"].includes(String(o.status||o.truth?.status||""));}
function isTerminalTruth(t){return ["Completed","Delivered"].includes(String(t.status||""));}
function isPersistentRisk(r){return Boolean(r.category&&r.level!=="none");}
function isWorseningSignal(s){return ["stale_progress","pickup_late","assignment_required","execution_partner_unassigned","overdue","deadline_critical","pickup_waiting"].includes(s);}
function impactType(category){return ({ASSIGNMENT_RISK:"RESPONSIBILITY",DELAY_RISK:"TIME",WAITING_RISK:"TIME",EXECUTION_RISK:"EXECUTION"})[category]||"OPERATIONAL";}
function causalChain(direction,category){
  const label=category?String(category).toLowerCase().replace(/_risk$/,"").replace(/_/g," "):"operational condition";
  if(direction==="worsening")return [`${label} risk remains active`,`supporting operational evidence is becoming more constrained`,`the current condition is moving in a worse direction`];
  return [`${label} risk was previously active`,`supporting evidence has materially changed`,`the current condition is moving in a better direction`];
}
function confidenceFor({deadlineDelta,livenessDelta,readinessDelta,riskDelta,waitingDelta}){
  const material=[deadlineDelta,livenessDelta,readinessDelta,riskDelta,waitingDelta].filter(v=>v!==0).length;
  return material>=2?"HIGH":"MEDIUM";
}
function numberOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null;}
