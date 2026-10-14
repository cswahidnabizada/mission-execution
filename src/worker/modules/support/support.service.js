import { createSupportRequest,createExecutorSupportRequest } from "../../repositories/support.repository.js";
import { audit } from "../../security/audit.js";

export async function submitSupport(env, session, data) {
  if(session.role==="executor"){return createExecutorSupportRequest(env,{executorId:Number(session.executorId),contactEmail:data.contactEmail,category:data.category,subject:data.subject,message:data.message,missionReference:data.missionReference});}
  const ticketId = await createSupportRequest(env, {
    companyId: Number(session.tenantId),
    identityId: session.identityId ? Number(session.identityId) : null,
    role: session.role,
    contactEmail: data.contactEmail,
    category: data.category,
    subject: data.subject,
    message: data.message,
    missionReference: data.missionReference
  });

  await audit(env, {
    session,
    action: "support.created",
    resourceType: "support_request",
    resourceId: ticketId,
    metadata: { category: data.category }
  });

  return ticketId;
}
