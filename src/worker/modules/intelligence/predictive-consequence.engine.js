import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.2.2 — Predictive Consequence Intelligence
 *
 * Deterministic, read-only interpretation of existing predictive signals.
 * Consequences are predictions, never canonical truth, authorization, or execution authority.
 */

const TYPES=new Set(["RISK_ESCALATION","DELAY","BLOCKER_PERSISTENCE","RESOLUTION_LIKELIHOOD","WAITING_PERSISTENCE"]);
const HORIZONS=new Set(["IMMEDIATE","NEAR_TERM","SHORT_TERM","MEDIUM_TERM","LONG_TERM","UNKNOWN"]);
const LEVELS=new Set(["LOW","MEDIUM","HIGH"]);

export function buildPredictiveConsequence({candidate=null,predictiveIntelligence=null,predictiveRiskHorizon=null,actionAlignment=null,outcomeAwareness=null}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||predictiveIntelligence?.missionId||predictiveRiskHorizon?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||predictiveIntelligence?.status||predictiveRiskHorizon?.status||"");
  const terminal=isLifecycleTerminal(status);
  if(terminal) return freeze({missionId,status,terminal,available:false,consequences:[],primary:null,summary:null});

  const sourceSignals=normalizeSignals(predictiveRiskHorizon?.signals?.length?predictiveRiskHorizon.signals:predictiveIntelligence?.signals);
  const consequences=sourceSignals.flatMap(signal=>deriveConsequences(signal,{actionAlignment,outcomeAwareness})).slice(0,16);
  const ranked=[...consequences].sort(rankConsequence);
  const primary=ranked[0]||null;
  const summary=primary?{
    impact:primary.impact,
    severity:primary.severity,
    horizon:primary.horizon,
    likelihood:primary.likelihood,
    consequence:primary.consequence,
    reasonCode:primary.reasonCode,
    preparation:primary.recommendedPreparation
  }:null;
  return freeze({missionId,status,terminal,available:Boolean(ranked.length),consequences:ranked,primary,summary,authoritative:false,readOnly:true});
}

function normalizeSignals(list){
  if(!Array.isArray(list)) return [];
  return list.filter(s=>TYPES.has(String(s?.type||"").toUpperCase())).map(s=>({
    type:String(s.type).toUpperCase(),
    horizon:normalizeHorizon(s.horizon),
    likelihood:level(s.likelihood),
    consequence:s.consequence||null,
    reasonCode:s.reasonCode||"predictive_signal",
    evidenceCount:Math.max(0,Number(s.evidenceCount||0)),
    recommendedPreparation:s.recommendedPreparation||null
  }));
}

function deriveConsequences(signal,{actionAlignment,outcomeAwareness}){
  const impactMap={
    RISK_ESCALATION:["MISSION","OPERATION"],
    DELAY:["TIMING","DEPENDENCY"],
    BLOCKER_PERSISTENCE:["EXECUTION","DEPENDENCY"],
    WAITING_PERSISTENCE:["EXECUTION","TIMING"],
    RESOLUTION_LIKELIHOOD:["MISSION"]
  };
  const severityMap={RISK_ESCALATION:"HIGH",BLOCKER_PERSISTENCE:"HIGH",DELAY:"MEDIUM",WAITING_PERSISTENCE:"MEDIUM",RESOLUTION_LIKELIHOOD:"LOW"};
  const textMap={
    RISK_ESCALATION:"operational risk may increase and require earlier intervention",
    DELAY:"mission timing may slip and downstream dependencies may become at risk",
    BLOCKER_PERSISTENCE:"execution may remain unable to progress until the blocker changes",
    WAITING_PERSISTENCE:"execution may remain waiting until the expected actor or event occurs",
    RESOLUTION_LIKELIHOOD:"current operational progress may continue toward resolution"
  };
  const preparation=signal.recommendedPreparation||actionAlignment?.alignment?.currentAction?.label||actionAlignment?.alignment?.currentAction?.code||null;
  return (impactMap[signal.type]||[]).map(impact=>Object.freeze({
    type:signal.type,
    impact,
    severity:severityMap[signal.type]||"MEDIUM",
    horizon:signal.horizon,
    likelihood:signal.likelihood,
    consequence:textMap[signal.type]||signal.consequence||"operational conditions may change",
    reasonCode:`${signal.reasonCode}:predicted_${impact.toLowerCase()}_impact`,
    evidenceCount:signal.evidenceCount,
    sourcePrediction:signal.type,
    currentAction:actionAlignment?.alignment?.currentAction||null,
    outcome:outcomeAwareness?.outcome||null,
    recommendedPreparation:preparation,
    authoritative:false,
    readOnly:true
  }));
}

function rankConsequence(a,b){
  const severity={HIGH:3,MEDIUM:2,LOW:1};
  const urgency={IMMEDIATE:5,NEAR_TERM:4,SHORT_TERM:3,MEDIUM_TERM:2,LONG_TERM:1,UNKNOWN:0};
  const likelihood={HIGH:3,MEDIUM:2,LOW:1};
  return (severity[b.severity]-severity[a.severity])||(urgency[a.horizon]!==undefined?urgency[b.horizon]-urgency[a.horizon]:0)||(likelihood[b.likelihood]-likelihood[a.likelihood]);
}
function normalizeHorizon(v){const x=String(v||"").toUpperCase();return HORIZONS.has(x)?x:"UNKNOWN";}
function level(v){const x=String(v||"").toUpperCase();return LEVELS.has(x)?x:"MEDIUM";}
function freeze(result){return Object.freeze({...result,consequences:Object.freeze(result.consequences.map(Object.freeze)),primary:result.primary?Object.freeze(result.primary):null,summary:result.summary?Object.freeze(result.summary):null,authoritative:false,readOnly:true,version:"1.0"});}
