/**
 * ON Mission 10.19.21 — Predictive Operations
 *
 * Read-only predictive layer over canonical mission/attention/assignment inputs.
 * Predictions are advisory only: never canonical truth, authorization, custody,
 * assignment, or execution authority. No persistence or mutation occurs here.
 */
import {MISSION_STATUS_FLOW,isTerminalStatus,isLifecycleTerminal,isExecutionActiveStatus} from "../../domains/logistics/logistics-lifecycle.contract.js";
const HIGH_RISK=new Set(["critical","high"]);


export function buildPredictiveOperations({missions=[],attentionItems=[],drivers=[],networkPartners=[],now=Date.now()}={}){
  const attention=new Map((attentionItems||[]).map(x=>[Number(x.missionId),x]));
  const active=(missions||[]).filter(m=>!isLifecycleTerminal(m.status));
  const workload=new Map();
  const predictions=[];
  for(const mission of active){
    const a=attention.get(Number(mission.id))||{};
    const p=missionPrediction(mission,a,{now});
    if(p.predictions.length)predictions.push(p);
    const executorId=Number(mission.assigned_executor_id||mission.executor_id||0)||0;
    const driverId=Number(mission.owner_driver_id||0)||0;
    const ownerKey=executorId?`executor:${executorId}`:driverId?`driver:${driverId}`:"unassigned";
    const current=workload.get(ownerKey)||{ownerType:executorId?"executor":driverId?"driver":"unassigned",ownerId:executorId||driverId||null,ownerName:mission.executor_name||mission.driver_name||"Unassigned",activeMissions:0,urgentMissions:0,blockedMissions:0,deadlineRisk:0};
    current.activeMissions++;
    current.urgentMissions+=p.summary.urgent?1:0;
    current.blockedMissions+=p.summary.blocked?1:0;
    current.deadlineRisk+=p.predictions.filter(x=>x.predictionType==="DEADLINE_RISK").length;
    workload.set(ownerKey,current);
  }
  const workloadPressure=[...workload.values()].map(x=>({
    ...x,
    pressureLevel:x.ownerType==="unassigned"?(x.activeMissions>=2?"HIGH":"MEDIUM"):(x.activeMissions>=5||x.urgentMissions>=2?"HIGH":x.activeMissions>=3||x.urgentMissions>=1?"MEDIUM":"LOW"),
    reason:x.ownerType==="unassigned"?"Active missions have no current execution owner.":`${x.activeMissions} active mission${x.activeMissions===1?"":"s"} currently associated with this execution owner.`
  })).sort((a,b)=>severity(b.pressureLevel)-severity(a.pressureLevel)||b.activeMissions-a.activeMissions);

  const networkNeed=active.filter(m=>{
    const s=String(m.status||"");
    return s==="Pending" && !Number(m.assigned_executor_id||m.executor_id||m.owner_driver_id||0);
  }).map(m=>({
    missionId:Number(m.id),reference:String(m.reference||`Mission ${m.id}`),need:"execution_capacity",
    recommendation:networkPartners.length?"Review trusted network capacity":"No trusted network capacity is currently available",
    candidateCount:networkPartners.length,
    candidates:networkPartners.slice(0,5).map(x=>({recipientId:Number(x.recipientId||0)||null,name:String(x.name||"Trusted partner"),kind:String(x.kind||x.recipientType||"partner")})),
    reason:"Mission is pending without a current executor; network matching remains a recommendation and requires existing authorization before any assignment.",
    confidence:networkPartners.length?"MEDIUM":"LOW",readOnly:true,authoritative:false
  }));

  predictions.sort((a,b)=>severity(b.summary.riskLevel)-severity(a.summary.riskLevel)||b.summary.score-a.summary.score||a.missionId-b.missionId);
  return Object.freeze({version:"1.0",generatedAt:new Date(now).toISOString(),authoritative:false,readOnly:true,missionCount:active.length,predictionCount:predictions.length,highRiskCount:predictions.filter(x=>HIGH_RISK.has(x.summary.riskLevel)).length,predictions:Object.freeze(predictions),workloadPressure:Object.freeze(workloadPressure),networkNeed:Object.freeze(networkNeed)});
}

function missionPrediction(m,a,{now}){
  const id=Number(m.id), reference=String(m.reference||`Mission ${id}`), status=String(m.status||"Pending");
  const out=[]; let score=0, urgent=false, blocked=false;
  const add=(predictionType,riskLevel,confidence,reason,evidence,recommendedAction,timeHorizon)=>{
    const ev=evidence.filter(Boolean).slice(0,6).map((x,i)=>({index:i+1,signal:String(x)}));
    out.push({predictionType,subjectType:"mission",subjectId:id,reference,riskLevel,confidence,score:scoreFor(riskLevel,confidence),reason,evidence:ev,predictedOutcome:predictionOutcome(predictionType),timeHorizon,recommendedAction:recommendedAction||null,source:"predictive_operations",generatedAt:new Date(now).toISOString(),authoritative:false,readOnly:true});
  };
  const deadline=m.deadline_at_utc||m.deadline_at||null;
  if(deadline){
    const d=Date.parse(deadline),h=(d-now)/3600000;
    if(Number.isFinite(d)){
      const staleHours=ageHours(m.updated_at,now);
      if(h<0){score+=90;urgent=true;add("DEADLINE_RISK","HIGH","HIGH",`Deadline has passed by ${Math.max(1,Math.round(-h))} hour${Math.round(-h)===1?"":"s"}.`,["deadline passed","current mission is non-terminal",staleHours>4?"mission update is stale":null],nextAction(m,a,"Review deadline-risk mission"),"IMMEDIATE");}
      else if(h<8){score+=65;urgent=true;add("DEADLINE_RISK","HIGH",h<2?"HIGH":"MEDIUM",`Deadline is within ${Math.max(1,Math.round(h))} hour${Math.round(h)===1?"":"s"}.`,["deadline proximity",a.level?`attention level ${a.level}`:null,staleHours>4?"mission update is stale":null],nextAction(m,a,"Protect deadline trajectory"),"NEAR_TERM");}
      else if(h<24){score+=35;add("DEADLINE_RISK","MEDIUM","MEDIUM","Deadline is within the next 24 hours and current progress should be watched.",["deadline within 24 hours",a.reason||null],nextAction(m,a,"Monitor deadline trajectory"),"SHORT_TERM");}
    }
  }
  const text=JSON.stringify(a||{}).toLowerCase();
  const isBlocked=/blocked|no executor|assignment required|execution_partner_unassigned|progress is blocked/.test(text);
  const waiting=/waiting|pending/.test(String(a?.liveness||a?.flow?.state||status).toLowerCase());
  const stale=ageHours(m.updated_at,now)>12;
  if(isBlocked){blocked=true;score+=70;add("BLOCKAGE_RISK","HIGH","HIGH","Current operational signals indicate the mission may remain blocked without a change in its dependency or responsibility state.",[a.reason||null,a.dependency||null,a.liveness||null,"attention signal"],nextAction(m,a,"Resolve the blocking dependency"),"NEAR_TERM");}
  else if(waiting&&stale){score+=40;add("BREACH_DRIFT","MEDIUM","MEDIUM","The mission is waiting or pending and has not changed recently, increasing drift risk.",["waiting/pending state",`last update ${Math.round(ageHours(m.updated_at,now))}h ago`,a.reason||null],nextAction(m,a,"Validate the waiting condition"),"NEAR_TERM");}
  if(!Number(m.owner_driver_id||0)&&!Number(m.assigned_executor_id||m.executor_id||0)&&["Pending","Arrived"].includes(status)){
    score+=55;add("RESPONSIBILITY_RISK","HIGH","HIGH","The mission has no visible current execution owner.",["no assigned driver",Number(m.assigned_executor_id||m.executor_id||0)?"executor field present but unresolved":null,"mission status is not terminal"],"Review executor assignment","IMMEDIATE");
  }
  if(isExecutionActiveStatus(status)&&!Number(m.owner_driver_id||0)&&!Number(m.assigned_executor_id||m.executor_id||0)){
    score+=80;blocked=true;add("CUSTODY_RISK","HIGH","HIGH","The mission is in an active execution state without a visible executor or driver assignment.",["active execution status",`status ${status}`,"no assigned driver/executor"],"Review custody and responsibility state","IMMEDIATE");
  }
  const missing=missingPrerequisites(m);
  if(missing.length){score+=Math.min(45,missing.length*15);add("PREREQUISITE_RISK",missing.length>=2?"HIGH":"MEDIUM",missing.length>=2?"HIGH":"MEDIUM","Required operational inputs appear incomplete based only on fields available in canonical mission data.",missing,nextAction(m,a,"Complete missing prerequisites or evidence"),"NEAR_TERM");}
  const likely=nextAction(m,a,null);
  if(likely){add("NEXT_ACTION_PREDICTION","LOW","HIGH","The likely next operational action follows the current canonical next-action/flow signals; this is a prediction, not authority.",[m.next_action||null,a.nextAction||null,a.reason||null].filter(Boolean),likely,"IMMEDIATE");}
  const riskLevel=score>=80?"HIGH":score>=35?"MEDIUM":"LOW";
  return {missionId:id,reference,predictions:out.slice(0,8),summary:{riskLevel,score:Math.min(100,score),urgent,blocked,predictionCount:out.length}};
}

function missingPrerequisites(m){const miss=[];const status=String(m.status||"");if(!String(m.pickup_address||m.pickup_city||"").trim())miss.push("pickup location");if(!String(m.delivery_address||m.delivery_city||"").trim())miss.push("delivery location");if(status!=="Pending"&&!m.delivery_time&&!m.deadline_at_utc&&!m.deadline_at)miss.push("delivery timing/deadline evidence");if(status!=="Pending"&&isExecutionActiveStatus(status)&&!m.owner_driver_id&&!m.assigned_executor_id&&!m.executor_id)miss.push("execution owner");return miss;}
function nextAction(m,a,fallback){return String(m.next_action||a.nextAction||a.expectedNext||fallback||"").trim()||null;}
function predictionOutcome(type){return ({DEADLINE_RISK:"mission may miss its timing target",BLOCKAGE_RISK:"progress may remain blocked",BREACH_DRIFT:"mission may drift toward breach or escalation",RESPONSIBILITY_RISK:"responsibility may remain unresolved",CUSTODY_RISK:"custody/responsibility may become inconsistent",PREREQUISITE_RISK:"progress may fail until required evidence is present",NEXT_ACTION_PREDICTION:"the current next operational step is likely to remain relevant"})[type]||"operational conditions may change";}
function ageHours(v,now){const d=Date.parse(v||"");return Number.isFinite(d)?Math.max(0,(now-d)/3600000):0;}
function severity(v){return ({HIGH:3,MEDIUM:2,LOW:1})[String(v||"").toUpperCase()]||0;}
function scoreFor(r,c){return Math.min(100,severity(r)*30+({HIGH:20,MEDIUM:10,LOW:0}[String(c||"").toUpperCase()]||0));}
