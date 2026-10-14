import {coordinateMissionEngines} from "../engine-coordinator/engine-coordinator.service.js";
import {operationalMissionHref} from "../../modules/intelligence/operational-mission-route.js";

export async function missionTvCommandEvents(env,session,missions=[],limit=12){
  const rows=(missions||[])
    .filter(m=>!["Completed"].includes(String(m.status||"")))
    .sort((a,b)=>Date.parse(b.updated_at||b.created_at||0)-Date.parse(a.updated_at||a.created_at||0))
    .slice(0,Math.max(1,Math.min(Number(limit)||12,16)));

  const items=await mapLimit(rows,4,async mission=>{
    try{
      const coordination=(await coordinateMissionEngines(env,session,mission,{exceptions:[]})).coordination;
      const distribution=await distributionSnapshot(env,session,mission);
      return buildMissionControlEvent(session,mission,coordination,distribution);
    }catch(error){
      console.error("[MissionTV command]",{role:String(session?.role||"unknown"),missionId:Number(mission?.id||0),error:String(error?.message||error).slice(0,180)});
      return buildRecoveryVisibilityEvent(mission,session);
    }
  });
  return items.filter(Boolean);
}

export function buildMissionControlEvent(session,m,c,d){
  const ref=String(m.reference||m.id||"mission");
  const owner=Number(session?.tenantId||0)===Number(m.company_id||0)&&session.role==="admin";
  const status=String(m.status||"Pending");
  const execution=c.execution||{};
  const primary=c.unified?.primary||null;
  const actions=[];
  const managementActions=new Set((c.management?.actions||[]).map(a=>a.code));
  const canCancel=managementActions.has("cancel_mission");
  const canReclaim=Boolean(c.management?.permissions?.reclaimExecution);
  let label=`Mission ${ref}`;
  let detail="";
  let icon="●";

  if(["Cancelled","Canceled"].includes(status)){
    label=`Mission ${ref} is cancelled`;
    detail="The mission is outside active operations.";icon="✕";
    if(owner)actions.push(ui("reactivate_mission","REACTIVATE",m.id,{confirm:`Reactivate Mission ${ref}?`}));
    actions.push(open(m.id,session?.role));
    return event(m,session?.role,label,detail,icon,actions,"mission_control",true);
  }

  if(status==="Completed"){
    label=`Mission ${ref} was completed`;detail="Execution is closed.";icon="✓";actions.push(open(m.id,session?.role));
    return event(m,session?.role,label,detail,icon,actions,"mission_control",false);
  }

  if(c.liveness?.state==="BREACH"){
    label=`Mission ${ref} · Recovery required`;
    detail="The mission is active but no valid continuation path could be proven. Current mission truth has been preserved.";icon="⚠️";
    actions.push(open(m.id,session?.role));
    return event(m,session?.role,label,detail,icon,actions,"mission_liveness_breach",true);
  }

  if(c.liveness?.state==="ESCALATED"&&status!=="Delivered"){
    label=`Mission ${ref} · Recovery review required`;
    detail="Normal progression is blocked. Review the mission without bypassing secured services.";icon="⚠️";
    actions.push(open(m.id,session?.role));
    return event(m,session?.role,label,detail,icon,actions,"mission_recovery_escalated",true);
  }

  if(owner){
    // Delivered-but-blocked is a current mission-control state. Do not hide it behind
    // generic executor ownership or stale deadline narration. Only already-authorized
    // coordinated actions are surfaced here.
    if(status==="Delivered"&&c.management?.completion&&!c.management.completion.allowed){
      const blocker=c.management.completion.blockers?.[0]||null;
      label=`Mission ${ref} · Completion blocked`;
      detail=blocker?.message||"A completion requirement still needs attention.";icon="⚠️";
      if(primary)actions.push(actionFromUnified(primary,m.id));
      actions.push(open(m.id,session?.role));
      return event(m,session?.role,label,detail,icon,actions,"completion_blocked",true);
    }
    if(d.networkPending){
      label=`Mission ${ref} sent to ${d.networkPending.partnerName} and waiting for acceptance`;
      detail="Trusted-network invitation is pending.";icon="🤝";
      actions.push(command("withdraw_network","CANCEL SHARING",`/api/missions/${m.id}/distribution/withdraw-network`,"POST",{},`Withdraw the trusted-network invitation for Mission ${ref}?`));
      if(canCancel)actions.push(ui("cancel_mission","CANCEL MISSION",m.id));actions.push(open(m.id,session?.role));
      return event(m,session?.role,label,detail,icon,actions,"mission_control",true);
    }

    if(Number(m.public_enabled||0)===1&&d.approvedRequest==null){
      if(d.pendingRequest){
        label=`${d.pendingRequest.requesterName} requested Mission ${ref}`;
        detail="Choose whether this tenant or executor should execute the mission.";icon="🌐";
        actions.push(command("approve_foryou_request","APPROVE",`/api/public/requests/${d.pendingRequest.id}/approve`,"POST",{},`Approve ${d.pendingRequest.requesterName} for Mission ${ref}?`));
        actions.push(command("decline_foryou_request","DECLINE",`/api/public/requests/${d.pendingRequest.id}/decline`,"POST",{},`Decline this ForYou request?`));
      }else{
        label=`Mission ${ref} shared in ForYou`;detail="Waiting for a tenant or independent executor to request execution.";icon="🌐";
      }
      actions.push(command("withdraw_foryou","CANCEL FORYOU",`/api/missions/${m.id}/distribution/withdraw-foryou`,"POST",{},`Remove Mission ${ref} from ForYou? The mission will remain Pending and unassigned.`));
      if(canCancel)actions.push(ui("cancel_mission","CANCEL MISSION",m.id));actions.push(open(m.id,session?.role));
      return event(m,session?.role,label,detail,icon,actions,"mission_control",true);
    }

    if(execution.mode==="INDEPENDENT_EXECUTOR"||execution.mode==="SHARED_TENANT"||execution.mode==="SHARED_DRIVER"){
      const actor=executionActorLabel(execution,m,d);
      label=`${actor} will execute Mission ${ref}`;
      detail=execution.mode==="SHARED_TENANT"?"No driver assigned yet.":execution.mode==="SHARED_DRIVER"?`${execution.actor?.name||m.shared_driver_name||"Driver"} is assigned.`:"Independent execution is active.";
      icon=execution.mode==="INDEPENDENT_EXECUTOR"?"🧑‍💼":"🚚";
      if(canReclaim&&!execution.custody?.active){
        const confirm=status==="Delivered"
          ?`Take completion responsibility back for Mission ${ref}? Delivery truth will be preserved.`
          :`Take execution responsibility back for Mission ${ref}? It will become Pending and unassigned.`;
        actions.push(command("reclaim_execution","TAKE BACK",`/api/missions/${m.id}/execution/reclaim`,"POST",{reason:"mission_tv_take_back"},confirm));
      }
      if(canCancel)actions.push(ui("cancel_mission","CANCEL MISSION",m.id));actions.push(open(m.id,session?.role));
      return event(m,session?.role,label,detail,icon,actions,"mission_control",true);
    }

    if(execution.mode==="OWNER_DRIVER"){
      label=`${execution.actor?.name||m.driver_name||"Driver"} will execute Mission ${ref}`;
      detail=`Mission is ${humanStatus(status)}.`;icon="🚚";
      if(status==="Pending"||status==="Arrived")actions.push(ui("assign_driver","CHANGE DRIVER",m.id));
      if(canCancel)actions.push(ui("cancel_mission","CANCEL MISSION",m.id));actions.push(open(m.id,session?.role));
      return event(m,session?.role,label,detail,icon,actions,"mission_control",true);
    }

    label=`Mission ${ref} is not assigned to an executor`;
    detail="Choose one execution path. Assignment, ForYou and Trusted Network are mutually exclusive.";icon="○";
    actions.push(ui("assign_driver","ASSIGN DRIVER",m.id));
    actions.push(ui("share_foryou","SHARE TO FORYOU",m.id));
    actions.push(ui("share_network","SEND TO TRUSTED PARTNER",m.id));
    if(canCancel)actions.push(ui("cancel_mission","CANCEL MISSION",m.id));
    actions.push(open(m.id,session?.role));
    return event(m,session?.role,label,detail,icon,actions,"mission_control",true);
  }

  // Executing tenant / driver / independent executor: use the coordinated primary action inline.
  if(primary){
    label=`Mission ${ref} · ${String(primary.label||primary.code).toUpperCase()}`;
    detail=primary.reason||`Current execution state: ${execution.state||humanStatus(status)}.`;
    icon=primary.domain==="custody"?"📦":"▶";
    actions.push(actionFromUnified(primary,m.id));
  }else if(c.unified?.waiting){
    label=`Mission ${ref} is waiting for ${c.unified.waiting.waitingFor||"the responsible actor"}`;
    detail=c.unified.waiting.action?.label?`Next step: ${c.unified.waiting.action.label}.`:"No action is required from you now.";
    icon="⏳";
  }else{
    label=`Mission ${ref} · ${humanStatus(status)}`;detail="No action is required from you now.";icon="●";
  }
  actions.push(open(m.id,session?.role));
  return event(m,session?.role,label,detail,icon,actions,"mission_control",true);
}

async function distributionSnapshot(env,session,m){
  if(session.role!=="admin"||Number(session.tenantId)!==Number(m.company_id))return {};
  const [network,pending,approved]=await Promise.all([
    env.DB.prepare(`SELECT ni.id,ni.status,COALESCE(c.name,pei.display_name,'Trusted partner') partner_name FROM network_mission_invitations ni LEFT JOIN companies c ON c.id=ni.recipient_company_id LEFT JOIN public_executor_identities pei ON pei.id=ni.recipient_executor_id WHERE ni.owner_company_id=? AND ni.mission_id=? AND ni.status='Pending' ORDER BY ni.id DESC LIMIT 1`).bind(Number(session.tenantId),Number(m.id)).first(),
    env.DB.prepare(`SELECT r.id,r.requester_type,COALESCE(c.name,pei.display_name,r.requester_name,'Requester') requester_name FROM public_mission_requests r LEFT JOIN companies c ON c.id=r.requester_company_id LEFT JOIN public_executor_identities pei ON pei.id=r.executor_id WHERE r.company_id=? AND r.mission_id=? AND r.status='Pending' ORDER BY r.id ASC LIMIT 1`).bind(Number(session.tenantId),Number(m.id)).first(),
    env.DB.prepare(`SELECT r.id,r.requester_type,r.requester_company_id,r.executor_id,COALESCE(c.name,pei.display_name,r.requester_name,'Executor') requester_name FROM public_mission_requests r LEFT JOIN companies c ON c.id=r.requester_company_id LEFT JOIN public_executor_identities pei ON pei.id=r.executor_id WHERE r.company_id=? AND r.mission_id=? AND r.status='Approved' ORDER BY r.id DESC LIMIT 1`).bind(Number(session.tenantId),Number(m.id)).first()
  ]);
  return {
    networkPending:network?{id:Number(network.id),partnerName:String(network.partner_name||"Trusted partner")}:null,
    pendingRequest:pending?{id:Number(pending.id),type:pending.requester_type,requesterName:String(pending.requester_name||"Requester")}:null,
    approvedRequest:approved?{id:Number(approved.id),type:approved.requester_type,requesterName:String(approved.requester_name||"Executor")}:null
  };
}
function buildRecoveryVisibilityEvent(m,session){
  const ref=String(m?.reference||m?.id||"mission");
  const label=`Mission ${ref} · Recovery review required`;
  const detail="Mission intelligence could not build a normal action safely. The mission remains visible and its current truth is unchanged.";
  return event(m,session?.role,label,detail,"⚠️",[open(m.id,session?.role)],"mission_intelligence_recovery",true);
}
function executionActorLabel(execution,m,d){return execution.actor?.name||d.approvedRequest?.requesterName||m.executor_name||m.executing_company_name||"Execution partner";}
function event(m,role,label,detail,icon,actions,code,persistent){return {kind:"mission_control",code,label,detail,icon,missionId:Number(m.id),reference:String(m.reference||""),status:m.status,stateToken:Number(m.state_version||0)>0?`v:${Number(m.state_version)}`:null,at:m.updated_at||m.created_at,persistent,missionPriority:"high",href:operationalMissionHref(m.id,{role}),actions};}
function command(code,label,endpoint,method="POST",body={},confirm=null){return {code,label,kind:"command",endpoint,method,body,confirm};}
function ui(code,label,missionId,extra={}){return {code,label,kind:"ui",missionId:Number(missionId),...extra};}
function open(id,role="admin"){return {code:"open_mission",label:"OPEN",kind:"navigate",href:operationalMissionHref(id,{role})};}
function actionFromUnified(a,missionId){
  const code=String(a.code||""),target=a.target||null,label=String(a.label||code).toUpperCase();
  if(target?.kind==="mission_status")return command(code,label,target.endpoint||"/api/missions/status",target.method||"POST",{missionId:Number(missionId),status:target.body?.nextStatus||target.nextStatus},a.confirmation?`Continue with ${a.label}?`:null);
  if(target?.kind==="api")return command(code,label,target.endpoint,target.method||"POST",target.body||{},a.confirmation?`Continue with ${a.label}?`:null);
  if(target?.kind==="navigate")return {code,label,kind:"navigate",href:target.href};
  if(target?.kind==="ui")return ui(code,label,missionId,{requirementId:a.requirementId||null,confirm:a.confirmation?`Continue with ${a.label}?`:null});
  if(["assign_driver","change_driver","cancel_mission","start_custody_resolution","confirm_custody_release","accept_custody","review_completion_blocker","capture_delivery_proof","report_exception","message","navigate","start_navigation","share_current_location","resolve_traffic","resolve_waiting"].includes(code))return ui(code,label,missionId,{requirementId:a.requirementId||null,confirm:a.confirmation?`Continue with ${a.label}?`:null});
  if(code==="reclaim_execution")return command(code,"TAKE BACK",`/api/missions/${missionId}/execution/reclaim`,"POST",{reason:"mission_tv_take_back"},"Take execution responsibility back?");
  return ui(code,label,missionId,{requirementId:a.requirementId||null});
}
function humanStatus(s){return ({Pending:"pending",Arrived:"arrived at pickup",PickedUp:"picked up",InTransit:"in transit",Delivered:"delivered",Completed:"completed",Cancelled:"cancelled",Canceled:"cancelled"})[String(s||"")]||String(s||"").toLowerCase();}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let cursor=0;async function worker(){while(cursor<items.length){const i=cursor++;out[i]=await fn(items[i]);}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;}
