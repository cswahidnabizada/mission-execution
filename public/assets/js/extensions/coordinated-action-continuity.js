/* ON Mission 10.16 — Coordinated Action Continuity
 * Presentation/navigation bridge only. It routes a selected situation into an
 * existing action surface and signals a refresh after the user returns.
 * It never authorizes, mutates, assigns, transfers custody, or executes actions.
 */

const text = value => String(value ?? "").trim();
const num = value => Number(value || 0) || 0;

export function routeCoordinationAction(action = {}, dispatch = null) {
  const emit = typeof dispatch === "function" ? dispatch : event => window.dispatchEvent(event);
  const navigation = text(action.navigation).toLowerCase() || "operations";
  const missionId = num(action.missionId) || null;
  const requestId = num(action.requestId) || null;
  const id = text(action.id);
  if (!id) return Object.freeze({ routed: false, reason: "missing-action" });

  if (navigation === "marketplace") {
    emit(new CustomEvent("onmission:tenant-area", {
      detail: { name: "marketplace", source: "coordinated-action-continuity", actionId: id }
    }));
  } else if (missionId) {
    emit(new CustomEvent("onmission:operations-mission-select", {
      detail: { missionId, requestId, source: "coordinated-action-continuity", actionId: id }
    }));
  } else {
    emit(new CustomEvent("onmission:tenant-area", {
      detail: { name: navigation, source: "coordinated-action-continuity", actionId: id }
    }));
  }

  emit(new CustomEvent("onmission:coordination-action-routed", {
    detail: { actionId: id, missionId, requestId, navigation, source: "coordinated-action-continuity" }
  }));
  return Object.freeze({ routed: true, actionId: id, missionId, requestId, navigation });
}

export function requestCoordinationRefresh(dispatch = null) {
  const emit = typeof dispatch === "function" ? dispatch : event => window.dispatchEvent(event);
  emit(new CustomEvent("onmission:coordination-refresh-requested", {
    detail: { source: "coordinated-action-continuity" }
  }));
  return true;
}

export const COORDINATION_CONTINUITY_SAFETY = Object.freeze({
  readOnly: true,
  createsTruth: false,
  createsAuthorization: false,
  createsAction: false,
  executesAction: false,
  changesResponsibility: false,
  changesCustody: false
});
