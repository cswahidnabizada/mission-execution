export async function insertLifecycleEvent(env,d){
  const r=await env.DB.prepare(`
    INSERT INTO mission_lifecycle_events(
      company_id,mission_id,event_type,reason_code,note,actor_role,actor_identity_id,actor_name,
      previous_status,next_status
    ) VALUES(?,?,?,?,?,?,?,?,?,?)
  `).bind(
    Number(d.companyId),Number(d.missionId),String(d.eventType),
    d.reasonCode||null,d.note||null,String(d.actorRole),
    d.actorIdentityId?Number(d.actorIdentityId):null,d.actorName||null,
    String(d.previousStatus),String(d.nextStatus)
  ).run();
  return Number(r.meta.last_row_id);
}
