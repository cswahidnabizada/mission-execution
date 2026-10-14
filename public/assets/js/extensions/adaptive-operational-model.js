import {RELEASE_VERSION} from "/assets/js/core/release.js";
import {isTerminalStatus,canonicalMissionStatus} from "../core/lifecycle-registry.js";
/* ON Mission 10.12.2 — Adaptive Operational Model
 * Pure read-only presentation model. It classifies one mission once, merges duplicate
 * queue signals, lists only useful contexts, and orders operator work. It never owns
 * truth, authorization, lifecycle, custody, or execution.
 */
export const ADAPTIVE_OPERATIONAL_MODEL_VERSION=RELEASE_VERSION;

const ACTIVE_CUSTODY=new Set(["pickedup","intransit"]);
const clean=v=>String(v??"").trim();
const lower=v=>clean(v).toLowerCase();
const num=v=>Number(v||0);
const listIf=(condition,value)=>condition?value:null;
const delistIf=(condition,value)=>condition?null:value;

export function missionOperationalModel(mission={}, {assignment=null,management=null,coordination=null,exceptions=[],currentTenantId=0,priority=null,operator=null}={}){
  const m=mission||{};
  const status=lower(m.status||m.missionStatus||"pending");
  const terminal=isTerminalStatus(canonicalMissionStatus(status));
  const physicalCustody=ACTIVE_CUSTODY.has(status);
  const publicMission=num(m.public_enabled||m.publicEnabled)===1;
  const shared= num(m.shared_access||m.sharedAccess)===1 || Boolean(m.network_mission_id||m.networkMissionId||m.shared_mission_id||m.sharedMissionId);
  const ownerTenantId=num(m.company_id||m.owner_company_id||m.ownerTenantId);
  const executionTenantId=num(m.executing_tenant_id||m.executingTenantId);
  const sameTenant=Boolean(currentTenantId && ownerTenantId && currentTenantId===ownerTenantId);
  const ownership=publicMission?"FORYOU":shared?(sameTenant||(!currentTenantId&&executionTenantId===ownerTenantId)?"SHARED OUTBOUND":"SHARED INBOUND"):"OWNED";
  const source=ownership==="FORYOU"?"FOR YOU":ownership.startsWith("SHARED")?"SHARED": "MY MISSION";
  const live=upper(coordination?.liveness?.state||coordination?.flow?.liveness?.state||operator?.workState||"");
  const liveness=["ACTIONABLE","WAITING","ESCALATED","BREACH","TERMINAL"].includes(live)?live:(terminal?"TERMINAL":"ACTIONABLE");
  const assigned=Boolean(assignment?.driverId||assignment?.executorId||assignment?.sharedTenantId||assignment?.assigned||m.owner_driver_id||m.shared_driver_id||m.assigned_executor_id||m.executor_name||m.driver_name);
  const openExceptions=(exceptions||[]).filter(x=>lower(x?.status||"open")==="open");
  const primary=coordination?.surface?.primary||coordination?.operatingSurface?.primary||coordination?.unified?.primary||coordination?.primaryAction||coordination?.finalOperationalProduct?.actionContract?.action||null;
  const readiness=coordination?.surface?.management||coordination?.management||{};
  const deadline=m.deadline_at_utc||m.deadlineAtUtc||m.deadline_at||m.deadlineAt||null;
  const deadlineMs=Date.parse(deadline||"");
  const overdue=Number.isFinite(deadlineMs)&&deadlineMs<Date.now()&&!terminal;
  const recoveryRequired=Boolean(coordination?.recovery?.required||coordination?.surface?.recovery?.required);
  const attention=recoveryRequired||openExceptions.length>0||liveness==="BREACH"||liveness==="ESCALATED"||overdue;
  const priorityScore=Number(priority?.score||operator?.score||m.priorityScore||m.priority||0);
  const urgency=terminal?0:recoveryRequired?95:liveness==="BREACH"?80:liveness==="ESCALATED"?70:overdue?60:liveness==="ACTIONABLE"?35:liveness==="WAITING"?10:0;
  const freshnessMs=Date.parse(m.updated_at||m.updatedAt||"");
  const freshness=Number.isFinite(freshnessMs)?Math.max(0,Math.min(30,Math.floor((Date.now()-freshnessMs)/3600000))):0;
  const hasPrimary=Boolean(primary?.code);
  const assignmentPressure=!terminal&&!assigned && (hasPrimary || readiness?.needsAssignment || assignment?.attentionRequired || assignment?.needsAssignment);
  const custodyPressure=!terminal && Boolean(management?.custody?.currentCase || management?.custody?.openCase);
  const requestPressure=!terminal && Boolean(mission.pending_request_id || mission.foryou_approved_request_id || mission.network_pending_invitation_id);
  const signalBoost=(hasPrimary?15:0)+(assignmentPressure?18:0)+(custodyPressure?22:0)+(requestPressure?16:0);
  const queueScore=priorityScore+urgency+(attention?20:0)+signalBoost-freshness;
  const lifecycle=phaseFor(status);
  const actionState=recoveryRequired?"RECOVERY":primary?.code?"ACTIONABLE":liveness==="WAITING"?"WAITING":attention?"ATTENTION":"WATCH";
  return Object.freeze({missionId:num(m.id),status,terminal,physicalCustody,publicMission,shared,ownership,source,ownerTenantId,executionTenantId,sameTenant,assigned,liveness,lifecycle,openExceptionCount:openExceptions.length,recoveryRequired,attention,overdue,deadline,primary,readiness,actionState,priorityScore,queueScore,freshness,assignmentPressure,custodyPressure,requestPressure,operatorBucket:queueBucket({terminal,liveness,attention,primary,overdue,recoveryRequired})});
}


const ACTION_LABELS=Object.freeze({
  assign_driver:"Assign driver", change_driver:"Change executor", reclaim_execution:"Take back execution",
  start_custody_resolution:"Resolve custody", start_custody_recovery:"Recover custody", confirm_custody_release:"Release custody",
  accept_custody:"Accept custody", reassign_custody_receiver:"Reassign custody", capture_delivery_proof:"Add delivery proof",
  confirm_arrival:"Confirm arrival", confirm_pickup:"Confirm pickup", start_transit:"Start transit", confirm_delivery:"Confirm delivery",
  complete_mission:"Complete mission", resolve_exception:"Resolve exception", resolve_traffic:"Resolve traffic", resolve_waiting:"Resolve waiting",
  open_exception:"Review attention", open_chat:"Open messages", review_completion_blocker:"Review blocker", review_foryou_request:"Review request",
  approve_foryou_request:"Approve request", decline_foryou_request:"Decline request", cancel_mission:"Cancel mission", reactivate_mission:"Reactivate mission",
  edit_mission:"Edit mission", delete_mission:"Delete mission", share_mission:"Choose execution channel"
});

export function deriveOperationalFocus(mission={}, {model=null,coordination=null,operator=null}={}){
  const m=model||missionOperationalModel(mission,{coordination,operator});
  const action=coordination?.surface?.primary||coordination?.operatingSurface?.primary||coordination?.unified?.primary||coordination?.primaryAction||coordination?.finalOperationalProduct?.actionContract?.action||null;
  const code=clean(action?.code||m.primary?.code);
  const title=ACTION_LABELS[code]||clean(action?.label||action?.title)||(m.attention?"Review attention":m.liveness==="WAITING"?"Waiting for next condition":m.terminal?"Review completed mission":"Review mission");
  const actionable=Boolean(code)&&action?.enabled!==false&&action?.viewerCanExecute!==false&&!m.terminal;
  const state=m.liveness;
  const pressure=m.queueScore;
  const reason=m.attention?m.recoveryRequired?"A previous mission action needs canonical recovery before new work can continue.":m.overdue?"Deadline passed":m.liveness==="BREACH"?"Operational deadline breached":m.liveness==="ESCALATED"?"Escalated operational condition":m.openExceptionCount>0?`${m.openExceptionCount} open attention${m.openExceptionCount===1?"":"s"}`:"Attention required":m.assignmentPressure?"Execution responsibility is not confirmed":m.custodyPressure?"Custody requires an explicit next step":m.requestPressure?"A request is waiting for a decision":m.liveness==="WAITING"?"Waiting for the next valid condition":"No blocking condition established";
  return Object.freeze({code:code||null,label:title,reason,actionable,queueScore:pressure,liveness:state,attention:Boolean(m.attention),overdue:Boolean(m.overdue),bucket:m.operatorBucket,missionId:m.missionId});
}

function upper(v){return clean(v).toUpperCase();}
function phaseFor(status){
  if(status==="drafted")return "DRAFT";
  if(["pending"].includes(status))return "READY";
  if(status==="arrived")return "PICKUP";
  if(status==="pickedup")return "PICKED UP";
  if(status==="intransit")return "IN TRANSIT";
  if(status==="delivered")return "DELIVERY";
  if(status==="completed")return "COMPLETED";
  if(status==="cancelled"||status==="canceled")return "CANCELLED";
  return upper(status)||"READY";
}
function queueBucket({terminal,liveness,attention,primary,overdue,recoveryRequired=false}){
  if(terminal)return "WATCH";
  if(recoveryRequired)return "AT RISK";
  if(primary?.code && primary?.viewerCanExecute!==false)return "NOW";
  if(liveness==="BREACH"||liveness==="ESCALATED"||overdue)return "AT RISK";
  if(liveness==="WAITING")return "WAITING";
  if(attention)return "AT RISK";
  return "WATCH";
}

export function mergeMissionQueueRows(rows=[], {catalogById=new Map(),priorityIndex=new Map(),operatorIndex=new Map(),currentTenantId=0}={}){
  const byId=new Map();
  for(const raw of rows||[]){
    if(!raw)continue;
    const id=num(raw.missionId||raw.id||raw.mission?.id);
    if(!id)continue;
    const catalog=catalogById.get(id)||{};
    const p=priorityIndex.get(id)||{};
    const op=operatorIndex.get(id)||{};
    const merged={...catalog,...raw,missionId:id,id,
      title:raw.title||catalog.title||catalog.reference||`Mission ${id}`,
      reference:raw.reference||catalog.reference||`Mission ${id}`,
      status:raw.status||catalog.status||raw.missionStatus||"Pending",
      updated_at:raw.updated_at||catalog.updated_at||catalog.updatedAt,
      created_at:raw.created_at||catalog.created_at||catalog.createdAt,
      public_enabled:raw.public_enabled??catalog.public_enabled,
      shared_access:raw.shared_access??catalog.shared_access,
      network_mission_id:raw.network_mission_id||catalog.network_mission_id,
      shared_mission_id:raw.shared_mission_id||catalog.shared_mission_id,
      company_id:raw.company_id||catalog.company_id,
      owner_company_id:raw.owner_company_id||catalog.owner_company_id,
      executing_tenant_id:raw.executing_tenant_id||catalog.executing_tenant_id,
      deadline_at_utc:raw.deadline_at_utc||catalog.deadline_at_utc,
      priorityScore:Number(raw.priorityScore??p.score??raw.score??0),
      priorityLevel:String(raw.priorityLevel||p.level||raw.level||"low"),
      operator:op
    };
    const model=missionOperationalModel(merged,{currentTenantId,priority:p,operator:op});
    const candidate={...merged,...model,queuePriority:model.queueScore};
    const previous=byId.get(id);
    if(!previous){byId.set(id,candidate);continue;}
    // One mission remains one queue item. Enrichment merges into the canonical item;
    // operational signals outrank generic catalog text.
    const chosen={...previous,...candidate};
    if(Number(previous.queuePriority||0)>Number(candidate.queuePriority||0)) chosen.queuePriority=previous.queuePriority;
    if(previous.primary?.code && !candidate.primary?.code) chosen.primary=previous.primary;
    byId.set(id,chosen);
  }
  return [...byId.values()];
}

export function sortAdaptiveMissionQueue(rows=[]){
  return [...rows].sort((a,b)=>Number(b.queuePriority||b.queueScore||0)-Number(a.queuePriority||a.queueScore||0)
    ||bucketRank(a.operatorBucket)-bucketRank(b.operatorBucket)
    ||Number(b.priorityScore||0)-Number(a.priorityScore||0)
    ||dateValue(b.updated_at||b.updatedAt)-dateValue(a.updated_at||a.updatedAt)
    ||num(b.missionId)-num(a.missionId));
}
function bucketRank(v){return ({NOW:0,"AT RISK":1,WAITING:2,WATCH:3}[v]??9);}
function dateValue(v){const t=Date.parse(v||"");return Number.isFinite(t)?t:0;}

export function listAdaptiveMissionContexts({base=[],mission={},assignment=null,management=null,coordination=null,exceptions=[],currentTenantId=0}={}){
  const model=missionOperationalModel(mission,{assignment,management,coordination,exceptions,currentTenantId});
  const managementActions=Array.isArray(management?.actions)?management.actions:[];
  const actionCodes=new Set(managementActions.map(x=>clean(x?.code)));
  const records=base.filter(Boolean);
  const byKind=new Map(records.map(x=>[String(x.kind||""),x]));
  const take=(kind,fallback=null)=>byKind.get(kind)||fallback;
  const contexts=[];
  const add=(condition,item)=>{if(condition&&item)contexts.push(item);};
  const baseMission=take("workbench",take("missionWorkspace",take("mission",null)));
  add(true,baseMission?{...baseMission,kind:"workbench",kindLabel:"WORKBENCH",title:baseMission.title||mission.reference||`Mission ${num(mission.id)}`,intelligenceRecommended:false}:null);
  const assignmentRelevant=!model.terminal && (!model.assigned || ["assign_driver","change_driver","check_assignment"].includes(clean(model.primary?.code)) || Boolean(assignment?.attentionRequired||assignment?.needsAssignment));
  add(assignmentRelevant,take("assignment",null));
  const custodyRelevant=!model.terminal && (model.physicalCustody||Boolean(management?.custody?.currentCase||management?.custody?.openCase)||["start_custody_resolution","start_custody_recovery","confirm_custody_release","finalize_custody_transfer","accept_custody","reassign_custody_receiver","abort_custody_transfer"].includes(clean(model.primary?.code)));
  add(custodyRelevant,take("custody",null));
  add(model.attention,take("exception",null));
  add(!model.terminal && (model.shared||model.publicMission||Boolean(mission.message_count||mission.messageCount)||clean(model.primary?.code)==="message"),take("collaboration",null));
  add(model.terminal || model.lifecycle==="DELIVERY" || Number(mission.file_count||mission.fileCount||0)>0 || clean(model.primary?.code)==="capture_delivery_proof",take("evidence",null));
  add(model.terminal,take("history",null));
  const requested=Boolean(mission.foryou_approved_request_id||mission.foryou_approved_requester_company_id||mission.network_pending_invitation_id||mission.pending_request_id);
  const inbound=Boolean(model.shared && model.executionTenantId && currentTenantId && model.executionTenantId===currentTenantId);
  add(model.shared,take("sharedMission",null));
  add(inbound,take("inboundMission",null));
  add(requested,take("requestedMission",null));
  add(model.publicMission,take("foryouMission",null));
  add(requested,take("requestReview",null));

  const owner=model.sameTenant || (!currentTenantId && Boolean(management?.permissions?.canEdit||management?.permissions?.canDelete||management?.flow?.viewer?.isOwner));
  const physical=model.physicalCustody;
  const synth=(kind,key,title,subtitle,reason,priority,extra={})=>take(kind,{key,kind,kindLabel:title.toUpperCase(),contextCategory:"OPTIONS",title,subtitle,reason,priority,...extra});
  add(owner&&!model.terminal&&!physical&&actionCodes.has("share_mission")&&!model.shared&&!model.publicMission,synth("missionShare","context:management:share","Share","Choose a valid execution channel","Owner can choose an available execution channel",145,{ownerOnly:true}));
  add(owner&&!model.terminal&&model.assigned&&actionCodes.has("reclaim_execution")&&!physical,synth("takebackExecution","context:management:takeback","Take Back","Return execution responsibility to the owner","Authorized owner recovery",137,{ownerOnly:true,contextCategory:"EXECUTION"}));
  add(owner&&!model.terminal&&actionCodes.has("start_custody_resolution")&&(model.physicalCustody||Boolean(management?.custody?.currentCase)),synth("missionTransfer","context:management:transfer","Transfer","Continue the valid custody path","Authorized responsibility transfer",140,{ownerOnly:true,contextCategory:"EXECUTION"}));
  add(owner&&!model.terminal&&!physical&&actionCodes.has("edit_mission"),synth("missionEdit","context:management:edit","Edit","Update mission details","Authorized mission update",120,{ownerOnly:true}));
  add(owner&&!model.terminal&&!physical&&actionCodes.has("cancel_mission"),synth("missionCancel","context:management:cancel","Cancel","Close this mission safely","Authorized lifecycle action",115,{ownerOnly:true}));
  add(owner&&model.terminal&&actionCodes.has("reactivate_mission"),synth("missionReactivate","context:management:reactivate","Reactivate","Return the mission to active work","Authorized lifecycle recovery",112,{ownerOnly:true}));
  add(owner&&actionCodes.has("delete_mission")&&(model.status==="drafted"||model.terminal),synth("missionDelete","context:management:delete","Delete","Remove this mission","Authorized owner action",105,{ownerOnly:true}));

  return contexts.filter(Boolean).filter((x,i,a)=>a.findIndex(y=>y.key===x.key)===i)
    .map(x=>({...x,intelligenceRecommended:Boolean(x.intelligenceRecommended)||(["assignment","takebackExecution","missionTransfer","missionShare","missionEdit","missionCancel","missionReactivate","missionDelete","custody","exception","collaboration","evidence"].includes(String(x.kind||""))&&clean(model.primary?.code)===clean(x.actionCode||""))}))
    .sort((a,b)=>Number(Boolean(b.intelligenceRecommended))-Number(Boolean(a.intelligenceRecommended))||Number(b.priority||0)-Number(a.priority||0)||String(a.title||"").localeCompare(String(b.title||"")));
}

export function listIfRelevant(condition,value){return listIf(condition,value);}
export function delistIfIrrelevant(condition,value){return delistIf(condition,value);}
