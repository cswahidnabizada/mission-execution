import {listForSession} from "../missions/missions.service.js";
import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
import * as missionRepo from "../../repositories/mission.repository.js";
import {resolveMissionAccess} from "../../security/mission-access.js";
import {requireWorkTrust} from "../verification/verification.service.js";
import {audit} from "../../security/audit.js";
import {notifyTenantException} from "../notifications/notifications.service.js";
import {buildMissionConditions} from "../intelligence/mission-conditions.js";
import {buildMissionContext} from "../intelligence/mission-context.js";
import {deriveMissionFlow} from "../intelligence/mission-flow.engine.js";
import {deriveMissionHealth} from "../intelligence/mission-health.engine.js";
import {attentionFromHealthSignal,attentionLevelFromScore} from "../intelligence/attention-policy.engine.js";
import {buildFocusRecommendation} from "../intelligence/focus.engine.js";
import {coordinateMissionIntelligence} from "../intelligence/mission-intelligence.coordinator.js";
import * as executorOperationalRepo from "../../repositories/executor-operational.repository.js";
import {summary as awarenessSummary} from "../awareness/awareness.service.js";
import {operationalEventsForSession} from "../intelligence/operational-events.service.js";
import {operationalMissionHref} from "../intelligence/operational-mission-route.js";

const EXCEPTIONS={
  Traffic:{severity:"medium",label:"Traffic"},
  Waiting:{severity:"medium",label:"Waiting"},
  AddressProblem:{severity:"high",label:"Address problem"},
  ReceiverMissing:{severity:"high",label:"Receiver missing"},
  Damage:{severity:"critical",label:"Damage"},
  LoadingDelay:{severity:"medium",label:"Loading delay"},
  UnloadingDelay:{severity:"medium",label:"Unloading delay"},
  Other:{severity:"medium",label:"Operational exception"}
};
const SITUATION_POINTS={Traffic:18,Break:6,Unavailable:25};
const STATUS_LABELS={Pending:"Pending",Arrived:"Arrived",PickedUp:"Picked Up",InTransit:"In Transit",Delivered:"Delivered",Completed:"Completed"};

export async function attentionForSession(env,session,{limit=20}={}){
  try {
    return await attentionForSessionCanonical(env,session,{limit});
  } catch (error) {
    console.error("[Attention] canonical read degraded",{
      tenantId:Number(session?.tenantId||0),
      role:String(session?.role||"unknown"),
      error:String(error?.message||error).slice(0,240)
    });
    return safeAttentionFallback(session,{limit,error});
  }
}

async function attentionForSessionCanonical(env,session,{limit=20}={}){
  const missions=await listForSession(env,session,{});
  const active=missions.filter(m=>!isLifecycleTerminal(m.status)).slice(0,120);
  if(!active.length){
    const summary={critical:0,attention:0,watch:0,total:0};
    const focus=buildFocusRecommendation([],{role:session.role});
    let awareness;try{awareness=await awarenessSummary(env,session);}catch(error){awareness={active:0,newCount:0,latest:null,degraded:true,degradedReason:String(error?.message||error).slice(0,240)};}
    const operationalEvents=await operationalEventsForSession(env,session,missions,24);
    return {items:[],summary,focus,intelligence:coordinateMissionIntelligence({items:[],summary,focus,awareness,audience:session.role,operationalEvents})};
  }

  const byOwner=new Map();
  for(const m of active){
    const owner=Number(m.company_id);
    if(!byOwner.has(owner))byOwner.set(owner,[]);
    byOwner.get(owner).push(Number(m.id));
  }

  const exceptions=[],messages=[];
  for(const [owner,ids] of byOwner){
    const [ex,msg]=await Promise.all([
      missionRepo.listOpenExceptions(env,owner,ids),
      session.role==="admin"?missionRepo.listOpenAttentionMessages(env,owner,ids):Promise.resolve([])
    ]);
    exceptions.push(...ex);messages.push(...msg);
  }

  const exceptionMap=groupByMission(exceptions),messageMap=groupByMission(messages);
  const [situationResult,executorSituationResult]=await Promise.allSettled([
    loadSituations(env,session,active),
    loadExecutorSituations(env,session,active)
  ]);
  const situationMap=situationResult.status==="fulfilled"?situationResult.value:new Map();
  const executorSituationMap=executorSituationResult.status==="fulfilled"?executorSituationResult.value:new Map();
  const latestMissionByDriver=latestByDriver(session,active);
  const now=Date.now();

  const items=[];
  for(const mission of active){
    const reasons=[];
    let score=0;

    const accessKind=Number(mission.shared_access||0)===1?"shared-tenant":"owner";
    const context=buildMissionContext(mission,{role:session.role,accessKind,now});
    const conditions=buildMissionConditions(context);
    const flow=deriveMissionFlow(conditions);
    const health=deriveMissionHealth(conditions,flow);

    const actor=missionActor(session,mission);
    for(const signal of health.signals){
      const attention=attentionFromHealthSignal(signal,{role:session.role});
      if(!attention)continue;
      const meta=healthSignalMeta(signal.code);
      const event=healthEvent(signal,conditions,mission,actor,now,session);
      add(reasons,attention.code,meta.icon,event.label,attention.points,event);
      score+=attention.points;
    }

    for(const ex of exceptionMap.get(Number(mission.id))||[]){
      const pts=ex.severity==="critical"?50:ex.severity==="high"?35:20;
      const actorName=exceptionActor(ex,mission,session);
      const base=exceptionLabel(ex.exception_type),ref=mission.reference||mission.id;
      const exLabel=ex.exception_type==="Damage"?`Damage report from ${actorName}`:ex.exception_type==="AddressProblem"?`Mission ${ref} has an address problem`:ex.exception_type==="ReceiverMissing"?`Mission ${ref} has no receiver available`:ex.exception_type==="Traffic"?`${actorName} reported traffic on Mission ${ref}`:`Mission ${ref}: ${base}`;
      const detail=ex.note?short(ex.note,100):"";
      add(reasons,`exception:${ex.id}`,ex.exception_type==="Damage"?"🚨":"⚠️",detail?`${exLabel} · ${detail}`:exLabel,pts,{kind:"exception",label:exLabel,actor:actorName,at:ex.created_at||ex.updated_at||mission.updated_at,persistent:true,alert:ex.severity==="critical"||ex.exception_type==="Damage"||ex.exception_type==="AddressProblem",detail});
      score+=pts;
    }

    const importantMessages=session.role==="admin"?(messageMap.get(Number(mission.id))||[]):[];
    if(importantMessages.length){
      const newest=importantMessages[0];
      add(reasons,"important_message","💬",`${importantMessages.length} participant message${importantMessages.length===1?"":"s"} need attention`,20,{kind:"message",label:short(newest?.message||"Important participant message",100),actor:newest?.sender_role||"participant",at:newest?.created_at||mission.updated_at,persistent:true,alert:false});
      score+=20;
    }

    const driverKey=driverKeyFor(session,mission);
    const situation=situationMap.get(driverKey);
    if(situation&&latestMissionByDriver.get(driverKey)===Number(mission.id)){
      const pts=SITUATION_POINTS[situation.situation]||0;
      if(pts){const who=missionActor(session,mission);const personal=session.role==="driver";const label=personal?`Your ${situationDisplay(situation.situation)} is on${situation.situation_note?` · ${short(situation.situation_note,70)}`:""}`:`${who} is ${situationPhrase(situation.situation)}${situation.situation_note?` · ${short(situation.situation_note,70)}`:""}`;add(reasons,"driver_situation",situationIcon(situation.situation),label,pts,{kind:"situation",label,actor:who,at:situation.situation_updated_at||situation.updated_at||mission.updated_at,persistent:situation.situation!=="Available",alert:situation.situation==="Traffic"||situation.situation==="Unavailable"});score+=pts;}
      const loc=Date.parse(situation.location_updated_at||"");
      if(Number.isFinite(loc)&&now-loc>60*60*1000&&["InTransit","PickedUp"].includes(mission.status)){
        const who=missionActor(session,mission);add(reasons,"stale_location","📍",`${who}'s location has not updated for more than 1 hour`,8,{kind:"location",label:`${who}'s location has not updated for more than 1 hour`,actor:who,at:situation.location_updated_at||mission.updated_at,persistent:true,alert:false});score+=8;
      }
    }

    const executorId=session.role==="executor"?Number(session.executorId):Number(mission.assigned_executor_id||0);
    const ep=executorId?executorSituationMap.get(executorId):null;
    if(ep&&ep.situation&&ep.situation!=="Available"){
      const pts=SITUATION_POINTS[ep.situation]||0,who=session.role==="executor"?(session.displayName||mission.executor_name||"Executor"):(mission.executor_name||"Executor");
      if(pts){const personal=session.role==="executor";const label=personal?`Your ${situationDisplay(ep.situation)} is on${ep.situation_note?` · ${short(ep.situation_note,70)}`:""}`:`${who} is ${situationPhrase(ep.situation)}${ep.situation_note?` · ${short(ep.situation_note,70)}`:""}`;add(reasons,"executor_situation",situationIcon(ep.situation),label,pts,{kind:"situation",label,actor:who,at:ep.situation_updated_at||ep.updated_at||mission.updated_at,persistent:true,alert:ep.situation==="Traffic"||ep.situation==="Unavailable"});score+=pts;}
    }

    score=Math.min(100,score);
    if(score<=0)continue;
    const level=attentionLevelFromScore(score);
    items.push({
      missionId:Number(mission.id),reference:mission.reference,status:mission.status,statusLabel:STATUS_LABELS[mission.status]||mission.status,
      score,level,reasons,events:reasons.filter(r=>r.event).map(r=>({...r.event,icon:r.icon,code:r.code,missionId:Number(mission.id),reference:mission.reference,stateToken:Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:mission.updated_at})),deadlineAtUtc:mission.deadline_at_utc||null,updatedAt:mission.updated_at,stateToken:Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:mission.updated_at,
      pickupCompany:mission.pickup_company,deliveryCompany:mission.delivery_company,
      ownerTenantId:Number(mission.company_id||0),ownerTenantName:mission.company_name||"Current tenant",
      executorName:mission.executor_name||mission.driver_name||mission.executing_tenant_driver_name||null,
      executorTenantId:Number(mission.executing_tenant_id||mission.company_id||0),executorTenantName:mission.executing_tenant_name||mission.company_name||"Current tenant",
      perspective:conditions.perspective,flow,health,
      link:operationalMissionHref(mission.id,{role:session.role,context:reasons.some(r=>r.code==="assignment_required")?"assignment":""})
    });
  }

  items.sort((a,b)=>b.score-a.score||Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));
  const limited=items.slice(0,Math.min(Math.max(Number(limit)||20,1),50));
  const summary=summarize(items);
  const focus=buildFocusRecommendation(items,{role:session.role});
  let awareness;try{awareness=await awarenessSummary(env,session);}catch(error){awareness={active:active.length,newCount:0,latest:null,degraded:true,degradedReason:String(error?.message||error).slice(0,240)};}
  const operationalEvents=await operationalEventsForSession(env,session,missions,24).catch(error=>{
    console.error("[Attention] operational event stream unavailable",{tenantId:Number(session?.tenantId||0),role:String(session?.role||"unknown"),error:String(error?.message||error).slice(0,180)});
    return [];
  });
  let intelligence;
  try{
    intelligence=coordinateMissionIntelligence({items,summary,focus,awareness,audience:session.role,operationalEvents});
  }catch(error){
    console.error("[Attention] intelligence coordination unavailable",{tenantId:Number(session?.tenantId||0),role:String(session?.role||"unknown"),error:String(error?.message||error).slice(0,180)});
    intelligence=coordinateMissionIntelligence({items:[],summary,focus:null,awareness,audience:session.role,operationalEvents:[]});
  }
  return {items:limited,summary,focus,intelligence};
}

function safeAttentionFallback(session,{limit=20,error=null}={}){
  const fallbackLimit=Math.min(Math.max(Number(limit)||20,1),50);
  const summary={critical:0,attention:0,watch:0,total:0};
  const awareness={active:0,newCount:0,latest:null};
  let intelligence={items:[],summary,focus:null,awareness,degraded:true};
  try {
    intelligence=coordinateMissionIntelligence({items:[],summary,focus:null,awareness,audience:session?.role||"unknown",operationalEvents:[]});
  } catch {}
  return {
    items:[],
    summary,
    focus:{available:false,title:"Attention temporarily unavailable",reason:"Operational attention could not be read safely. The current mission truth remains authoritative.",task:"",href:"",priority:"none",missionId:null,reference:""},
    intelligence,
    degraded:true,
    degradedReason:"attention_read_unavailable",
    limit:fallbackLimit
  };
}

export async function listMissionExceptions(env,session,missionId){
  const access=await resolveMissionAccess(env,session,missionId);
  if(!access)throw make("FORBIDDEN",403);
  return missionRepo.listExceptionsForMission(env,Number(access.tenantId),Number(missionId));
}

export async function createMissionException(env,session,missionId,data,mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  await requireWorkTrust(env,session);
  const access=await resolveMissionAccess(env,session,missionId);
  if(!access)throw make("FORBIDDEN",403);
  const kind=String(data.exceptionType||"").trim();
  if(!EXCEPTIONS[kind])throw make("INVALID_EXCEPTION",400);
  const note=clean(data.note,500);
  const severity=EXCEPTIONS[kind].severity;
  const id=await missionRepo.insertException(env,{
    tenantId:Number(access.tenantId),missionId:Number(missionId),
    driverId:session.role==="driver"?Number(session.driverId):null,
    executorId:session.role==="executor"?Number(session.executorId):null,
    exceptionType:kind,severity,note,createdByRole:session.role
  });
  await missionRepo.touchMission(env,Number(access.tenantId),Number(missionId),mutationFence?.lockToken);
  await audit(env,{session:{...session,tenantId:Number(access.tenantId)},action:"mission.exception.created",resourceType:"mission",resourceId:Number(missionId),metadata:{exceptionId:id,exceptionType:kind,severity}});
  if(session.role!=="admin")await notifyTenantException(env,{ownerCompanyId:Number(access.tenantId),missionId:Number(missionId),reference:access.mission?.reference,exceptionType:kind,severity});
  return {id,exceptionType:kind,severity,note};
}

export async function resolveMissionException(env,session,missionId,exceptionId,mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  await requireWorkTrust(env,session);
  const access=await resolveMissionAccess(env,session,missionId);
  if(!access)throw make("FORBIDDEN",403);
  const exception=await missionRepo.findOpenException(env,Number(access.tenantId),Number(missionId),Number(exceptionId));
  if(!exception)throw make("Exception not found or already resolved",404);
  if(!canResolveException(session,access,exception))throw make("You may report this exception, but you are not authorized to resolve it",403);
  const result=await missionRepo.resolveException(env,Number(access.tenantId),Number(missionId),Number(exceptionId),session.role,mutationFence?.lockToken);
  if(Number(result?.meta?.changes||0)!==1)throw make("Exception resolution did not commit",409);
  await missionRepo.touchMission(env,Number(access.tenantId),Number(missionId),mutationFence?.lockToken);
  await audit(env,{session:{...session,tenantId:Number(access.tenantId)},action:"mission.exception.resolved",resourceType:"mission",resourceId:Number(missionId),metadata:{exceptionId:Number(exceptionId),exceptionType:exception.exception_type,accessKind:access.accessKind}});
  return {exceptionId:Number(exceptionId),status:"resolved"};
}

function canResolveException(session,access,exception){
  // The owning tenant is the final mission-level resolver. Mission participation
  // alone never grants another tenant authority to close owner-domain exceptions.
  if(session.role==="admin")return access.accessKind==="owner";
  // Execution actors may close only their own non-critical operational report.
  // Critical exceptions remain owner-reviewed so evidence cannot be self-dismissed.
  if(String(exception.severity||"")==="critical")return false;
  if(session.role==="driver")return exception.created_by_role==="driver"&&Number(exception.driver_id||0)===Number(session.driverId||0);
  if(session.role==="executor")return exception.created_by_role==="executor"&&Number(exception.executor_id||0)===Number(session.executorId||0);
  return false;
}

function healthSignalMeta(code){
  if(code==="assignment_required"||code==="execution_partner_unassigned")return {icon:"🚚"};
  if(code==="overdue")return {icon:"⚠️"};
  if(String(code).startsWith("deadline_"))return {icon:"⏳"};
  if(code==="pickup_late")return {icon:"📦"};
  if(code==="pickup_waiting")return {icon:"⏱"};
  if(code==="completion_pending")return {icon:"🏁"};
  if(code==="stale_progress")return {icon:"🔄"};
  if(code==="marketplace_waiting")return {icon:"🌐"};
  return {icon:"•"};
}

function groupByMission(rows){
  const map=new Map();
  for(const row of rows){const id=Number(row.mission_id);if(!map.has(id))map.set(id,[]);map.get(id).push(row);}
  return map;
}
function add(reasons,code,icon,label,points,event=null){reasons.push({code,icon,label,points,event});}
function summarize(items){return {critical:items.filter(x=>x.level==="critical").length,attention:items.filter(x=>x.level==="attention").length,watch:items.filter(x=>x.level==="watch").length,total:items.length};}
function short(v,n){const s=String(v||"").trim();return s.length>n?s.slice(0,n-1)+"…":s;}
function clean(v,n){return String(v??"").trim().replace(/[\u0000-\u001f\u007f]/g,"").slice(0,n);}
function exceptionLabel(v){return EXCEPTIONS[v]?.label||v;}
function situationLabel(v){return ({Traffic:"In Traffic",Break:"On a Break",Unavailable:"Unavailable",Driving:"Driving"})[v]||v;}

function driverKeyFor(session,m){
  if(session.role==="driver")return `d:${Number(session.tenantId)}:${Number(session.driverId)}`;
  if(session.role==="admin"){
    if(Number(m.shared_access||0)===1&&m.shared_driver_id)return `d:${Number(session.tenantId)}:${Number(m.shared_driver_id)}`;
    if(m.owner_driver_id)return `d:${Number(m.company_id)}:${Number(m.owner_driver_id)}`;
  }
  return "";
}
function latestByDriver(session,missions){
  const map=new Map();
  for(const m of missions){
    const key=driverKeyFor(session,m);if(!key||map.has(key))continue;map.set(key,Number(m.id));
  }
  return map;
}
async function loadSituations(env,session,missions){
  const keys=[...new Set(missions.map(m=>driverKeyFor(session,m)).filter(Boolean))];
  if(!keys.length)return new Map();
  const groups=new Map();
  for(const key of keys){
    const [,company,driver]=key.split(":");const c=Number(company),d=Number(driver);
    if(!groups.has(c))groups.set(c,[]);groups.get(c).push(d);
  }
  const out=new Map();
  for(const [company,drivers] of groups){
    const unique=[...new Set(drivers)],q=unique.map(()=>"?").join(",");
    try{
      const r=await env.DB.prepare(`
        SELECT company_id,driver_id,situation,situation_note,location_updated_at,situation_updated_at,current_location
        FROM driver_operational_profiles WHERE company_id=? AND driver_id IN (${q})
      `).bind(company,...unique).all();
      for(const row of r.results||[])out.set(`d:${Number(row.company_id)}:${Number(row.driver_id)}`,row);
    }catch(error){
      console.error("[Attention] driver situation read unavailable",{company,driverCount:unique.length,error:String(error?.message||error).slice(0,180)});
    }
  }
  return out;
}
function missionActor(session,m){
  if(session.role==="driver")return session.displayName||session.driverName||m.shared_driver_name||m.driver_name||"Driver";
  if(session.role==="executor")return session.displayName||m.executor_name||"Executor";
  return m.shared_driver_name||m.driver_name||m.executor_name||"Executor";
}
function exceptionActor(ex,m,session){
  if(ex.created_by_role==="driver")return m.shared_driver_name||m.driver_name||session.driverName||"Driver";
  if(ex.created_by_role==="executor")return m.executor_name||session.displayName||"Executor";
  if(ex.created_by_role==="admin")return "Dispatcher";
  return "Participant";
}
function situationIcon(v){return ({Traffic:"🚦",Driving:"🚚",Break:"☕",Unavailable:"⛔",Available:"🟢"})[v]||"•";}
function situationPhrase(v){return ({Traffic:"in traffic",Driving:"driving",Break:"on a break",Unavailable:"unavailable",Available:"available"})[v]||String(v||"").toLowerCase();}
function situationDisplay(v){return ({Traffic:"traffic light",Driving:"driving status",Break:"break status",Unavailable:"unavailable status",Available:"available status"})[v]||"status";}
function healthEvent(signal,c,m,actor,now,session){
  const remaining=c.time.deadlineRemainingMs;
  const personal=session?.role==="driver"||session?.role==="executor";
  const base=operationalMissionHref(m.id,{role:session.role});
  if(String(signal.code).startsWith("deadline_")||signal.code==="overdue"){
    const mins=remaining===null?null:Math.max(0,Math.ceil(remaining/60000));
    const label=signal.code==="overdue"?`${personal?"Your m":"M"}ission ${m.reference||m.id} deadline has passed`:`${personal?"Your m":"M"}ission ${m.reference||m.id} deadline is in ${mins} minute${mins===1?"":"s"}`;
    return {kind:"deadline",label,actor:"Mission",at:now,deadlineAt:m.deadline_at_utc||m.deadline_at||null,remainingMinutes:mins,personal,persistent:true,alert:true,actions:personal?[{label:"REPORT",href:`${base}#attention`},{label:"IGNORE",dismiss:true}]:[{label:"CHECK",href:base}]};
  }
  if(signal.code==="execution_partner_unassigned"){
    const p=c.perspective||{},company=String(p.executionCompany||c.responsibility?.responsibilityCompanyName||"Execution partner");
    return {kind:"assignment",label:p.assignmentText||`${company} hasn't assigned a driver for Mission ${m.reference||m.id} yet`,detail:p.responsibilityText||"",actor:company,at:m.updated_at||m.created_at,persistent:true,alert:true,actions:[{label:"CHECK",href:base}],perspective:p.viewer||"owner"};
  }
  if(signal.code==="assignment_required"){
    const p=c.perspective||{},shared=Boolean(c.source?.shared);
    const label=p.assignmentText||(shared?`Mission ${m.reference||m.id} needs one of your drivers.`:`Mission ${m.reference||m.id} has no executor`);
    const actions=p.nextAction?.kind==="assign"?[{label:"ASSIGN DRIVER",href:`${base}#assignment`}]:[{label:"CHECK",href:base}];
    return {kind:"assignment",label,detail:p.responsibilityText||"",actor:p.isExecutingTenant?"You":"Mission",at:m.updated_at||m.created_at,persistent:true,alert:true,actions,perspective:p.viewer||"owner"};
  }
  if(signal.code==="required_data_missing")return {kind:"data",label:`Mission ${m.reference||m.id} is missing required mission data`,actor:"Mission",at:m.updated_at||m.created_at,persistent:true,alert:true,actions:session?.role==="admin"?[{label:"CHECK",href:base}]:[]};
  if(signal.code==="pickup_waiting")return {kind:"waiting",label:`${personal?"You have":actor+" has"} been waiting at pickup for ${c.time.statusAgeMinutes} minutes`,actor,at:m.status_changed_at||m.updated_at,persistent:true,alert:c.time.statusAgeMinutes>=30,actions:personal?[{label:"REPORT",href:`${base}#attention`},{label:"IGNORE",dismiss:true}]:[{label:"CHECK",href:base}]};
  if(signal.code==="pickup_late")return {kind:"timing",label:`Mission ${m.reference||m.id} pickup is late`,actor:"Mission",at:c.time.pickupAt||m.updated_at,persistent:true,alert:true,actions:personal?[{label:"REPORT",href:`${base}#attention`},{label:"IGNORE",dismiss:true}]:[{label:"CHECK",href:base}]};
  if(signal.code==="completion_pending")return {kind:"completion",label:`Mission ${m.reference||m.id} was delivered and still needs completion`,actor:"Mission",at:m.status_changed_at||m.updated_at,persistent:true,alert:false};
  if(signal.code==="stale_progress")return {kind:"progress",label:`Mission ${m.reference||m.id} has had no update for ${c.time.updateAgeMinutes} minutes`,actor:"Mission",at:m.updated_at,persistent:true,alert:false};
  if(signal.code==="marketplace_waiting")return {kind:"network",label:`Mission ${m.reference||m.id} is waiting for an executor`,actor:"Mission",at:m.updated_at||m.created_at,persistent:true,alert:false};
  return {kind:"status",label:signal.label,actor,at:m.updated_at||m.created_at,persistent:true,alert:false};
}
async function loadExecutorSituations(env,session,missions){
  const ids=session.role==="executor"?[Number(session.executorId)]:missions.map(m=>Number(m.assigned_executor_id||0)).filter(Boolean);
  const rows=await executorOperationalRepo.listProfiles(env,ids);
  return new Map(rows.map(r=>[Number(r.executor_id),r]));
}
function make(message,status){const e=new Error(message);e.status=status;return e;}
