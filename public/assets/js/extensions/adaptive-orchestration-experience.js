import {RELEASE_VERSION} from "/assets/js/core/release.js";
/* ON Mission 10.18.1 — Visible Adaptive Orchestration Experience.
 * Presentation only. Consumes the 10.18.0 read-only orchestration contract.
 * It never authorizes, mutates, selects a new source of truth, or executes an action.
 */

export const ADAPTIVE_ORCHESTRATION_EXPERIENCE_VERSION = RELEASE_VERSION;

const text = value => String(value ?? "").trim();
const label = value => text(value).replaceAll("_", " ");

export function buildAdaptiveOrchestrationExperience(orchestration) {
  if (!orchestration || orchestration.readOnly !== true || orchestration.authoritative !== false) {
    return Object.freeze({ available: false, state: "REVIEW", headline: "Orchestration preview unavailable", detail: "The current operational preview could not be validated." });
  }

  const state = text(orchestration.decision?.state || orchestration.plan?.state || "OBSERVE").toUpperCase();
  const action = orchestration.decision?.action || null;
  const waitingFor = text(orchestration.decision?.waitingFor || "");
  const reason = text(orchestration.decision?.reason || orchestration.situation?.reason || "");
  const step = orchestration.plan?.steps?.[0] || null;
  const actionLabel = text(action?.label || step?.label || "");
  const evidence = orchestration.evidence || {};

  const stateCopy = {
    EXECUTE: { headline: actionLabel || "A valid next action is available", detail: "The existing secured action below remains the only execution path." },
    WAIT: { headline: waitingFor ? `Waiting on ${label(waitingFor)}` : "Waiting on the current dependency", detail: reason || "No action should be taken until the waiting condition changes." },
    BLOCKED: { headline: "Action is blocked", detail: reason || "The current conditions do not permit the next step." },
    REVIEW: { headline: "Review the current situation", detail: reason || "The operational picture needs review before proceeding." },
    OBSERVE: { headline: "No action is currently available", detail: reason || "Continue observing the current mission situation." }
  }[state] || { headline: "Current operational preview", detail: reason || "No additional action is currently exposed." };

  return Object.freeze({
    available: true,
    state,
    headline: stateCopy.headline,
    detail: stateCopy.detail,
    action: actionLabel,
    waitingOn: waitingFor,
    situation: text(orchestration.situation?.state || "UNKNOWN"),
    truthValid: evidence.truthValid === true,
    liveness: text(evidence.liveness || "UNKNOWN"),
    readiness: text(evidence.readiness || "UNKNOWN"),
    evidenceSufficient: evidence.sufficient !== false,
    step: step ? Object.freeze({ kind: text(step.kind || ""), label: text(step.label || actionLabel), requiresAuthorization: step.requiresAuthorization === true }) : null,
    verification: Object.freeze({ required: orchestration.verification?.required === true, stateToken: text(orchestration.verification?.stateToken || "") })
  });
}
