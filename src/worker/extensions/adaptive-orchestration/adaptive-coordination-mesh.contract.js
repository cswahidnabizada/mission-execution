import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.19.27 — Adaptive Coordination Mesh.
 * Read-only portfolio coordination over existing 10.19.26 coordination signals.
 * It identifies shared pressure, sequencing opportunities and safe review lanes.
 * It never creates truth, authorization, custody, responsibility or execution.
 */
export const ADAPTIVE_COORDINATION_MESH_VERSION=RELEASE_VERSION;
const text=v=>String(v??"").trim(), num=v=>Number(v||0)||0, upper=v=>text(v).toUpperCase();
const terminal=new Set(["COMPLETED","CANCELLED","CANCELED","DELIVERED"]);
const rank={CRITICAL:100,HIGH:80,MEDIUM:55,LOW:25,INFO:10};
export function buildAdaptiveCoordinationMesh({coordination=null,missions=[],now=Date.now()}={}){
 const rows=Array.isArray(coordination?.priority)?coordination.priority:[];
 const missionById=new Map((missions||[]).map(m=>[num(m?.id),m]));
 const active=(missions||[]).filter(m=>!terminal.has(upper(m?.status)));
 const resource=(coordination?.resourcePressure||[]).filter(x=>x.level!=="LOW");
 const dependency=(coordination?.dependencyPressure||[]).filter(x=>x.level!=="LOW");
 const hotspots=buildHotspots(resource,dependency);
 const lanes=buildLanes(rows,missionById,resource,dependency);
 const opportunities=buildOpportunities(rows,resource,dependency);
 const next=selectNext(lanes,opportunities);
 return Object.freeze({version:ADAPTIVE_COORDINATION_MESH_VERSION,readOnly:true,authoritative:false,generatedAt:new Date(now).toISOString(),activeMissionCount:active.length,coordinationCoverage:rows.length,hotspots:Object.freeze(hotspots),lanes:Object.freeze(lanes),opportunities:Object.freeze(opportunities),nextBestCoordination:next?Object.freeze(next):null,safety:Object.freeze({createsTruth:false,createsAuthorization:false,executesAction:false,changesResponsibility:false,changesCustody:false,persistsCoordination:false})});
}
export function validateAdaptiveCoordinationMesh(model){const p=[];if(model?.readOnly!==true)p.push("mesh_not_read_only");if(model?.authoritative!==false)p.push("mesh_claims_authority");if(model?.safety?.createsTruth!==false)p.push("mesh_creates_truth");if(model?.safety?.createsAuthorization!==false)p.push("mesh_creates_authorization");if(model?.safety?.executesAction!==false)p.push("mesh_executes_action");if(model?.nextBestCoordination?.missionId&&!Number(model.nextBestCoordination.missionId))p.push("next_coordination_invalid_mission");return [...new Set(p)];}
function buildHotspots(resource,dependency){const out=[];for(const x of resource)out.push({type:"RESOURCE",key:text(x.key),level:upper(x.level),missionIds:(x.missionIds||[]).slice(0,12),reason:text(x.reason)});for(const x of dependency)out.push({type:"DEPENDENCY",key:text(x.key),level:upper(x.level),missionIds:(x.missionIds||[]).slice(0,12),reason:text(x.reason)});return out.slice(0,16);}
function buildLanes(rows,byId,resource,dependency){return rows.slice(0,24).map(r=>{const m=byId.get(num(r.missionId))||{};const sharedResource=resource.find(x=>(x.missionIds||[]).includes(num(r.missionId)));const sharedDependency=dependency.find(x=>(x.missionIds||[]).includes(num(r.missionId)));const urgency=rank[upper(r.coordinationLevel)]||25;const lane=sharedDependency?"DEPENDENCY_FIRST":sharedResource?"CAPACITY_FIRST":urgency>=80?"PROTECT_NOW":"NORMAL_FLOW";return {missionId:num(r.missionId),reference:text(r.reference),lane,reason:laneReason(lane,sharedResource,sharedDependency),coordinationScore:num(r.coordinationScore),safeAction:Boolean(r.safeNext?.available),action:r.safeNext?.action?.label||null,owner:text(m?.executor_name||m?.driver_name||r.owner?.name||"Unassigned"),requiresFreshValidation:true};});}
function laneReason(lane,res,dep){if(lane==="DEPENDENCY_FIRST")return dep?.reason||"Shared dependency pressure affects this mission.";if(lane==="CAPACITY_FIRST")return res?.reason||"Shared execution capacity is under pressure.";if(lane==="PROTECT_NOW")return "High operational pressure warrants immediate operator review.";return "No cross-mission hotspot currently requires reprioritization.";}
function buildOpportunities(rows,resource,dependency){const out=[];for(const x of resource.filter(x=>x.level==="HIGH")){if((x.missionIds||[]).length<2)continue;out.push({type:"CAPACITY_REBALANCE_REVIEW",key:x.key,missionIds:x.missionIds.slice(0,8),reason:"Several missions share a high-pressure execution resource; review sequencing or authorized capacity options.",confidence:"MEDIUM",readOnly:true});}for(const x of dependency.filter(x=>x.level==="HIGH")){if((x.missionIds||[]).length<2)continue;out.push({type:"DEPENDENCY_SEQUENCE_REVIEW",key:x.key,missionIds:x.missionIds.slice(0,8),reason:"Several missions depend on the same constrained dependency; review the authoritative dependency and sequencing state.",confidence:"MEDIUM",readOnly:true});}const urgent=rows.filter(r=>["CRITICAL","HIGH"].includes(upper(r.coordinationLevel))).slice(0,3);if(urgent.length>1)out.push({type:"PORTFOLIO_PRIORITY_REVIEW",missionIds:urgent.map(r=>num(r.missionId)),reason:"Multiple high-priority missions compete for operator attention; review the current authoritative queue before acting.",confidence:"HIGH",readOnly:true});return out.slice(0,10);}
function selectNext(lanes,opportunities){const urgent=lanes.find(x=>x.lane==="DEPENDENCY_FIRST"||x.lane==="CAPACITY_FIRST"||x.lane==="PROTECT_NOW");if(urgent)return {missionId:urgent.missionId,reference:urgent.reference,lane:urgent.lane,reason:urgent.reason,action:urgent.safeAction?urgent.action:null,confidence:"MEDIUM",requiresFreshValidation:true};const op=opportunities[0];return op?{missionId:(op.missionIds||[])[0]||null,reference:"Coordination review",lane:op.type,reason:op.reason,action:null,confidence:op.confidence,requiresFreshValidation:true}:null;}
