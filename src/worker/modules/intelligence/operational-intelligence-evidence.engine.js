/**
 * ON Mission 9.1.5 — Operational Intelligence Evidence & Confidence
 *
 * Pure/read-only normalization contract. It makes the evidence and confidence
 * behind an existing intelligence result explicit without creating a new
 * truth, risk, priority, action, authorization, or execution authority.
 */

const CONFIDENCE_RANK={LOW:1,MEDIUM:2,HIGH:3};
const SEVERITY=new Set(["LOW","MEDIUM","HIGH","CRITICAL","BLOCKING","RISK","DELAY","WAITING","WATCH"]);

export function buildOperationalIntelligenceEvidence({
  operationalIntelligence=null,
  compoundOperationalIntelligence=null,
  trajectory=null,
  actionAlignment=null,
  candidate=null
}={}){
  const primary=selectPrimary({compoundOperationalIntelligence,operationalIntelligence});
  const evidence=normalizeEvidence([
    ...(Array.isArray(primary?.evidence)?primary.evidence:[]),
    ...(Array.isArray(trajectory?.evidence)?trajectory.evidence:[]),
    ...(Array.isArray(actionAlignment?.intelligence?.evidence)?actionAlignment.intelligence.evidence:[])
  ]);
  const explicitConfidence=normalizeConfidence(
    primary?.confidence||
    operationalIntelligence?.confidence||
    trajectory?.confidence||
    actionAlignment?.confidence||null
  );
  const severity=normalizeSeverity(primary?.severity||primary?.level||operationalIntelligence?.severity||null);
  const category=String(primary?.category||primary?.riskCategory||operationalIntelligence?.category||trajectory?.riskCategory||"").toUpperCase()||null;
  const terminal=isTerminal(candidate?.status||candidate?.truth?.status);
  const usableEvidence=!terminal&&evidence.length>0;
  const confidence=usableEvidence?explicitConfidence:"UNSPECIFIED";
  const confidenceBasis=buildConfidenceBasis({explicitConfidence,trajectory,evidence,terminal});

  return Object.freeze({
    version:"1.0",
    missionId:Number(candidate?.missionId||primary?.missionId||trajectory?.missionId||0)||null,
    category,
    severity,
    confidence,
    confidenceBasis,
    evidenceCount:evidence.length,
    evidenceSufficient:usableEvidence,
    evidence,
    trajectory:trajectory?.trajectory||null,
    authoritative:false,
    readOnly:true
  });
}

function selectPrimary({compoundOperationalIntelligence,operationalIntelligence}){
  return compoundOperationalIntelligence?.primary||compoundOperationalIntelligence||operationalIntelligence?.primary||operationalIntelligence||null;
}

function normalizeEvidence(values){
  const out=[];
  const seen=new Set();
  for(const value of values||[]){
    if(!value||typeof value!=="object")continue;
    const item={
      type:String(value.type||value.evidenceType||"evidence"),
      source:String(value.source||value.kind||"operational"),
      code:value.code?String(value.code):null,
      value:value.value??null,
      change:value.change?String(value.change):null,
      current:value.current??null,
      previous:value.previous??null,
      at:value.at?String(value.at):null
    };
    const key=JSON.stringify([item.type,item.source,item.code,item.change,item.current,item.previous,item.at,item.value]);
    if(seen.has(key))continue;
    seen.add(key);
    out.push(item);
    if(out.length>=12)break;
  }
  return out;
}

function normalizeConfidence(value){
  const v=String(value||"").toUpperCase();
  return Object.prototype.hasOwnProperty.call(CONFIDENCE_RANK,v)?v:null;
}

function normalizeSeverity(value){
  const v=String(value||"").toUpperCase();
  return SEVERITY.has(v)?v:null;
}

function buildConfidenceBasis({explicitConfidence,trajectory,evidence,terminal}){
  if(terminal)return ["terminal_mission_no_active_intelligence"];
  const basis=[];
  if(explicitConfidence)basis.push("existing_intelligence_or_trajectory_confidence");
  if(trajectory?.confidence)basis.push("risk_trajectory_confidence");
  if(evidence.length)basis.push("available_operational_evidence");
  if(!basis.length)basis.push("confidence_not_established");
  return [...new Set(basis)];
}

function isTerminal(value){return ["Completed","Cancelled","Canceled","Delivered"].includes(String(value||""));}
