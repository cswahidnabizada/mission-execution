import { requireSession } from "../core/auth-session.js";

export async function privateContext(request, env) {
  const session = await requireSession(request, env);
  return {
    session,
    tenantId: Number(session.tenantId),
    role: session.role,
    driverId: session.driverId ? Number(session.driverId) : null
  };
}
