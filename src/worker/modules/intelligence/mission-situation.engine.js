/**
 * Mission Situation Engine — V7.6.4
 * Pure/read-only interpretation layer.
 * It never reads D1 directly, never writes state, and never changes authorization.
 * Input must already be session-authorized by the existing services.
 */
import {operationalMissionHref} from "./operational-mission-route.js";

import {operationalNextLabel,lifecycleProgressPercent} from "../../domains/logistics/logistics-lifecycle.contract.js";

export function buildMissionSituations({items=[],events=[],focusMissionId=null,role="admin",now=Date.now()}={}){
  const itemByMission=new Map((items||[]).map(x=>[Number(x.missionId),x]));
  const grouped=new Map();
  for(const e of events||[]){
    // Network/ForYou are explicit decision/workflow events; preserve them independently.
    if(e.kind==="network"||e.kind==="foryou")continue;
    const id=Number(e.missionId||0);if(!id)continue;
    if(!grouped.has(id))grouped.set(id,[]);
    grouped.get(id).push(normalizeEvidence(e));
  }

  const situations=[];
  for(const [missionId,list] of grouped){
    list.sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0));
    const item=itemByMission.get(missionId)||{};
    const active=list.filter(e=>e.persistent&&!isResolution(e));
    const resolved=list.filter(isResolution);
    const deadline=active.find(e=>e.kind==="deadline");
    const traffic=active.find(e=>e.kind==="situation"&&/traffic/i.test(e.label||""));
    const waiting=active.find(e=>e.kind==="waiting");
    const address=active.find(e=>e.kind==="exception"&&/address/i.test(e.label||""));
    const damage=active.find(e=>e.kind==="exception"&&/damage/i.test(e.label||""));
    const staleLocation=active.find(e=>e.kind==="location");
    const expectedNext=(item.flow?.expectedNext||operationalNextLabel(item.status))??null;
    const primary=damage||address||deadline||waiting||traffic||active[0]||list[0]||null;
    if(!primary)continue;

    const correlation=correlate({primary,deadline,traffic,waiting,address,damage,staleLocation,item});
    const importance=deriveImportance({primary,deadline,traffic,waiting,address,damage,item});
    const story=compressStory({primary,deadline,traffic,waiting,address,damage,staleLocation,item,expectedNext});
    const resolution=resolved[0]||null;

    situations.push({
      missionId,
      reference:String(item.reference||primary.reference||missionId),
      status:item.status||null,
      expectedNext,
      correlationKey:`mission:${missionId}:${correlation}`,
      importance,
      story,
      at:primary.at||item.updatedAt||null,
      persistent:Boolean(active.length),
      resolved:Boolean(!active.length&&resolution),
      resolution:resolution?{label:resolution.label,at:resolution.at}:null,
      href:safeMissionHref(primary.href||item.link,missionId,role),
      actions:primary.actions||[],
      progress:progressFor(item.status),
      evidence:list.slice(0,8).map(e=>({type:e.evidenceType,kind:e.kind,code:e.code||null,at:e.at||null})),
      sourceEvent:primary
    });
  }

  situations.sort((a,b)=>{
    const af=a.missionId===Number(focusMissionId)?1:0,bf=b.missionId===Number(focusMissionId)?1:0;
    if(af!==bf)return bf-af;
    const rank={critical:4,high:3,medium:2,low:1};
    if(rank[a.importance]!==rank[b.importance])return rank[b.importance]-rank[a.importance];
    return Date.parse(b.at||0)-Date.parse(a.at||0);
  });
  return situations;
}

export function situationEvents(situations=[]){
  return situations.slice(0,16).map(s=>{
    const e=s.sourceEvent||{};
    return {
      ...e,
      kind:"situation_story",
      code:`situation:${s.correlationKey}`,
      label:s.story,
      detail:e.detail||(s.expectedNext&&!s.persistent?`Expected next: ${s.expectedNext}`:""),
      at:s.at,
      missionId:s.missionId,
      reference:s.reference,
      href:s.href,
      actions:s.actions,
      persistent:s.persistent,
      alert:s.importance==="critical"||s.importance==="high",
      situation:{importance:s.importance,expectedNext:s.expectedNext,progress:s.progress,evidence:s.evidence}
    };
  });
}

function safeMissionHref(href,missionId,role){const value=String(href||"");return value||operationalMissionHref(missionId,{role});}

function normalizeEvidence(e){
  return {...e,evidenceType:isDerived(e)?"derived":"fact"};
}
function isDerived(e){
  return ["deadline","waiting","timing","progress","location"].includes(String(e.kind||""));
}
function isResolution(e){return e.kind==="resolution"||/^exception_resolved:/.test(String(e.code||""));}
function correlate({damage,address,waiting,traffic,deadline,staleLocation,primary}){
  if(primary.kind==="assignment")return "assignment";
  if(damage)return "damage";
  if(address&&waiting)return "pickup-address-waiting";
  if(address)return "address";
  if(waiting&&deadline)return "waiting-deadline";
  if(traffic&&deadline)return "traffic-deadline";
  if(staleLocation)return "location-freshness";
  if(deadline)return "deadline";
  return String(primary.kind||primary.code||"activity").replace(/[^a-z0-9_-]/gi,"-").toLowerCase();
}
function deriveImportance({primary,deadline,traffic,waiting,address,damage,item}){
  if(damage||primary.alert&&primary.kind==="exception")return "critical";
  const mins=Number(deadline?.remainingMinutes);
  if(deadline&&Number.isFinite(mins)&&mins<=15)return "critical";
  if(address)return "high";
  if((traffic||waiting)&&deadline)return "high";
  if(primary.alert)return "high";
  if(item.level==="attention")return "medium";
  return "low";
}
function compressStory({primary,deadline,traffic,waiting,address,damage,staleLocation,item,expectedNext}){
  const ref=item.reference||primary.reference||item.missionId||"mission";
  if(primary.kind==="assignment")return primary.label;
  if(damage)return damage.label;
  if(address&&waiting)return `${address.label}. ${actor(waiting)} is still waiting at pickup.`;
  if(address&&deadline)return `${address.label}. The deadline is ${deadlineText(deadline)}.`;
  if(traffic&&deadline)return `${actor(traffic)} is in traffic and Mission ${ref} deadline is ${deadlineText(deadline)}.`;
  if(waiting&&deadline)return `${actor(waiting)} is still waiting at pickup and Mission ${ref} deadline is ${deadlineText(deadline)}.`;
  if(staleLocation&&["PickedUp","InTransit"].includes(item.status))return `${staleLocation.label}. Mission ${ref} is ${statusText(item.status)}.`;
  if(primary.kind==="flow"&&expectedNext)return `${primary.label}. Next expected step: ${expectedNext}.`;
  return primary.label||`Mission ${ref} updated.`;
}
function deadlineText(e){
  const n=Number(e.remainingMinutes);
  if(Number.isFinite(n))return n<=0?"due now":`in ${n} minute${n===1?"":"s"}`;
  return "approaching";
}
function actor(e){
  const a=String(e.actor||"The executor");
  return a==="Mission"?"The executor":a;
}
function statusText(s){return ({PickedUp:"picked up",InTransit:"in transit"})[s]||String(s||"in progress").toLowerCase();}
function progressFor(status){return lifecycleProgressPercent(status)??0;}
