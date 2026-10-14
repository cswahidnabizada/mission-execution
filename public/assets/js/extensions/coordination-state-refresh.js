/* ON Mission 10.16 — Coordination State Refresh & Return
 * Read-only freshness boundary for the presentation layer.
 * It compares the latest coordination situation with the situation that was
 * shown before entering an existing action surface. It never creates truth,
 * authorizes, mutates, or executes anything.
 */

const text = value => String(value ?? "").trim();
const num = value => Number(value || 0) || 0;

export function coordinationSituationKey(situation = null) {
  if (!situation?.available && !situation?.situation) return "none";
  const x = situation?.situation || situation;
  return [
    text(x.navigation).toLowerCase(),
    text(x.scope).toLowerCase(),
    text(x.object).toLowerCase(),
    text(x.action?.id).toLowerCase(),
    num(x.action?.missionId),
    num(x.action?.requestId),
    text(x.waitingOn).toLowerCase(),
    text(x.reason).toLowerCase()
  ].join("|");
}

export function beginCoordinationReturn(situation = null, now = Date.now()) {
  return Object.freeze({
    active: true,
    startedAt: Number(now) || Date.now(),
    beforeKey: coordinationSituationKey(situation)
  });
}

export function reconcileCoordinationReturn(pending = null, situation = null) {
  const currentKey = coordinationSituationKey(situation);
  if (!pending?.active) return Object.freeze({ state: "CURRENT", changed: false, currentKey });
  if (currentKey === "none") return Object.freeze({ state: "RESOLVED", changed: true, currentKey });
  if (currentKey !== pending.beforeKey) return Object.freeze({ state: "UPDATED", changed: true, currentKey });
  return Object.freeze({ state: "UNCHANGED", changed: false, currentKey });
}

export const COORDINATION_REFRESH_SAFETY = Object.freeze({
  readOnly: true,
  createsTruth: false,
  createsAuthorization: false,
  createsAction: false,
  executesAction: false,
  changesResponsibility: false,
  changesCustody: false
});
