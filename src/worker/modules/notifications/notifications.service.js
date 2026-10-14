import * as notificationRepo from "../../repositories/notification.repository.js";
import {markTargetNew} from "../awareness/awareness.service.js";
import {operationalMissionHref} from "../intelligence/operational-mission-route.js";

const DUE_SOON_MS=30*60*1000;

export async function notificationLive(env,session,{after=0}={}){
  await generateDueSoon(env,session);
  const [notifications,unread]=await Promise.all([
    notificationRepo.listForSession(env,session,{after,limit:30}),
    notificationRepo.unreadCount(env,session)
  ]);
  return {notifications,unread,lastId:notifications.length?Number(notifications.at(-1).id):Number(after)||0,serverTime:new Date().toISOString()};
}

export async function recentNotifications(env,session){
  await generateDueSoon(env,session);
  const [notifications,unread]=await Promise.all([
    notificationRepo.listRecentForSession(env,session,{limit:30}),
    notificationRepo.unreadCount(env,session)
  ]);
  return {notifications,unread};
}

export async function markNotificationRead(env,session,id){return notificationRepo.markRead(env,session,id);}
export async function markAllNotificationsRead(env,session){return notificationRepo.markAllRead(env,session);}

async function notifyMissionAssignedUnsafe(env,mission){
  const targets=await notificationRepo.missionTargets(env,Number(mission.company_id),Number(mission.id));
  for(const target of targets){try{await markTargetNew(env,mission,target);}catch(error){console.error("MISSION_AWARENESS_EVENT",error);}}
}

async function notifyMissionUpdatedUnsafe(env,mission){ return null;
}

async function notifyTenantMessageUnsafe(env,{ownerCompanyId,missionId,messageId,reference}){ return null;
}

async function notifyDirectTenantMessageUnsafe(env,{tenantId,driverId,messageId}){ return null;
}

async function notifyTenantMissionStatusUnsafe(env,mission,status){ return null;
}




async function notifyTenantExceptionUnsafe(env,{ownerCompanyId,missionId,reference,exceptionType,severity}){
  const critical=severity==="critical"||["Damage","AddressProblem","ReceiverMissing"].includes(String(exceptionType||""));
  if(!critical)return null;
  await notificationRepo.insertNotification(env,{
    recipientRole:"admin",recipientTenantId:Number(ownerCompanyId),
    missionId:Number(missionId),missionOwnerCompanyId:Number(ownerCompanyId),
    type:"mission_exception",
    title:`Mission exception · ${reference||"Mission"}`,
    body:`${exceptionType}${severity==="critical"?" · Critical":severity==="high"?" · High priority":""}`,
    link:operationalMissionHref(missionId,{role:"admin"}),priority:severity==="critical"||severity==="high"?"high":"normal",
    dedupeKey:`mission-exception:${ownerCompanyId}:${missionId}:${exceptionType}:${Date.now()}`
  });
}

async function notifyTenantParticipantMessageUnsafe(env,{ownerCompanyId,missionId,messageId,reference,senderRole}){ return null;
}

export async function notifyMissionAssigned(env,mission){return safeEvent("mission_assigned",()=>notifyMissionAssignedUnsafe(env,mission));}
export async function notifyMissionUpdated(env,mission){return safeEvent("mission_updated",()=>notifyMissionUpdatedUnsafe(env,mission));}
export async function notifyTenantMessage(env,data){return safeEvent("tenant_message",()=>notifyTenantMessageUnsafe(env,data));}
export async function notifyDirectTenantMessage(env,data){return safeEvent("direct_tenant_message",()=>notifyDirectTenantMessageUnsafe(env,data));}
export async function notifyTenantMissionStatus(env,mission,status){return safeEvent("mission_status",()=>notifyTenantMissionStatusUnsafe(env,mission,status));}
export async function notifyTenantParticipantMessage(env,data){return safeEvent("participant_message",()=>notifyTenantParticipantMessageUnsafe(env,data));}
export async function notifyTenantException(env,data){return safeEvent("mission_exception",()=>notifyTenantExceptionUnsafe(env,data));}

async function safeEvent(name,fn){try{return await fn();}catch(error){console.error("NOTIFICATION_EVENT",name,error);return null;}}

async function generateDueSoon(env,session){
  const rows=await notificationRepo.dueSoonMissionsForSession(env,session);
  const now=Date.now();
  for(const m of rows){
    const due=Date.parse(m.deadline_at_utc||"");
    if(!Number.isFinite(due))continue;
    const remaining=due-now;
    if(remaining<=0||remaining>DUE_SOON_MS)continue;
    const recipient=recipientFromSession(session);
    if(!recipient)continue;
    const mins=Math.max(1,Math.ceil(remaining/60000));
    await notificationRepo.insertNotification(env,{
      ...recipient,missionId:Number(m.id),missionOwnerCompanyId:Number(m.company_id),
      type:"deadline_soon",title:`Deadline approaching · ${m.reference}`,body:`About ${mins} minutes remain until the mission deadline.`,
      link:operationalMissionHref(m.id,{role:session.role}),priority:"high",
      dedupeKey:`deadline-soon:${targetKey(recipient)}:${m.id}:${m.deadline_at_utc}`
    });
  }
}

function recipientFromSession(session){
  if(session.role==="admin")return {recipientRole:"admin",recipientTenantId:Number(session.tenantId)};
  if(session.role==="driver")return {recipientRole:"driver",recipientTenantId:Number(session.tenantId),recipientDriverId:Number(session.driverId)};
  if(session.role==="executor")return {recipientRole:"executor",recipientExecutorId:Number(session.executorId)};
  return null;
}
function targetKey(t){return t.recipientRole==="admin"?`admin:${t.recipientTenantId}`:t.recipientRole==="driver"?`driver:${t.recipientTenantId}:${t.recipientDriverId}`:`executor:${t.recipientExecutorId}`;}
