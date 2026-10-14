import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.19.35 — Adaptive Multi-Mission Coordination.
 * Read-only coordination picture over canonical tenant-scoped mission projections.
 * It identifies what needs coordination across simultaneous missions without creating
 * truth, authorization, responsibility, custody or execution authority.
 */
import { buildMultiMissionCoordination } from "./multi-mission-coordination.contract.js";

export const ADAPTIVE_MULTI_MISSION_COORDINATION_VERSION=RELEASE_VERSION;
const text=v=>String(v??"").trim();
const num=v=>Number(v||0)||0;
const upper=v=>text(v).toUpperCase();
const levelRank={CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1,INFO:0};

export function buildAdaptiveMultiMissionCoordination({missions=[],predictions=[],workloadPressure=[],networkNeed=[],mesh=null,temporalCoordination=null,now=Date.now()}={}){
  const base=buildMultiMissionCoordination({missions,predictions,workloadPressure,networkNeed,now});
  const priority=Array.isArray(base.priority)?base.priority:[];
  const clusters=buildClusters(priority);
  const pressure=buildPressure(base);
  const next=base.nextBestWork||selectNext(priority);
  const supportingSignals={
    meshAvailable:Boolean(mesh),
    meshHotspots:Array.isArray(mesh?.hotspots)?mesh.hotspots.length:0,
    meshLanes:Array.isArray(mesh?.lanes)?mesh.lanes.filter(x=>x?.lane&&x.lane!=="NORMAL_FLOW").length:0,
    temporalAvailable:Boolean(temporalCoordination),
    temporalAgingMissions:num(temporalCoordination?.agingMissionCount),
    temporalStaleMissions:num(temporalCoordination?.staleMissionCount)
  };
  const picture={
    scope:"TENANT_ACTIVE_MISSIONS",
    primaryQuestion:"WHAT NEEDS COORDINATION",
    missionCount:num(base.missionCount),
    pressuredMissionCount:priority.filter(x=>x.coordinationLevel!=="LOW").length,
    highPriorityMissionCount:priority.filter(x=>levelRank[x.coordinationLevel]>=3).length,
    resourcePressureCount:(base.resourcePressure||[]).filter(x=>x.level!=="LOW").length,
    dependencyPressureCount:(base.dependencyPressure||[]).filter(x=>x.level!=="LOW").length,
    networkNeedCount:(base.network||[]).length,
    conflictCount:(base.conflicts||[]).length,
    dominantLevel:priority[0]?.coordinationLevel||"LOW",
    nextMissionId:next?.missionId||null,
    nextReference:next?.reference||null,
    nextReason:next?.reason||next?.coordinationReason||null
  };
  return Object.freeze({
    ...base,
    version:ADAPTIVE_MULTI_MISSION_COORDINATION_VERSION,
    generatedAt:new Date(now).toISOString(),
    coordinationPicture:Object.freeze(picture),
    clusters:Object.freeze(clusters),
    pressure:Object.freeze(pressure),
    supportingSignals:Object.freeze(supportingSignals),
    safety:Object.freeze({...base.safety,persistsCoordination:false,changesResponsibility:false,changesCustody:false})
  });
}

export function validateAdaptiveMultiMissionCoordination(model){
  const problems=[];
  if(model?.version!==ADAPTIVE_MULTI_MISSION_COORDINATION_VERSION) problems.push("multi_mission_version_mismatch");
  if(model?.readOnly!==true) problems.push("coordination_not_read_only");
  if(model?.authoritative!==false) problems.push("coordination_claims_authority");
  if(model?.safety?.createsTruth!==false) problems.push("coordination_creates_truth");
  if(model?.safety?.createsAuthorization!==false) problems.push("coordination_creates_authorization");
  if(model?.safety?.executesAction!==false) problems.push("coordination_executes_action");
  if(model?.safety?.changesResponsibility!==false) problems.push("coordination_changes_responsibility");
  if(model?.safety?.changesCustody!==false) problems.push("coordination_changes_custody");
  if(model?.coordinationPicture?.nextMissionId && !model?.nextBestWork?.missionId) problems.push("picture_next_mission_without_next_work");
  return [...new Set(problems)];
}

function buildClusters(rows){
  const groups=new Map();
  for(const row of rows){
    const resource=`${text(row?.owner?.type)}:${num(row?.owner?.id)||"unassigned"}`;
    if(!groups.has(resource)) groups.set(resource,{key:`resource:${resource}`,type:"RESOURCE",label:row?.owner?.name||"Unassigned",missionIds:[],level:"LOW",reason:"Shared execution ownership across active missions."});
    const g=groups.get(resource);g.missionIds.push(num(row.missionId));g.level=maxLevel(g.level,row.coordinationLevel);
    if(row?.dependencyKey){
      const key=`dependency:${row.dependencyKey}`;
      if(!groups.has(key)) groups.set(key,{key,type:"DEPENDENCY",label:row.dependencyKey,missionIds:[],level:"LOW",reason:"Multiple active missions share a dependency signal."});
      const d=groups.get(key);d.missionIds.push(num(row.missionId));d.level=maxLevel(d.level,row.coordinationLevel);
    }
  }
  return [...groups.values()].filter(x=>x.missionIds.length>1||x.level!=="LOW").map(x=>Object.freeze({...x,missionIds:[...new Set(x.missionIds)].slice(0,20)})).sort((a,b)=>(levelRank[b.level]||0)-(levelRank[a.level]||0)||b.missionIds.length-a.missionIds.length).slice(0,20);
}
function buildPressure(base){
  return Object.freeze([
    {type:"RESOURCE",level:highest(base.resourcePressure),count:(base.resourcePressure||[]).filter(x=>x.level!=="LOW").length},
    {type:"DEPENDENCY",level:highest(base.dependencyPressure),count:(base.dependencyPressure||[]).filter(x=>x.level!=="LOW").length},
    {type:"NETWORK",level:(base.network||[]).length?"MEDIUM":"LOW",count:(base.network||[]).length},
    {type:"CONFLICT",level:(base.conflicts||[]).length?"HIGH":"LOW",count:(base.conflicts||[]).length}
  ]);
}
function highest(items){return (items||[]).reduce((best,x)=>(levelRank[x?.level]||0)>(levelRank[best]||0)?x.level:best,"LOW");}
function maxLevel(a,b){return (levelRank[b]||0)>(levelRank[a]||0)?b:a;}
function selectNext(rows){return rows[0]?{missionId:rows[0].missionId,reference:rows[0].reference,reason:rows[0].coordinationReason,action:rows[0].safeNext?.action,confidence:rows[0].confidence}:null;}
