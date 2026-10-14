import {RELEASE_VERSION} from '../../core/release.js';
import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 10.19.26 — Adaptive Multi-Mission Coordination.
 * Read-only coordination across simultaneous operational work.
 * It correlates existing canonical mission projections and predictive signals;
 * it never creates truth, authorization, custody, responsibility or execution.
 */
export const MULTI_MISSION_COORDINATION_VERSION=RELEASE_VERSION;
const text=v=>String(v??"").trim();
const upper=v=>text(v).toUpperCase();
const num=v=>Number(v||0)||0;
const RISK={CRITICAL:100,HIGH:80,MEDIUM:55,LOW:25,INFO:10};
const active=m=>!isLifecycleTerminal(m?.status);

export function buildMultiMissionCoordination({missions=[],predictions=[],workloadPressure=[],networkNeed=[],now=Date.now()}={}){
  const activeMissions=(Array.isArray(missions)?missions:[]).filter(active);
  const predByMission=new Map();
  for(const p of predictions||[]){const id=num(p?.missionId||p?.subjectId);if(id&&!predByMission.has(id))predByMission.set(id,p);}
  const workload=new Map((workloadPressure||[]).map(x=>[`${text(x.ownerType)}:${num(x.ownerId)||"unassigned"}`,x]));
  const rows=activeMissions.map(m=>buildMissionRow(m,predByMission.get(num(m.id)),workload,now));
  const resourcePressure=buildResourcePressure(rows);
  const dependencyPressure=buildDependencyPressure(rows);
  const priority=rows.slice().sort((a,b)=>b.coordinationScore-a.coordinationScore||a.missionId-b.missionId).slice(0,12);
  const next=priority.find(x=>x.safeNext?.available)||priority[0]||null;
  const network=buildNetworkNeed(networkNeed,rows);
  const conflicts=unique([
    ...resourcePressure.filter(x=>x.level!=="LOW").map(x=>`resource_pressure:${x.key}`),
    ...dependencyPressure.filter(x=>x.level!=="LOW").map(x=>`dependency_pressure:${x.key}`)
  ]).slice(0,12);
  return Object.freeze({
    version:MULTI_MISSION_COORDINATION_VERSION,readOnly:true,authoritative:false,
    generatedAt:new Date(now).toISOString(),missionCount:activeMissions.length,
    coordinatedCount:rows.length,resourcePressure:Object.freeze(resourcePressure),
    dependencyPressure:Object.freeze(dependencyPressure),priority:Object.freeze(priority),
    network:Object.freeze(network),conflicts:Object.freeze(conflicts),
    nextBestWork:next?Object.freeze({missionId:next.missionId,reference:next.reference,reason:next.coordinationReason,action:next.safeNext?.available?next.safeNext.action:null,confidence:next.confidence}):null,
    safety:Object.freeze({createsTruth:false,createsAuthorization:false,executesAction:false,changesResponsibility:false,changesCustody:false,persistsCoordination:false})
  });
}

export function validateMultiMissionCoordination(model){
  const p=[];
  if(model?.readOnly!==true)p.push("coordination_not_read_only");
  if(model?.authoritative!==false)p.push("coordination_claims_authority");
  if(model?.safety?.createsTruth!==false)p.push("coordination_creates_truth");
  if(model?.safety?.createsAuthorization!==false)p.push("coordination_creates_authorization");
  if(model?.safety?.executesAction!==false)p.push("coordination_executes_action");
  if(model?.nextBestWork?.action&&!model?.nextBestWork?.missionId)p.push("next_work_without_mission");
  return [...new Set(p)];
}

function buildMissionRow(m,p,workload,now){
  const id=num(m?.id),status=upper(m?.status),deadline=m?.deadline_at_utc||m?.deadline_at||m?.deadlineAt;
  const deadlineHours=deadline&&Number.isFinite(Date.parse(deadline))?(Date.parse(deadline)-now)/3600000:null;
  const ownerId=num(m?.assigned_executor_id||m?.executor_id||m?.owner_driver_id);
  const ownerType=num(m?.assigned_executor_id||m?.executor_id)?"executor":num(m?.owner_driver_id)?"driver":"unassigned";
  const ownerKey=`${ownerType}:${ownerId||"unassigned"}`;
  const pressure=workload.get(ownerKey)||null;
  const signals=[]; let score=0;
  const add=(level,reason,source)=>{if(reason){signals.push({level,reason:text(reason),source:text(source)});score=Math.max(score,RISK[level]||0);}};
  const risk=upper(p?.riskLevel||p?.summary?.riskLevel);
  if(risk)add(risk,p?.reason||"Predictive operational risk is elevated.","predictive");
  if(deadlineHours!==null){if(deadlineHours<0)add("CRITICAL","Deadline is already overdue.","deadline");else if(deadlineHours<8)add("HIGH","Deadline is inside the near-term coordination window.","deadline");else if(deadlineHours<24)add("MEDIUM","Deadline is inside the next 24 hours.","deadline");}
  if(!ownerId&&["PENDING","ARRIVED"].includes(status))add("HIGH","Mission has no visible current execution owner.","responsibility");
  if(pressure?.pressureLevel==="HIGH")add("HIGH","The current execution owner is under elevated workload pressure.","workload");
  else if(pressure?.pressureLevel==="MEDIUM")add("MEDIUM","The current execution owner has multiple active missions.","workload");
  if(p?.predictionType==="BLOCKAGE_RISK"||p?.predictionType==="CUSTODY_RISK")add("HIGH",p.reason,"prediction");
  const dependencyKey=text(m?.dependency_id||m?.dependencyId||m?.blocking_mission_id||m?.blockingMissionId);
  const nextAction=text(m?.next_action||p?.recommendedAction||p?.predictionType);
  const safeAvailable=Boolean(nextAction&&num(m?.state_version||0));
  return Object.freeze({missionId:id,reference:text(m?.reference||`Mission ${id}`),status,owner:Object.freeze({type:ownerType,id:ownerId||null,name:text(m?.executor_name||m?.driver_name||"Unassigned")}),deadlineHours,dependencyKey:dependencyKey||null,coordinationScore:Math.min(100,score+(signals.length?Math.min(20,signals.length*5):0)),coordinationLevel:score>=100?"CRITICAL":score>=80?"HIGH":score>=55?"MEDIUM":"LOW",coordinationReason:signals[0]?.reason||"No cross-mission pressure currently dominates.",signals:Object.freeze(signals.slice(0,6)),safeNext:Object.freeze({available:safeAvailable,action:safeAvailable?Object.freeze({code:nextAction,label:nextAction,requiresExistingAuthorization:true}):null,reason:safeAvailable?"Existing next-action signal may be handed to the secured action surface after fresh validation.":"No safe next action is inferred without an authoritative action signal."}),confidence:signals.length?"MEDIUM":"LOW"});
}

function buildResourcePressure(rows){
  const groups=new Map();
  for(const r of rows){const key=`${r.owner.type}:${r.owner.id||"unassigned"}`;const g=groups.get(key)||{key,ownerType:r.owner.type,ownerId:r.owner.id,ownerName:r.owner.name,missionIds:[],activeMissions:0,highRisk:0};g.missionIds.push(r.missionId);g.activeMissions++;if(["CRITICAL","HIGH"].includes(r.coordinationLevel))g.highRisk++;groups.set(key,g);}
  return [...groups.values()].map(g=>({...g,level:g.ownerType==="unassigned"?(g.activeMissions>1?"HIGH":"MEDIUM"):(g.activeMissions>=5||g.highRisk>=2?"HIGH":g.activeMissions>=3||g.highRisk?"MEDIUM":"LOW"),reason:g.ownerType==="unassigned"?"Multiple active missions lack a visible execution owner.":`${g.activeMissions} active mission${g.activeMissions===1?"":"s"} share this execution owner.`})).sort((a,b)=>levelScore(b.level)-levelScore(a.level)||b.activeMissions-a.activeMissions);
}
function buildDependencyPressure(rows){
  const groups=new Map();
  for(const r of rows){if(!r.dependencyKey)continue;const g=groups.get(r.dependencyKey)||{key:r.dependencyKey,missionIds:[],affectedMissions:0,highRisk:0};g.missionIds.push(r.missionId);g.affectedMissions++;if(["CRITICAL","HIGH"].includes(r.coordinationLevel))g.highRisk++;groups.set(r.dependencyKey,g);}
  return [...groups.values()].map(g=>({...g,level:g.affectedMissions>=3||g.highRisk>=2?"HIGH":g.affectedMissions>=2?"MEDIUM":"LOW",reason:`${g.affectedMissions} active mission${g.affectedMissions===1?"":"s"} reference the same dependency.`})).sort((a,b)=>levelScore(b.level)-levelScore(a.level)||b.affectedMissions-a.affectedMissions);
}
function buildNetworkNeed(items,rows){const rowIds=new Set(rows.map(r=>r.missionId));return (items||[]).filter(x=>rowIds.has(num(x.missionId))).slice(0,12).map(x=>({missionId:num(x.missionId),reference:text(x.reference),need:text(x.need||"execution_capacity"),candidateCount:num(x.candidateCount),recommendation:text(x.recommendation),reason:text(x.reason),confidence:text(x.confidence||"LOW"),readOnly:true,authoritative:false}));}
function levelScore(v){return ({CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1})[v]||0;}
function unique(v){return [...new Set((v||[]).filter(Boolean).map(text))];}
