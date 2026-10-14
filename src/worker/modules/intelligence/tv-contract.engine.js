import {lifecycleProgressPercent} from "../../domains/logistics/logistics-lifecycle.contract.js";
import {actionExperience} from "../../extensions/action-experience/action-experience.contract.js";
import {buildTvPresentation} from "../../extensions/mission-tv-presentation/tv-presentation.contract.js";
import {operationalMissionHref} from "./operational-mission-route.js";
/**
 * Mission TV Contract V1
 *
 * Final read-only boundary between mission intelligence and the browser.
 * It does not authorize, query, mutate, or infer mission truth independently.
 * It only packages already-authorized engine output into a stable rendering contract.
 */
export const TV_CONTRACT_VERSION="1.0";

export function buildTvContract({
  audience="tenant",events=[],focus=null,priority=null,health=null,status=null,
  missionId=null,reference="",perspective=null,now=Date.now()
}={}){
  const prepared=(events||[]).map(e=>normalizeEvent(e,{
    audience,focus,priority,health,status,missionId,reference,perspective,now
  }));
  const items=deduplicate(prepared).sort(compareItems).slice(0,16);
  const primary=items[0]||fallbackItem({audience,focus,priority,health,status,missionId,reference,perspective,now});

  return Object.freeze({
    version:TV_CONTRACT_VERSION,
    audience,
    available:Boolean(primary),
    primaryId:primary?.id||null,
    items:primary&&!items.length?[primary]:items,
    generatedAt:new Date(now).toISOString()
  });
}

function normalizeEvent(e,ctx){
  const missionId=Number(e?.missionId||ctx.missionId||0)||null;
  const reference=String(e?.reference||ctx.reference||"");
  const lifecycle=lifecycleFor(e,ctx.now);
  const severity=severityFor(e);
  const p=progressFor(e?.status);
  const actionList=normalizeActions(e?.actions,ctx.focus,e,missionId,ctx.audience);
  const display=displayFor(e,{...ctx,missionId,reference});
  const correlation=String(e?.situation?.correlationKey||e?.code||e?.kind||"event");
  const base={
    id:`tv:${missionId||0}:${stable(correlation)}:${stable(e?.at||"")}`,
    missionId,reference,stateToken:String(e?.stateToken||"")||null,
    type:String(e?.kind||"event"),
    situation:String(e?.code||correlation),
    headline:display.headline,
    detail:display.detail,
    occurredAt:e?.at||null,
    lifecycle,
    severity,
    priority:priorityLevel(e),
    progress:p,
    actor:String(e?.actor||""),
    viewer:String(ctx.audience||"tenant"),
    href:safeMissionHref(e?.href,missionId,ctx.audience),
    actions:actionList,
    persistent:Boolean(e?.persistent),
    resolved:lifecycle==="resolved",
    alert:Boolean(e?.alert),
    icon:String(e?.icon||iconForSeverity(severity)),
    localTime:display.localTime||null,
    evidence:Array.isArray(e?.situation?.evidence)?e.situation.evidence:[],
    source:Object.freeze({
      kind:String(e?.kind||"event"),
      code:String(e?.code||""),
      evidencePreserved:true
    })
  };
  return Object.freeze({...base,presentation:buildTvPresentation(base)});
}

function displayFor(e,ctx){
  // Business meaning comes from upstream event labels/details. Only structured
  // local-time placeholders are left for the browser to format in the viewer's timezone.
  if(e?.kind==="assignment"&&e?.assignment?.personal){
    const a=e.assignment;
    return {
      headline:String(a.assigningCompany||"The company")+" assigned you",
      detail:[String(a.route||""),a.pickupAt?"Pickup at {localTime}":"",durationText(a.remainingMinutes)].filter(Boolean).join(" · "),
      localTime:a.pickupAt?{value:a.pickupAt,token:"{localTime}"}:null
    };
  }
  if(e?.kind==="deadline"&&e?.deadlineAt){
    const left=Number(e.remainingMinutes),personal=Boolean(e.personal);
    return {
      headline:`${personal?"Your m":"M"}ission ${ctx.reference||ctx.missionId} deadline is at {localTime}${Number.isFinite(left)&&left>=0?` (${left} minute${left===1?"":"s"} left)`:""}`,
      detail:String(e.detail||""),
      localTime:{value:e.deadlineAt,token:"{localTime}"}
    };
  }
  return {
    headline:String(e?.label||ctx.focus?.title||ctx.focus?.task||"Mission update"),
    detail:String(e?.detail||""),
    localTime:null
  };
}

function fallbackItem(ctx){
  if(!ctx.focus?.available)return null;
  const missionId=Number(ctx.focus.missionId||ctx.missionId||0)||null;
  const base={
    id:`tv:${missionId||0}:focus:${stable(ctx.focus.reasonCode||ctx.focus.task||"focus")}`,
    missionId,
    reference:String(ctx.focus.reference||ctx.reference||""),
    type:"focus",
    situation:String(ctx.focus.reasonCode||"focus"),
    headline:String(ctx.focus.title||ctx.focus.task||"Review mission"),
    detail:String(ctx.focus.reason||ctx.health?.summary||""),
    occurredAt:null,
    lifecycle:"active",
    severity:severityFromPriority(ctx.focus.priority||ctx.priority?.level),
    priority:String(ctx.focus.priority||ctx.priority?.level||"low"),
    progress:progressFor(ctx.status),
    actor:"",
    viewer:String(ctx.audience||"tenant"),
    href:safeMissionHref(ctx.focus.href,missionId,ctx.audience),
    actions:ctx.focus.href?[{label:String(ctx.focus.task||"OPEN"),href:ctx.focus.href,kind:"navigate"}]:[],
    persistent:true,resolved:false,alert:false,icon:iconForSeverity(severityFromPriority(ctx.focus.priority||ctx.priority?.level)),
    localTime:null,evidence:[],source:{kind:"focus",code:String(ctx.focus.reasonCode||""),evidencePreserved:true}
  };
  return Object.freeze({...base,presentation:buildTvPresentation(base)});
}

function normalizeActions(actions,focus,event,missionId,audience){
  if(Array.isArray(actions)&&actions.length)return actions.map(a=>actionExperience({
    code:String(a.code||""),
    label:String(a.label||"OPEN"),
    kind:a.dismiss?"dismiss":a.kind?String(a.kind):String(a.method||"").toUpperCase()==="POST"?"command":"navigate",
    missionId:Number(a.missionId||missionId||0)||null,
    stateToken:String(a.stateToken||event?.stateToken||"")||null,
    href:safeMissionHref(a.href,missionId,audience),
    endpoint:a.endpoint||null,
    method:a.method||null,
    body:a.body&&typeof a.body==="object"?a.body:null,
    confirm:a.confirm||null,
    requirementId:Number(a.requirementId||0)||null,
    dismiss:Boolean(a.dismiss)
  },{mission:{reference:event?.reference||""}}));
  if(focus?.available&&Number(focus.missionId||missionId)===Number(missionId)&&focus.href)
    return [{label:String(focus.task||"OPEN MISSION"),kind:"navigate",missionId:Number(missionId||0)||null,stateToken:String(event?.stateToken||"")||null,href:safeMissionHref(focus.href,missionId,audience),endpoint:null,method:null,confirm:null,dismiss:false}];
  const href=safeMissionHref(event?.href,missionId,audience);
  return href?[{label:"OPEN",kind:"navigate",missionId:Number(missionId||0)||null,stateToken:String(event?.stateToken||"")||null,href,endpoint:null,method:null,confirm:null,dismiss:false}]:[];
}

function deduplicate(items){
  const best=new Map();
  for(const item of items){
    const key=semanticKey(item);
    const prev=best.get(key);
    if(!prev||compareItems(item,prev)<0)best.set(key,item);
  }
  return [...best.values()];
}
function semanticKey(x){
  // Same mission + same situation = one current TV story; evidence remains upstream.
  const semantic=String(x.situation||x.type||"event").replace(/^situation:mission:\d+:/,"");
  return `${x.missionId||0}:${semantic}`;
}
function compareItems(a,b){
  if(Boolean(a.persistent)!==Boolean(b.persistent))return Number(Boolean(b.persistent))-Number(Boolean(a.persistent));
  const lp={detected:4,active:3,changed:2,resolved:1,historical:0};
  if(lp[a.lifecycle]!==lp[b.lifecycle])return lp[b.lifecycle]-lp[a.lifecycle];
  const pp={critical:4,high:3,medium:2,low:1};
  if(pp[a.priority]!==pp[b.priority])return pp[b.priority]-pp[a.priority];
  return Date.parse(b.occurredAt||0)-Date.parse(a.occurredAt||0);
}
function lifecycleFor(e,now){
  if(e?.kind==="resolution"||e?.resolved)return "resolved";
  if(e?.persistent)return "active";
  if(e?.kind==="flow"||String(e?.code||"").startsWith("status:"))return "changed";
  const t=Date.parse(e?.at||"");
  if(Number.isFinite(t)&&Math.max(0,now-t)<=5*60*1000)return "detected";
  return "historical";
}
function severityFor(e){
  if(e?.alert)return "critical";
  const imp=e?.situation?.importance;
  if(["critical","high","medium","low"].includes(imp))return imp;
  return severityFromPriority(e?.missionPriority);
}
function severityFromPriority(v){
  return v==="critical"?"critical":v==="high"?"high":v==="medium"?"medium":"low";
}
function priorityLevel(e){
  if(e?.alert)return "critical";
  const imp=e?.situation?.importance;
  if(["critical","high","medium","low"].includes(imp))return imp;
  return ["critical","high","medium","low"].includes(e?.missionPriority)?e.missionPriority:"low";
}
function progressFor(status){return lifecycleProgressPercent(status)??0;}
function durationText(minutes){
  const n=Number(minutes);if(!Number.isFinite(n))return "";
  if(n<=0)return "Pickup time reached";
  const h=Math.floor(n/60),m=n%60;
  if(h&&m)return `You have ${h}h ${m}m`;
  if(h)return `You have ${h}h`;
  return `You have ${m}m`;
}
function iconForSeverity(v){return v==="critical"?"🚨":v==="high"?"⚠️":v==="medium"?"⏳":"●";}
function missionHref(id,audience){return operationalMissionHref(id,{role:audience});}
function safeMissionHref(href,id,audience){const value=String(href||"");return value||missionHref(id,audience);}
function stable(v){return String(v||"").replace(/[^a-z0-9:_-]/gi,"-").slice(0,120);}
