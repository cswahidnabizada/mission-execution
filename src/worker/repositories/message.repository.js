export async function listMessages(env, tenantId, missionId, filters = {}) {
  const result = await env.DB.prepare(`
    SELECT mm.id, mm.company_id, mm.mission_id, mm.sender_role, mm.driver_id,
      mm.message, mm.message_type, mm.file_id, mm.created_at,
      d.name AS driver_name, mf.original_name AS file_name,
      mf.mime_type AS file_mime_type, mf.file_size
    FROM mission_messages mm
    LEFT JOIN drivers d ON d.id=mm.driver_id AND d.company_id=mm.company_id
    LEFT JOIN mission_files mf ON mf.id=mm.file_id AND mf.company_id=mm.company_id AND mf.mission_id=mm.mission_id
    WHERE mm.company_id=? AND mm.mission_id=?
    ORDER BY mm.created_at ASC, mm.id ASC
    LIMIT ? OFFSET ?
  `).bind(tenantId, missionId, Math.min(Math.max(Number(filters.limit)||100,1),201), Math.min(Math.max(Number(filters.offset)||0,0),50000)).all();
  return result.results || [];
}

export async function insertMessage(env, data) {
  const result = await env.DB.prepare(`
    INSERT INTO mission_messages (
      company_id,mission_id,sender_role,driver_id,message,message_type,file_id,attention_required,created_at
    )
    VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(
    data.tenantId, data.missionId, data.senderRole, data.driverId || null,
    data.message || "", data.messageType || "text", data.fileId || null,
    data.attentionRequired ? 1 : 0
  ).run();
  return Number(result.meta.last_row_id);
}

export async function deleteMessagesForMission(env, tenantId, missionId) {
  await env.DB.prepare(`DELETE FROM mission_messages WHERE company_id=? AND mission_id=?`).bind(tenantId, missionId).run();
}


export async function resolveAttentionMessages(env,tenantId,missionId){
  await env.DB.prepare(`
    UPDATE mission_messages
    SET attention_resolved_at=COALESCE(attention_resolved_at,CURRENT_TIMESTAMP)
    WHERE company_id=? AND mission_id=? AND attention_required=1 AND attention_resolved_at IS NULL
  `).bind(Number(tenantId),Number(missionId)).run();
}
