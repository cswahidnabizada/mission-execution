import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.19.36 — Adaptive Coordination Mesh.
 * Read-only relationship layer over the canonical multi-mission coordination picture.
 * Answers WHERE/HOW coordination is connected. It never creates truth, authorization,
 * responsibility, custody or execution authority.
 */
import { buildAdaptiveCoordinationMesh } from './adaptive-coordination-mesh.contract.js';

export const ADAPTIVE_COORDINATION_MESH_101936_VERSION=RELEASE_VERSION;
const text=v=>String(v??'').trim();
const num=v=>Number(v||0)||0;
const upper=v=>text(v).toUpperCase();
const rank={CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1,INFO:0};

export function buildAdaptiveCoordinationMesh101936({coordination=null,missions=[],networkNeed=[],networkPartners=[],now=Date.now()}={}){
  const base=buildAdaptiveCoordinationMesh({coordination,missions,now});
  const nodes=buildNodes(base,missions);
  const edges=buildEdges(base,coordination,networkNeed,missions);
  const hotspots=buildMeshHotspots(base,edges);
  const lanes=buildMeshLanes(base,edges);
  const opportunities=buildMeshOpportunities(base,edges,networkPartners);
  const next=selectNext(lanes,opportunities);
  return Object.freeze({
    ...base,
    version:ADAPTIVE_COORDINATION_MESH_101936_VERSION,
    generatedAt:new Date(now).toISOString(),
    mesh:{
      primaryQuestion:'WHERE_AND_HOW_COORDINATION_IS_CONNECTED',
      nodeCount:nodes.length,
      edgeCount:edges.length,
      hotspotCount:hotspots.length,
      laneCount:lanes.length,
      networkConnectionCount:edges.filter(e=>e.type==='NETWORK').length,
      dependencyConnectionCount:edges.filter(e=>e.type==='DEPENDENCY').length,
      resourceConnectionCount:edges.filter(e=>e.type==='RESOURCE').length
    },
    nodes:Object.freeze(nodes),
    edges:Object.freeze(edges),
    hotspots:Object.freeze(hotspots),
    lanes:Object.freeze(lanes),
    opportunities:Object.freeze(opportunities),
    nextBestCoordination:next?Object.freeze(next):null,
    safety:Object.freeze({...base.safety,persistsCoordination:false,createsTruth:false,createsAuthorization:false,executesAction:false,changesResponsibility:false,changesCustody:false})
  });
}

export function validateAdaptiveCoordinationMesh101936(model){
  const p=[];
  if(model?.version!==ADAPTIVE_COORDINATION_MESH_101936_VERSION)p.push('mesh_version_mismatch');
  if(model?.readOnly!==true)p.push('mesh_not_read_only');
  if(model?.authoritative!==false)p.push('mesh_claims_authority');
  if(model?.safety?.createsTruth!==false)p.push('mesh_creates_truth');
  if(model?.safety?.createsAuthorization!==false)p.push('mesh_creates_authorization');
  if(model?.safety?.executesAction!==false)p.push('mesh_executes_action');
  if(model?.safety?.changesResponsibility!==false)p.push('mesh_changes_responsibility');
  if(model?.safety?.changesCustody!==false)p.push('mesh_changes_custody');
  if((model?.edges||[]).some(e=>!e.source||!e.target||!e.type))p.push('mesh_edge_invalid');
  if((model?.nextBestCoordination?.missionId)&&!Number(model.nextBestCoordination.missionId))p.push('next_coordination_invalid_mission');
  return [...new Set(p)];
}

function buildNodes(base,missions){
  const ids=new Set();
  for(const row of (base.lanes||[]))ids.add(num(row.missionId));
  for(const m of missions||[])if(!['COMPLETED','CANCELLED','CANCELED','DELIVERED'].includes(upper(m?.status)))ids.add(num(m?.id));
  return [...ids].filter(Boolean).slice(0,100).map(id=>{
    const lane=(base.lanes||[]).find(x=>num(x.missionId)===id);
    return {id:`mission:${id}`,type:'MISSION',missionId:id,reference:text(lane?.reference||`Mission ${id}`),lane:text(lane?.lane||'NORMAL_FLOW'),level:text(lane?.level||'LOW'),requiresFreshValidation:true};
  });
}
function addEdge(out,type,source,target,level,reason,missionIds=[]){
  if(source===target)return;
  const key=`${type}:${source}:${target}`;
  if(out.some(e=>e.key===key))return;
  out.push({key,type,source,target,level:upper(level||'MEDIUM'),reason:text(reason),missionIds:[...new Set(missionIds.map(num).filter(Boolean))].slice(0,20),readOnly:true,requiresFreshValidation:true});
}
function buildEdges(base,coordination,networkNeed,missions){
  const out=[];
  for(const x of base.hotspots||[]){
    const ids=(x.missionIds||[]).map(num).filter(Boolean);
    for(let i=1;i<ids.length;i++)addEdge(out,x.type==='DEPENDENCY'?'DEPENDENCY':'RESOURCE',`mission:${ids[0]}`,`mission:${ids[i]}`,x.level,x.reason,ids);
  }
  for(const n of networkNeed||[]){
    const id=num(n.missionId);if(!id)continue;
    const target=`network:${text(n.need||'execution_capacity')}`;
    addEdge(out,'NETWORK',`mission:${id}`,target,n.confidence==='HIGH'?'HIGH':'MEDIUM',n.reason||n.recommendation||'Existing network-capacity signal connects this mission to Network.',[id]);
  }
  // Explicit mission-to-mission references already present in canonical mission projections.
  for(const m of missions||[]){
    const id=num(m?.id);const dep=num(m?.blocking_mission_id||m?.blockingMissionId||m?.dependency_mission_id||m?.dependencyMissionId);
    if(id&&dep)addEdge(out,'DEPENDENCY',`mission:${id}`,`mission:${dep}`,'HIGH','Canonical mission projection exposes a blocking/dependency relationship.',[id,dep]);
  }
  return out.slice(0,160);
}
function buildMeshHotspots(base,edges){
  const grouped=new Map();
  for(const e of edges){const key=`${e.type}:${e.target}`;const g=grouped.get(key)||{key,type:e.type,target:e.target,level:'LOW',missionIds:[],connectionCount:0,reason:e.reason};g.level=(rank[e.level]||0)>(rank[g.level]||0)?e.level:g.level;g.missionIds.push(...e.missionIds);g.connectionCount++;if(e.reason)g.reason=e.reason;grouped.set(key,g);}
  return [...grouped.values()].map(x=>({...x,missionIds:[...new Set(x.missionIds)].slice(0,20)})).filter(x=>x.connectionCount>1||rank[x.level]>=3).sort((a,b)=>(rank[b.level]-rank[a.level])||b.connectionCount-a.connectionCount).slice(0,20);
}
function buildMeshLanes(base,edges){
  return (base.lanes||[]).slice(0,30).map(l=>{
    const related=edges.filter(e=>e.missionIds.includes(num(l.missionId)));
    const types=[...new Set(related.map(e=>e.type))];
    const lane=types.includes('DEPENDENCY')?'DEPENDENCY_CONNECTED':types.includes('RESOURCE')?'CAPACITY_CONNECTED':types.includes('NETWORK')?'NETWORK_CONNECTED':l.lane;
    return {...l,lane,connections:related.length,connectionTypes:types,meshReason:related[0]?.reason||l.reason};
  });
}
function buildMeshOpportunities(base,edges,partners){
  const out=[];
  for(const h of buildMeshHotspots(base,edges))if(h.missionIds.length>1)out.push({type:`${h.type}_MESH_REVIEW`,target:h.target,missionIds:h.missionIds,reason:h.reason,connectionCount:h.connectionCount,confidence:h.level==='CRITICAL'||h.level==='HIGH'?'HIGH':'MEDIUM',readOnly:true});
  const networkEdges=edges.filter(e=>e.type==='NETWORK');
  if(networkEdges.length && (partners||[]).length)out.push({type:'NETWORK_CAPACITY_REVIEW',missionIds:[...new Set(networkEdges.flatMap(e=>e.missionIds))].slice(0,10),reason:'Existing Network-capacity signals connect active missions to available network context; review through the secured Network/Operations flow.',candidatePartnerCount:(partners||[]).length,confidence:'MEDIUM',readOnly:true});
  return out.slice(0,12);
}
function selectNext(lanes,ops){const x=lanes.find(l=>['DEPENDENCY_CONNECTED','CAPACITY_CONNECTED','NETWORK_CONNECTED','PROTECT_NOW'].includes(l.lane));if(x)return {missionId:x.missionId,reference:x.reference,lane:x.lane,reason:x.meshReason||x.reason,action:x.safeAction?x.action:null,confidence:'MEDIUM',requiresFreshValidation:true};const o=ops[0];return o?{missionId:(o.missionIds||[])[0]||null,reference:'Coordination review',lane:o.type,reason:o.reason,action:null,confidence:o.confidence,requiresFreshValidation:true}:null;}
