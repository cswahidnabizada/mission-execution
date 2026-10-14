/** ON Mission 10.35.5 — canonical file repository. */
export async function insertMissionFile(env,data) {
  const result = await env.DB.prepare(`
    INSERT INTO mission_files (
      company_id, mission_id, uploaded_by_role, driver_id, file_type, mime_type,
      original_name, r2_key, file_size, created_at, classification, purpose_code,
      evidence_type, controller_company_id, owner_type, owner_id, created_by_identity_type,
      created_by_identity_id, access_policy_code, retention_policy_code, retention_policy_version,
      retention_due_at, content_sha256, integrity_version
    ) VALUES (?,?,?,?, 'photo', ?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    data.tenantId, data.missionId, data.role, data.driverId || null,
    data.mimeType, data.originalName, data.r2Key, data.fileSize,
    data.classification, data.purposeCode, data.evidenceType, data.controllerCompanyId,
    data.ownerType, data.ownerId, data.createdByIdentityType, data.createdByIdentityId,
    data.accessPolicyCode, data.retentionPolicyCode, data.retentionPolicyVersion,
    data.retentionDueAt, data.contentSha256 || null, data.integrityVersion || '1'
  ).run();
  return Number(result.meta.last_row_id);
}

export async function findFile(env, tenantId, fileId) {
  return env.DB.prepare(`SELECT * FROM mission_files WHERE id=? AND company_id=? LIMIT 1`).bind(fileId, tenantId).first();
}

export async function listMissionFiles(env, tenantId, missionId, filters = {}) {
  const result = await env.DB.prepare(`
    SELECT mf.id,mf.company_id,mf.mission_id,mf.uploaded_by_role,mf.driver_id,mf.file_type,
      mf.mime_type,mf.original_name,mf.file_size,mf.created_at,mf.classification,mf.purpose_code,
      mf.evidence_type,mf.controller_company_id,mf.owner_type,mf.owner_id,mf.created_by_identity_type,
      mf.created_by_identity_id,mf.access_policy_code,mf.retention_policy_code,mf.retention_policy_version,
      mf.retention_due_at,mf.disposition_status,mf.disposition_reason,mf.disposed_at,mf.legal_hold_active,
      mf.integrity_version,d.name AS driver_name
    FROM mission_files mf
    LEFT JOIN drivers d ON d.id=mf.driver_id AND d.company_id=mf.company_id
    WHERE mf.company_id=? AND mf.mission_id=? ORDER BY mf.created_at ASC,mf.id ASC LIMIT ? OFFSET ?
  `).bind(tenantId, missionId, Math.min(Math.max(Number(filters.limit)||100,1),201), Math.min(Math.max(Number(filters.offset)||0,0),50000)).all();
  return result.results || [];
}

export async function listMissionFileKeys(env, tenantId, missionId) {
  const result = await env.DB.prepare(`SELECT id,r2_key,disposition_status FROM mission_files WHERE company_id=? AND mission_id=? AND disposition_status<>'disposed'`)
    .bind(tenantId, missionId).all();
  return result.results || [];
}

export async function markUploadFailed(env, tenantId, fileId, reason='upload_rollback') {
  await env.DB.prepare(`UPDATE mission_files SET disposition_status='disposed',disposition_reason=?,disposed_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=?`).bind(String(reason).slice(0,500),Number(tenantId),Number(fileId)).run();
}

export async function findFileAny(env,fileId){return env.DB.prepare(`SELECT * FROM mission_files WHERE id=? LIMIT 1`).bind(fileId).first();}

export async function insertDeliveryProof(env,{tenantId,missionId,fileId,role,driverId,executorId}){
  const r=await env.DB.prepare(`
    INSERT INTO mission_delivery_proofs(company_id,mission_id,file_id,submitted_by_role,driver_id,executor_id,created_at)
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id,mission_id) DO UPDATE SET
      file_id=excluded.file_id,submitted_by_role=excluded.submitted_by_role,driver_id=excluded.driver_id,executor_id=excluded.executor_id,created_at=CURRENT_TIMESTAMP
    RETURNING id
  `).bind(Number(tenantId),Number(missionId),Number(fileId),role,driverId||null,executorId||null).first();
  return Number(r?.id||0);
}

export async function findDeliveryProof(env,tenantId,missionId){
  return env.DB.prepare(`
    SELECT dp.id,dp.company_id,dp.mission_id,dp.file_id,dp.submitted_by_role,dp.driver_id,dp.executor_id,dp.created_at,
      mf.mime_type,mf.original_name,mf.file_size,mf.classification,mf.purpose_code,mf.evidence_type,
      mf.retention_policy_code,mf.retention_due_at,mf.disposition_status,mf.content_sha256
    FROM mission_delivery_proofs dp
    JOIN mission_files mf ON mf.id=dp.file_id AND mf.company_id=dp.company_id AND mf.mission_id=dp.mission_id
    WHERE dp.company_id=? AND dp.mission_id=? AND mf.disposition_status<>'disposed' LIMIT 1
  `).bind(Number(tenantId),Number(missionId)).first();
}

