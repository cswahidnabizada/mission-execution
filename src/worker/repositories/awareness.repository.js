export function recipientForSession(session){
  if(session.role==="admin")return {key:`admin:${Number(session.tenantId)}`,role:"admin",tenantId:Number(session.tenantId)};
  if(session.role==="driver")return {key:`driver:${Number(session.tenantId)}:${Number(session.driverId)}`,role:"driver",tenantId:Number(session.tenantId),driverId:Number(session.driverId)};
  if(session.role==="executor")return {key:`executor:${Number(session.executorId)}`,role:"executor",executorId:Number(session.executorId)};
  return null;
}
export function recipientForTarget(target){
  if(target.recipientRole==="admin")return {key:`admin:${Number(target.recipientTenantId)}`,role:"admin",tenantId:Number(target.recipientTenantId)};
  if(target.recipientRole==="driver")return {key:`driver:${Number(target.recipientTenantId)}:${Number(target.recipientDriverId)}`,role:"driver",tenantId:Number(target.recipientTenantId),driverId:Number(target.recipientDriverId)};
  if(target.recipientRole==="executor")return {key:`executor:${Number(target.recipientExecutorId)}`,role:"executor",executorId:Number(target.recipientExecutorId)};
  return null;
}
export async function markMissionNew(env,{missionId,ownerCompanyId,recipient}){
  if(!recipient?.key)return;
  return env.DB.prepare(`
    INSERT INTO mission_recipient_state(
      mission_id,mission_owner_company_id,recipient_key,recipient_role,
      recipient_tenant_id,recipient_driver_id,recipient_executor_id,first_seen_at,acknowledged_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP)
    ON CONFLICT(mission_id,recipient_key) DO UPDATE SET
      first_seen_at=CASE WHEN mission_recipient_state.acknowledged_at IS NOT NULL THEN CURRENT_TIMESTAMP ELSE mission_recipient_state.first_seen_at END,
      acknowledged_at=CASE WHEN mission_recipient_state.acknowledged_at IS NOT NULL THEN NULL ELSE mission_recipient_state.acknowledged_at END,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    Number(missionId),Number(ownerCompanyId),recipient.key,recipient.role,
    recipient.tenantId||null,recipient.driverId||null,recipient.executorId||null
  ).run();
}
export async function acknowledge(env,missionId,recipientKey){
  return env.DB.prepare(`
    UPDATE mission_recipient_state SET acknowledged_at=COALESCE(acknowledged_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
    WHERE mission_id=? AND recipient_key=?
  `).bind(Number(missionId),recipientKey).run();
}
export async function unseenForRecipient(env,recipientKey,limit=30){
  const r=await env.DB.prepare(`
    SELECT s.id,s.mission_id,s.mission_owner_company_id,s.first_seen_at,
      m.reference,m.status,m.pickup_company,m.delivery_company,m.mission_date,m.updated_at
    FROM mission_recipient_state s
    JOIN mission_canonical_projection m ON m.id=s.mission_id AND m.company_id=s.mission_owner_company_id
    WHERE s.recipient_key=? AND s.acknowledged_at IS NULL AND m.status NOT IN ('Completed','Cancelled','Canceled')
    ORDER BY datetime(s.first_seen_at) DESC,s.id DESC LIMIT ?
  `).bind(recipientKey,Math.min(Math.max(Number(limit)||30,1),50)).all();
  return r.results||[];
}
export async function activeCount(env,session){
  if(session.role==="admin"){
    const row=await env.DB.prepare(`
      SELECT COUNT(DISTINCT id) c FROM (
        SELECT m.id FROM mission_canonical_projection m WHERE m.company_id=? AND m.status NOT IN ('Completed','Cancelled','Canceled')
        UNION
        SELECT m.id FROM mission_tenant_access a JOIN mission_canonical_projection m ON m.id=a.mission_id AND m.company_id=a.owner_company_id
        WHERE a.access_company_id=? AND a.status='active' AND m.status NOT IN ('Completed','Cancelled','Canceled')
      )
    `).bind(Number(session.tenantId),Number(session.tenantId)).first();
    return Number(row?.c||0);
  }
  if(session.role==="driver"){
    const row=await env.DB.prepare(`
      SELECT COUNT(DISTINCT id) c FROM (
        SELECT m.id FROM mission_canonical_projection m JOIN mission_active_assignment_projection ca ON ca.mission_id=m.id AND ca.company_id=m.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.status='active' WHERE m.company_id=? AND ca.assignee_id=? AND m.status NOT IN ('Completed','Cancelled','Canceled')
        UNION
        SELECT m.id FROM mission_active_assignment_projection a JOIN mission_canonical_projection m ON m.id=a.mission_id AND m.company_id=a.company_id
        WHERE a.assignee_company_id=? AND a.assignee_id=? AND a.assignment_type='tenant_driver' AND a.assignee_type='driver' AND m.status NOT IN ('Completed','Cancelled','Canceled')
      )
    `).bind(Number(session.tenantId),Number(session.driverId),Number(session.tenantId),Number(session.driverId)).first();
    return Number(row?.c||0);
  }
  if(session.role==="executor"){
    const row=await env.DB.prepare(`
      SELECT COUNT(*) c FROM mission_active_assignment_projection a
      JOIN mission_canonical_projection m ON m.id=a.mission_id AND m.company_id=a.company_id
      WHERE a.assignee_id=? AND a.assignment_type='executor' AND a.assignee_type='executor' AND a.status='active' AND m.status NOT IN ('Completed','Cancelled','Canceled')
    `).bind(Number(session.executorId)).first();
    return Number(row?.c||0);
  }
  return 0;
}
