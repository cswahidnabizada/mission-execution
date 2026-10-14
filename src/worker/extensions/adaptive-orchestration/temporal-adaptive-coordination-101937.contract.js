import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.19.37 — Temporal Adaptive Coordination.
 * Read-only temporal layer over authoritative current mission signals.
 * Uses canonical timestamps already present on mission records; it never stores
 * coordination state, changes truth, authorizes, assigns, transfers custody or executes.
 */
export const TEMPORAL_COORDINATION_VERSION=RELEASE_VERSION;
export const TEMPORAL_ADAPTIVE_COORDINATION_VERSION=RELEASE_VERSION;
const text=v=>String(v??"").trim(), num=v=>Number(v||0)||0, upper=v=>text(v).toUpperCase();
const terminal=new Set(["COMPLETED","CANCELLED","CANCELED","DELIVERED","CLOSED"]);
const levelRank={CRITICAL:100,HIGH:80,MEDIUM:55,LOW:25,INFO:10};
function date(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:null;}
function active(m){return !terminal.has(upper(m?.status));}
function ageHours(m,now){const at=date(m?.updated_at||m?.status_changed_at||m?.created_at);return at==null?null:Math.max(0,(now-at)/3600000);}
function riskWeight(m){const s=`${m?.status||""} ${m?.liveness||""} ${m?.priority||""} ${m?.priorityLevel||""} ${m?.level||""}`.toLowerCase();let x=0;if(/critical/.test(s))x+=70;else if(/high/.test(s))x+=45;else if(/medium/.test(s))x+=20;if(/breach|blocked|overdue|exception|escalat/.test(s))x+=40;if(/waiting|pending/.test(s))x+=12;return x;}
function trendFor(m,now){const age=ageHours(m,now);const created=date(m?.created_at), updated=date(m?.updated_at), changed=date(m?.status_changed_at);let direction="STABLE",score=0,reasons=[];
 if(age!=null&&age>=72){direction="AGING";score+=35;reasons.push(`No recent mission update for about ${Math.round(age)}h.`);}
 else if(age!=null&&age>=24){direction="DRIFTING";score+=20;reasons.push(`Mission has not updated for about ${Math.round(age)}h.`);}
 if(created!=null&&changed!=null&&changed-created>=72*3600000){score+=10;reasons.push("The current lifecycle stage has persisted for an extended period.");if(direction==="STABLE")direction="SLOWING";}
 if(riskWeight(m)>=80){score+=20;reasons.push("Current operational pressure makes unchanged state more significant.");}
 return {direction,score:Math.min(100,score),ageHours:age!=null?Math.round(age*10)/10:null,lastUpdatedAt:updated?new Date(updated).toISOString():changed?new Date(changed).toISOString():created?new Date(created).toISOString():null,reasons};}
export function buildTemporalCoordination({missions=[],coordination=null,mesh=null,networkPartners=[],now=Date.now()}={}){
 const activeM=missions.filter(active); const trends=activeM.map(m=>({missionId:num(m?.id||m?.missionId),reference:text(m?.reference||m?.mission_reference||`Mission ${num(m?.id||m?.missionId)}`),...trendFor(m,now)})).filter(x=>x.missionId).sort((a,b)=>b.score-a.score);
 const aging=trends.filter(x=>x.direction!=="STABLE");
 const pressure=activeM.map(m=>({missionId:num(m?.id||m?.missionId),weight:riskWeight(m),updatedAt:m?.updated_at||m?.status_changed_at||m?.created_at||null}));
 const stale=pressure.filter(x=>{const t=date(x.updatedAt);return t!=null&&(now-t)>=24*3600000;});
 const recent=pressure.filter(x=>{const t=date(x.updatedAt);return t!=null&&(now-t)<=8*3600000;});
 const systemTrend=aging.length>=Math.max(3,Math.ceil(activeM.length*.35))?"DEGRADING":stale.length>recent.length&&stale.length>=2?"AGING_PRESSURE":"STABLE";
 const hotspots=buildAdaptiveHotspots(coordination,activeM,trends);
 const temporalMesh=buildTemporalMeshSignals(mesh,trends);
 const networkTiming=buildNetworkTimingSignals(mesh,networkPartners,trends);
 const temporalPicture=buildTemporalPicture({systemTrend,activeMissionCount:activeM.length,agingMissionCount:aging.length,staleMissionCount:stale.length,recentlyUpdatedCount:recent.length,trends,hotspots,temporalMesh,networkTiming});
 const next=selectNext(trends,hotspots,pressure,temporalMesh);
 return Object.freeze({version:TEMPORAL_COORDINATION_VERSION,readOnly:true,authoritative:false,generatedAt:new Date(now).toISOString(),systemTrend,activeMissionCount:activeM.length,agingMissionCount:aging.length,staleMissionCount:stale.length,recentlyUpdatedCount:recent.length,trends:Object.freeze(trends.slice(0,30)),adaptiveHotspots:Object.freeze(hotspots),temporalPicture:Object.freeze(temporalPicture),temporalMesh:Object.freeze(temporalMesh),networkTiming:Object.freeze(networkTiming),nextAdaptiveCoordination:next?Object.freeze(next):null,safety:Object.freeze({createsTruth:false,createsAuthorization:false,executesAction:false,changesResponsibility:false,changesCustody:false,persistsCoordination:false})});
}
function buildAdaptiveHotspots(coordination,missions,trends){const out=[];const map=new Map(missions.map(m=>[num(m?.id||m?.missionId),m]));for(const h of (coordination?.hotspots||[])){const ids=(h.missionIds||[]).filter(id=>map.has(num(id)));const aging=ids.filter(id=>trends.find(t=>t.missionId===num(id)&&t.direction!=="STABLE"));if(aging.length)out.push({type:`TEMPORAL_${upper(h.type||"PRESSURE")}`,key:text(h.key),missionIds:ids.slice(0,8),agingMissionIds:aging.slice(0,8),reason:`${h.reason||"Shared operational pressure"} ${aging.length} affected mission${aging.length===1?" is":"s are"} also aging.` ,confidence:"MEDIUM"});}const top=trends.filter(x=>x.score>=35).slice(0,5);if(top.length>=2)out.push({type:"AGING_CLUSTER",key:"active-work-aging",missionIds:top.map(x=>x.missionId),agingMissionIds:top.map(x=>x.missionId),reason:"Multiple active missions are becoming less fresh at the same time; review sequencing before pressure compounds.",confidence:"MEDIUM"});return out.slice(0,12);}
function selectNext(trends,hotspots,pressure,temporalMesh=[]){const t=trends.find(x=>x.score>=35);if(t)return {missionId:t.missionId,reference:t.reference,reason:t.reasons[0]||"Mission trajectory is aging.",lane:"TEMPORAL_PROTECT",confidence:t.score>=60?"HIGH":"MEDIUM",requiresFreshValidation:true};const tm=temporalMesh.find(x=>x.score>=40);if(tm)return {missionId:tm.missionId,reference:tm.reference,reason:tm.reason,lane:"TEMPORAL_MESH",confidence:tm.confidence,requiresFreshValidation:true};const h=hotspots[0];if(h)return {missionId:(h.missionIds||[])[0]||null,reference:"Coordination hotspot",reason:h.reason,lane:h.type,confidence:h.confidence,requiresFreshValidation:true};return null;}

function buildTemporalMeshSignals(mesh,trends){
 const trendMap=new Map(trends.map(t=>[t.missionId,t])); const out=[];
 for(const lane of (mesh?.lanes||[])){ const id=num(lane.missionId); const t=trendMap.get(id); if(!id||!t) continue; const connections=num(lane.connections); let score=t.score+(connections>=3?20:connections>=1?8:0); if(t.direction!=="STABLE"&&connections) score+=12;
   if(score>=20) out.push({missionId:id,reference:t.reference,lane:text(lane.lane||"TEMPORAL_CONNECTED"),connections,connectionTypes:lane.connectionTypes||[],direction:t.direction,score:Math.min(100,score),reason:`${t.reasons[0]||"Temporal pressure is changing."}${connections?` The mission also has ${connections} coordination connection${connections===1?"":"s"}.`:""}`,confidence:score>=65?"HIGH":"MEDIUM",requiresFreshValidation:true}); }
 return out.sort((a,b)=>b.score-a.score).slice(0,20);
}
function buildNetworkTimingSignals(mesh,partners,trends){
 const networkIds=new Set((mesh?.edges||[]).filter(e=>e.type==='NETWORK').flatMap(e=>e.missionIds||[]).map(num));
 const out=trends.filter(t=>networkIds.has(t.missionId)&&t.direction!=="STABLE").slice(0,10).map(t=>({missionId:t.missionId,reference:t.reference,direction:t.direction,reason:`Network-connected work is ${t.direction.toLowerCase()}; review capacity timing before pressure compounds.`,candidatePartnerCount:(partners||[]).length,confidence:t.score>=60?"HIGH":"MEDIUM",requiresFreshValidation:true}));
 return out;
}
function buildTemporalPicture({systemTrend,activeMissionCount,agingMissionCount,staleMissionCount,recentlyUpdatedCount,trends,hotspots,temporalMesh,networkTiming}){
 const lead=trends[0]||null; return {primaryQuestion:"WHEN_COORDINATION_PRESSURE_IS_CHANGING",systemTrend,activeMissionCount,agingMissionCount,staleMissionCount,recentlyUpdatedCount,changeDirection:systemTrend==="DEGRADING"?"WORSENING":systemTrend==="AGING_PRESSURE"?"AGING":"STABLE",leadMission:lead?{missionId:lead.missionId,reference:lead.reference,direction:lead.direction,score:lead.score}:null,temporalHotspotCount:hotspots.length,connectedTemporalCount:temporalMesh.length,networkTimingCount:networkTiming.length,summary:systemTrend==="DEGRADING"?"Coordination pressure is degrading across active work; prioritize fresh validation and sequencing review.":systemTrend==="AGING_PRESSURE"?"Coordination pressure is aging; review connected work before stale state compounds.":"Coordination timing is currently stable; continue normal operational monitoring.",readOnly:true,requiresFreshValidation:true};
}

export function validateTemporalCoordination(model){const p=[];if(model?.version!==TEMPORAL_COORDINATION_VERSION)p.push("temporal_version_invalid");if(model?.readOnly!==true)p.push("temporal_not_read_only");if(model?.authoritative!==false)p.push("temporal_claims_authority");if(model?.safety?.persistsCoordination!==false)p.push("temporal_persists_state");if(!["STABLE","AGING_PRESSURE","DEGRADING"].includes(model?.systemTrend))p.push("temporal_system_trend_invalid");if(model?.nextAdaptiveCoordination?.missionId&&!Number(model.nextAdaptiveCoordination.missionId))p.push("temporal_next_mission_invalid");return [...new Set(p)];}
