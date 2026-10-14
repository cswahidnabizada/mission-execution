export function canViewMission(session, mission) {
  if (!session || !mission) return false;
  if (Number(session.tenantId) !== Number(mission.company_id)) return false;
  if (session.role === "admin") return true;
  if (session.role !== "driver") return false;
  if (Number(session.driverId) !== Number(mission.owner_driver_id)) return false;
  if (session.missionId && Number(session.missionId) !== Number(mission.id)) return false;
  return true;
}

export function canEditMission(session, mission) {
  return Boolean(
    session && mission &&
    session.role === "admin" &&
    Number(session.tenantId) === Number(mission.company_id) &&
    Number(mission.shared_access || 0) !== 1
  );
}

export function canManageDrivers(session) { return session?.role === "admin"; }
export function canManagePublicRequests(session) { return session?.role === "admin"; }
