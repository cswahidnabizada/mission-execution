import {RELEASE_VERSION} from "/assets/js/core/release.js";
/* ON Mission 10.18.6 — Adaptive Overview Reconciliation
 * Presentation/continuity only. Keeps Overview synchronized with already-authoritative
 * operational changes. It never creates truth, priority, authorization, or mutation.
 */
export const ADAPTIVE_OVERVIEW_RECONCILIATION_VERSION = RELEASE_VERSION;

const text = v => String(v ?? "").trim();

export function buildAdaptiveOverviewReconciliation({
  reason = "",
  workspaceOpen = false,
  actionCompleted = false,
  actionFailed = false,
  health = "complete"
} = {}) {
  const event = text(reason).toLowerCase();
  const refreshReasons = new Set([
    "action-completed",
    "action-changed",
    "operational-state-changed",
    "live-notification",
    "workspace-reconciled",
    "manual-refresh"
  ]);
  const refresh = actionCompleted || refreshReasons.has(event) || (workspaceOpen && event === "action-failed");
  const mode = workspaceOpen ? "workspace" : actionFailed ? "attention" : health === "partial" ? "partial" : "overview";
  return Object.freeze({
    version: ADAPTIVE_OVERVIEW_RECONCILIATION_VERSION,
    readOnly: true,
    refresh,
    mode,
    reason: text(reason) || "overview-refresh",
    preservesCanonicalTruth: true,
    usesExistingActionServices: true,
    createsTruth: false,
    createsAuthorization: false,
    executesAction: false,
    changesResponsibility: false,
    changesCustody: false
  });
}
