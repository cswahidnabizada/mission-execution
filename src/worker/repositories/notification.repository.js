import { authorityUnavailable } from '../core/canonical-db.js';
import {resolveNotificationGovernance,minimizeNotificationText} from "../security/notification-governance.service.js";
import {audit} from "../security/audit.js";

export async function insertNotification(env,n){
  const controllerCompanyId=Number(n.controllerCompanyId||n.missionOwnerCompanyId||n.recipientTenantId||0)||null;
  const governance=await resolveNotificationGovernance(env,{type:n.type,controllerCompanyId,recipientRole:n.recipientRole});
  const title=minimizeNotificationText(n.title,governance.maxTitleLength);
  const body=minimizeNotificationText(n.body,governance.maxBodyLength);
  if(!title||!body)throw new Error("NOTIFICATION_CONTENT_EMPTY");
  const link=n.link==null?null:String(n.link).trim().slice(0,500);
  if(link&&(!link.startsWith('/')||link.startsWith('//')||/^[a-z][a-z0-9+.-]*:/i.test(link)))throw new Error("NOTIFICATION_LINK_INVALID");
  const r=await env.DB.prepare(`
    INSERT OR IGNORE INTO notifications(
      recipient_role,recipient_tenant_id,recipient_driver_id,recipient_executor_id,
      mission_id,mission_owner_company_id,type,title,body,link,priority,dedupe_key,
      controller_company_id,country_code,purpose_code,data_classification,retention_policy_code,
      provider_code,governance_policy_id,governance_version,governance_minimized,governance_audit_required
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    n.recipientRole,n.recipientTenantId||null,n.recipientDriverId||null,n.recipientExecutorId||null,
    n.missionId||null,n.missionOwnerCompanyId||null,n.type,title,body,link,
    n.priority||"normal",n.dedupeKey,controllerCompanyId,governance.countryCode,governance.purposeCode,
    governance.classification,governance.retentionPolicyCode,governance.providerCode,governance.policyId,
    governance.version,governance.minimize?1:0,governance.auditRequired===false?0:1
  ).run();
  const id=Number(r.meta?.last_row_id||0);
  if(id&&governance.auditRequired!==false){
    await audit(env,{session:{role:"system",tenantId:controllerCompanyId||0},action:"notification.created",resourceType:"notification",resourceId:id,metadata:{type:n.type,purpose:governance.purposeCode,classification:governance.classification,provider:governance.providerCode,companyId:controllerCompanyId}});
    await env.DB.prepare(`UPDATE notifications SET audited_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run().catch(error=>{console.warn('Optional notification audit timestamp unavailable:',error?.message||error);});
  }
  return id;
}

export async function listForSession(env,session,{after=0,limit=20}={}){
  const scope=recipientWhere(session);
  if(!scope)return [];
  const r=await env.DB.prepare(`
    SELECT id,mission_id,type,title,body,link,priority,read_at,created_at
    FROM notifications
    WHERE ${scope.sql} AND disposed_at IS NULL AND id>?
    ORDER BY id DESC LIMIT ?
  `).bind(...scope.binds,Number(after)||0,Math.min(Math.max(Number(limit)||20,1),50)).all();
  return (r.results||[]).reverse();
}

export async function listRecentForSession(env,session,{limit=30}={}){
  const scope=recipientWhere(session);
  if(!scope)return [];
  const r=await env.DB.prepare(`
    SELECT id,mission_id,type,title,body,link,priority,read_at,created_at
    FROM notifications
    WHERE ${scope.sql} AND disposed_at IS NULL
    ORDER BY id DESC LIMIT ?
  `).bind(...scope.binds,Math.min(Math.max(Number(limit)||30,1),50)).all();
  return r.results||[];
}

export async function unreadCount(env,session){
  const scope=recipientWhere(session);
  if(!scope)return 0;
  const row=await env.DB.prepare(`SELECT COUNT(*) AS c FROM notifications WHERE ${scope.sql} AND disposed_at IS NULL AND read_at IS NULL`)
    .bind(...scope.binds).first();
  return Number(row?.c||0);
}

export async function markRead(env,session,id){
  const scope=recipientWhere(session);
  if(!scope)return;
  await env.DB.prepare(`UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE ${scope.sql} AND disposed_at IS NULL AND id=?`)
    .bind(...scope.binds,Number(id)).run();
}

export async function markAllRead(env,session){
  const scope=recipientWhere(session);
  if(!scope)return;
  await env.DB.prepare(`UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE ${scope.sql} AND disposed_at IS NULL AND read_at IS NULL`)
    .bind(...scope.binds).run();
}

export async function missionTargets(env,ownerCompanyId,missionId){
  const mission=await env.DB.prepare(`SELECT assignee_id AS driver_id FROM mission_active_assignment_projection WHERE mission_id=? AND company_id=? AND assignment_type='owner_driver' AND assignee_type='driver' LIMIT 1`)
    .bind(Number(missionId),Number(ownerCompanyId)).first();
  if(!mission)return [];
  const out=[];
  const ownerDriver=await env.DB.prepare(`SELECT assignee_id AS driver_id FROM mission_active_assignment_projection WHERE mission_id=? AND company_id=? AND assignment_type='owner_driver' AND assignee_type='driver' AND status='active' LIMIT 1`).bind(Number(missionId),Number(ownerCompanyId)).first();
  if(ownerDriver?.driver_id)out.push({recipientRole:'driver',recipientTenantId:Number(ownerCompanyId),recipientDriverId:Number(ownerDriver.driver_id)});

  const shared=(await env.DB.prepare(`
    SELECT assignee_company_id AS access_company_id,assignee_id AS driver_id FROM mission_active_assignment_projection WHERE mission_id=? AND company_id=? AND assignment_type='tenant_driver' AND assignee_type='driver' AND status='active'
  `).bind(Number(missionId),Number(ownerCompanyId)).all()).results||[];
  for(const row of shared){
    if(row.driver_id)out.push({recipientRole:"driver",recipientTenantId:Number(row.access_company_id),recipientDriverId:Number(row.driver_id)});
  }

  const executors=(await env.DB.prepare(`
    SELECT assignee_id AS executor_id FROM mission_active_assignment_projection
    WHERE mission_id=? AND company_id=? AND assignment_type='executor' AND assignee_type='executor' AND status='active'
  `).bind(Number(missionId),Number(ownerCompanyId)).all()).results||[];
  for(const row of executors){
    if(row.executor_id)out.push({recipientRole:"executor",recipientExecutorId:Number(row.executor_id)});
  }
  return uniqueTargets(out);
}

function uniqueTargets(items){
  const seen=new Set();return items.filter(item=>{const key=item.recipientRole==="driver"?`d:${item.recipientTenantId}:${item.recipientDriverId}`:`e:${item.recipientExecutorId}`;if(seen.has(key))return false;seen.add(key);return true;});
}

export async function dueSoonMissionsForSession(env,session){
  if(session.role==="admin"){
    const r=await env.DB.prepare(`SELECT id,company_id,reference,deadline_at_utc FROM mission_canonical_projection WHERE company_id=? AND status NOT IN ('Completed','Cancelled','Canceled') AND deadline_at_utc IS NOT NULL ORDER BY deadline_at_utc ASC LIMIT 80`).bind(Number(session.tenantId)).all();
    return r.results||[];
  }
  if(session.role==="driver"){
    const r=await env.DB.prepare(`
      SELECT m.id,m.company_id,m.reference,m.deadline_at_utc
      FROM mission_canonical_projection m WHERE m.company_id=? AND EXISTS (SELECT 1 FROM mission_active_assignment_projection ca WHERE ca.mission_id=m.id AND ca.company_id=m.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.assignee_id=?) AND m.status NOT IN ('Completed','Cancelled','Canceled') AND m.deadline_at_utc IS NOT NULL
      UNION
      SELECT m.id,m.company_id,m.reference,m.deadline_at_utc
      FROM mission_active_assignment_projection sd
      JOIN mission_canonical_projection m ON m.id=sd.mission_id AND m.company_id=sd.company_id
      WHERE sd.assignee_company_id=? AND sd.assignee_id=? AND m.status NOT IN ('Completed','Cancelled','Canceled') AND m.deadline_at_utc IS NOT NULL
      ORDER BY deadline_at_utc ASC LIMIT 80
    `).bind(Number(session.tenantId),Number(session.driverId),Number(session.tenantId),Number(session.driverId)).all();
    return r.results||[];
  }
  if(session.role==="executor"){
    const r=await env.DB.prepare(`
      SELECT m.id,m.company_id,m.reference,m.deadline_at_utc
      FROM mission_active_assignment_projection mea JOIN mission_canonical_projection m ON m.id=mea.mission_id AND m.company_id=mea.company_id
      WHERE mea.assignee_id=? AND mea.assignment_type='executor' AND mea.assignee_type='executor' AND mea.status='active' AND m.status NOT IN ('Completed','Cancelled','Canceled') AND m.deadline_at_utc IS NOT NULL
      ORDER BY m.deadline_at_utc ASC LIMIT 80
    `).bind(Number(session.executorId)).all();
    return r.results||[];
  }
  return [];
}

function recipientWhere(session){
  if(session.role==="admin")return {sql:"recipient_role='admin' AND recipient_tenant_id=?",binds:[Number(session.tenantId)]};
  if(session.role==="driver")return {sql:"recipient_role='driver' AND recipient_tenant_id=? AND recipient_driver_id=?",binds:[Number(session.tenantId),Number(session.driverId)]};
  if(session.role==="executor")return {sql:"recipient_role='executor' AND recipient_executor_id=?",binds:[Number(session.executorId)]};
  return null;
}
