/* ON Mission 10.35.5 — Canonical Workspace Action Model.
 * Presentation may choose which action to surface; the server registry remains
 * authoritative for whether an action can execute and what it changes.
 */
import {canonicalActionId} from "./action-registry.js";

const READ_ONLY=new Set(["open_mission","check_assignment","review_network","review_foryou","review_availability","navigate","message","review_completion_blocker"]);
const DIRECT_SAFE_MISSION=new Set(["confirm_arrival","confirm_pickup","start_transit","confirm_delivery","report_exception","resolve_exception","resolve_traffic","resolve_waiting","request_current_location","share_current_location"]);
const terminalStatus=s=>/completed|cancelled|canceled|closed|archived|terminated/i.test(String(s||""));
const statusOf=x=>String(x?.status||x?.state||x?.lifecycle||x?.missionStatus||x?.currentStatus||"").trim().toLowerCase();
const kindOf=x=>String(x?.kind||x?.type||"mission").trim().toLowerCase();

export function workspaceActions(x){
  const k=kindOf(x),s=statusOf(x),out=[];
  if(k==="driver"||k==="executor"){
    out.push({code:"toggle_driver_status",label:Number(x?.active)!==0?"DISABLE":"ENABLE",danger:Number(x?.active)!==0});
    out.push({code:"edit_driver",label:"EDIT PROFILE",requiresWorkspace:true});
    out.push({code:"remove_driver",label:"REMOVE EXECUTOR",danger:true,requiresWorkspace:true});
    out.push({code:"message_executor",label:"MESSAGE",requiresWorkspace:true});
  } else if(k==="customer"){
    out.push({code:"edit_customer",label:"EDIT CUSTOMER",requiresWorkspace:true});
    out.push({code:"add_customer_location",label:"ADD LOCATION",requiresWorkspace:true});
    out.push({code:"archive_customer",label:"ARCHIVE CUSTOMER",danger:true,requiresWorkspace:true});
    out.push({code:"delete_customer",label:"DELETE CUSTOMER",danger:true,requiresWorkspace:true});
  } else if(k==="partner"||k==="trust"){
    if(s==="pending"){
      out.push({code:"accept_trust",label:"ACCEPT TRUST"});
      out.push({code:"reject_trust",label:"DECLINE",danger:true});
    } else if(s==="trusted"||s==="active"||s==="connected"){
      out.push({code:"suspend_trust",label:"SUSPEND TRUST",danger:true});
    } else if(s==="suspended"||s==="rejected"){
      out.push({code:"request_trust",label:"REQUEST TRUST AGAIN"});
    } else {
      out.push({code:"request_trust",label:"REQUEST TRUST"});
    }
  } else if(k==="request"||k==="foryourequest"){
    const network=/network|trusted/i.test(String(x?.request_type||x?.kind||""));
    out.push(network?{code:"accept_network",label:"ACCEPT"}:{code:"approve_foryou_request",label:"APPROVE"});
    out.push(network?{code:"reject_network",label:"DECLINE",danger:true}:{code:"decline_foryou_request",label:"DECLINE",danger:true});
  } else if(k==="mission"&&!terminalStatus(s)){
    const code=canonicalActionId(x?.actionCode||x?.action_code||x?.primaryActionCode||x?.primary_action_code||x?.nextActionCode||x?.next_action_code||x?.action?.code||x?.nextAction?.code||"");
    if(code&&!READ_ONLY.has(code))out.push({code,label:String(x?.nextAction||x?.actionLabel||x?.expectedNext||code).toUpperCase(),requiresWorkspace:!DIRECT_SAFE_MISSION.has(code)});
  }
  return out.filter(a=>canonicalActionId(a.code));
}

export function firstExecutableWorkspaceAction(x){return workspaceActions(x).find(a=>!READ_ONLY.has(a.code))||null;}

export function workspaceActionContext(x,action={}){
  const k=kindOf(x),id=Number(x?.id||x?.driverId||x?.customerId||x?.partnerId||x?.missionId||0)||0;
  const ctx={payload:action?.input&&typeof action.input==="object"?action.input:{}};
  if(k==="driver"||k==="executor")ctx.personId=Number(x?.driverId||id),ctx.payload={active:Number(x?.active)===0,...ctx.payload};
  else if(k==="customer")ctx.customerId=Number(x?.customerId||id);
  else if(k==="partner"||k==="trust"){
    ctx.partnerId=Number(x?.partnerId||x?.partner_company_id||x?.recipientId||id);
    ctx.relationshipId=Number(x?.trustId||x?.relationshipId||x?.id||0)||undefined;
  } else if(k==="request"||k==="foryourequest"){
    if(/network|trusted/i.test(String(x?.request_type||x?.kind||"")))ctx.networkInvitationId=Number(x?.invitation_id||x?.networkInvitationId||x?.id||0);
    else ctx.forYouRequestId=Number(x?.requestId||x?.forYouRequestId||x?.id||0);
    if(x?.missionId||x?.mission_id)ctx.missionId=Number(x.missionId||x.mission_id);
  } else ctx.missionId=Number(x?.missionId||x?.mission_id||id);
  return ctx;
}
