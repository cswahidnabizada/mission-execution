import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.2.1 — Predictive Risk Horizon & Escalation Awareness
 *
 * Deterministic, read-only interpretation of existing predictive signals.
 * This engine does not create truth, authorize actions, mutate state, or execute.
 */

const HORIZONS=["IMMEDIATE","NEAR_TERM","SHORT_TERM","MEDIUM_TERM","LONG_TERM","UNKNOWN"];
const LEVELS=new Set(["LOW","MEDIUM","HIGH"]);
const TYPES=new Set(["RISK_ESCALATION","DELAY","BLOCKER_PERSISTENCE","RESOLUTION_LIKELIHOOD","WAITING_PERSISTENCE"]);

export function buildPredictiveRiskHorizon({candidate=null,predictiveIntelligence=null,trajectory=null,evidenceConfidence=null}={}){
  const missionId=Number(candidate?.missionId||candidate?.id||predictiveIntelligence?.missionId||0)||null;
  const status=String(candidate?.status||candidate?.truth?.status||predictiveIntelligence?.status||"");
  const terminal=isLifecycleTerminal(status);
  if(terminal) return freeze({missionId,status,terminal,available:false,signals:[],primary:null,escalation:{state:"NONE",level:"LOW",reasonCode:null}});

  const signals=normalizeSignals(predictiveIntelligence?.signals);
  const derived=signals.length?signals:deriveFromTrajectory(trajectory,evidenceConfidence);
  const ranked=[...derived].sort(rankSignal);
  const primary=ranked[0]||null;
  const escalation=buildEscalation(ranked);
  return freeze({missionId,status,terminal,available:Boolean(ranked.length),signals:ranked,primary,escalation,authoritative:false,readOnly:true});
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
    recommendedPreparation:s.recommendedPreparation||null,
    authoritative:false,
    readOnly:true
  })).slice(0,8);
}

function deriveFromTrajectory(trajectory,evidenceConfidence){
  const d=String(trajectory?.direction||trajectory?.trend||trajectory?.trajectory||"").toUpperCase();
  if(!d) return [];
  const confidence=level(evidenceConfidence?.confidence||"MEDIUM");
  if(d.includes("WORSEN")||d.includes("RISING")) return [{type:"RISK_ESCALATION",horizon:"NEAR_TERM",likelihood:confidence,consequence:"operational_risk_may_increase",reasonCode:"risk_trajectory_deterioration",evidenceCount:Number(evidenceConfidence?.evidenceCount||0),recommendedPreparation:null,authoritative:false,readOnly:true}];
  return [];
}

function rankSignal(a,b){
  const severity={RISK_ESCALATION:5,BLOCKER_PERSISTENCE:4,DELAY:3,WAITING_PERSISTENCE:2,RESOLUTION_LIKELIHOOD:1};
  const urgency={IMMEDIATE:5,NEAR_TERM:4,SHORT_TERM:3,MEDIUM_TERM:2,LONG_TERM:1,UNKNOWN:0};
  const likelihood={HIGH:3,MEDIUM:2,LOW:1};
  return (severity[b.type]-severity[a.type])||(urgency[b.horizon]-urgency[a.horizon])||(likelihood[b.likelihood]-likelihood[a.likelihood]);
}

function buildEscalation(signals){
  const risk=signals.find(s=>s.type==="RISK_ESCALATION"||s.type==="BLOCKER_PERSISTENCE"||s.type==="DELAY");
  if(!risk) return {state:"NONE",level:"LOW",reasonCode:null};
  const levelMap={HIGH:"HIGH",MEDIUM:"MEDIUM",LOW:"LOW"};
  const state=risk.horizon==="IMMEDIATE"||risk.likelihood==="HIGH"?"ESCALATING":risk.likelihood==="MEDIUM"?"WATCH":"WATCH";
  return {state,level:levelMap[risk.likelihood]||"MEDIUM",reasonCode:risk.reasonCode};
}
function normalizeHorizon(v){const x=String(v||"").toUpperCase();return HORIZONS.includes(x)?x:"UNKNOWN";}
function level(v){const x=String(v||"").toUpperCase();return LEVELS.has(x)?x:"MEDIUM";}
function freeze(result){return Object.freeze({...result,signals:Object.freeze(result.signals.map(Object.freeze)),primary:result.primary?Object.freeze(result.primary):null,escalation:Object.freeze(result.escalation),authoritative:false,readOnly:true,version:"1.0"});}
