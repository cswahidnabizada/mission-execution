import {RELEASE_VERSION} from "/assets/js/core/release.js";
/* ON Mission 10.18.2 — Adaptive Orchestration Decision Bridge.
 * Presentation/continuity bridge only. It converts a validated orchestration preview
 * into a handoff to an already-existing secured action workspace. It never executes,
 * authorizes, mutates, or creates a competing source of truth.
 */
export const ADAPTIVE_ORCHESTRATION_DECISION_BRIDGE_VERSION = RELEASE_VERSION;

const text = value => String(value ?? "").trim();

export function buildAdaptiveOrchestrationDecisionBridge(orchestration) {
  const invalid = !orchestration || orchestration.readOnly !== true || orchestration.authoritative !== false;
  if (invalid) return Object.freeze({ available: false, state: "REVIEW", handoff: null });

  const decision = orchestration.decision || {};
  const evidence = orchestration.evidence || {};
  const verification = orchestration.verification || {};
  const plan = orchestration.plan || {};
  const action = decision.action || null;
  const code = text(action?.code || plan?.steps?.[0]?.code || "");
  const eligible = decision.state === "EXECUTE"
    && Boolean(action && code)
    && action.enabled !== false
    && action.viewerCanExecute !== false
    && evidence.truthValid === true
    && evidence.sufficient !== false
    && verification.required === true
    && Boolean(text(verification.stateToken))
    && plan.previewOnly === true
    && Array.isArray(plan.steps)
    && plan.steps.length === 1
    && text(plan.steps[0]?.code) === code
    && plan.steps[0]?.requiresAuthorization === true;

  if (!eligible) {
    return Object.freeze({
      available: true,
      state: text(decision.state || "OBSERVE").toUpperCase(),
      handoff: null,
      reason: text(decision.reason || "The existing secured action is not currently eligible for handoff.")
    });
  }

  return Object.freeze({
    available: true,
    state: "EXECUTE",
    handoff: Object.freeze({
      code,
      label: text(action.label || plan.steps[0]?.label || code),
      mode: "EXISTING_SECURED_ACTION",
      stateToken: text(verification.stateToken),
      previewOnly: true
    }),
    reason: text(decision.reason || "A validated next action is available.")
  });
}
