export async function createSupportRequest(env, data) {
  const result = await env.DB.prepare(`
    INSERT INTO support_requests (
      company_id, identity_id, role, contact_email, category,
      subject, message, mission_reference, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    data.companyId,
    data.identityId || null,
    data.role,
    data.contactEmail || null,
    data.category,
    data.subject,
    data.message,
    data.missionReference || null
  ).run();
  return Number(result.meta.last_row_id);
}

export async function createExecutorSupportRequest(env,data){const r=await env.DB.prepare(`INSERT INTO public_executor_support_requests (executor_id,contact_email,category,subject,message,mission_reference,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'open',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(data.executorId,data.contactEmail||null,data.category,data.subject,data.message,data.missionReference||null).run();return Number(r.meta.last_row_id);}
