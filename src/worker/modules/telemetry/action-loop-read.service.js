import { getForSession } from "../missions/missions.service.js";

export async function latestActionTelemetry(env, session, missionId) {
  const initialMission = await getForSession(env, session, missionId);
  if (!initialMission) return { mission: null, latest: null };
  try {
    const row = await env.DB.prepare(`
      SELECT action_code, phase, outcome, error_code, client_timestamp, created_at, trace_id, event_sequence
      FROM action_execution_telemetry
      WHERE company_id=? AND mission_id=?
      ORDER BY created_at DESC, id DESC LIMIT 1
    `).bind(Number(session?.tenantId || initialMission?.company_id || 0), Number(missionId)).first();
    // Re-read canonical mission truth after observing telemetry. This closes the
    // verification boundary without allowing telemetry to become authoritative.
    const mission = await getForSession(env, session, missionId);
    return { mission, latest: row || null, initialStateToken: initialMission?.state_version || null };
  } catch (error) {
    if (/no such table:\s*action_execution_telemetry/i.test(String(error?.message || ""))) {
      return { mission: initialMission, latest: null, telemetryUnavailable: true };
    }
    throw error;
  }
}
