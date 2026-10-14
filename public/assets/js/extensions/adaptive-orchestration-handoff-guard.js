import {RELEASE_VERSION} from "/assets/js/core/release.js";
/* ON Mission 10.18.3 — Adaptive Orchestration Handoff Guard.
 * Presentation/continuity guard only. It revalidates the latest read-only orchestration
 * preview immediately before opening the existing secured action workspace. It never
 * authorizes, executes, mutates, or becomes a source of truth.
 */
export const ADAPTIVE_ORCHESTRATION_HANDOFF_GUARD_VERSION = RELEASE_VERSION;

const text = value => String(value ?? "").trim();

export function validateAdaptiveOrchestrationHandoff(orchestration, expectedCode, expectedStateToken) {
  if (!orchestration || orchestration.readOnly !== true || orchestration.authoritative !== false) {
    return Object.freeze({ valid: false, reason: "The orchestration preview is not valid for handoff." });
  }

  const decision = orchestration.decision || {};
  const verification = orchestration.verification || {};
  const code = text(decision.action?.code || orchestration.plan?.steps?.[0]?.code);
  const token = text(verification.stateToken);
  const expected = text(expectedCode);
  const expectedToken = text(expectedStateToken);

  if (decision.state !== "EXECUTE") return Object.freeze({ valid: false, reason: "The current mission no longer has an executable next step." });
  if (!expected || code !== expected) return Object.freeze({ valid: false, reason: "The recommended action changed. Review the current mission state." });
  if (!expectedToken || !token || token !== expectedToken) return Object.freeze({ valid: false, reason: "The mission changed before the action was opened. Review the current mission state." });
  if (verification.required !== true) return Object.freeze({ valid: false, reason: "The current action requires a fresh secured validation." });
  if (orchestration.plan?.previewOnly !== true || orchestration.plan?.steps?.length !== 1) return Object.freeze({ valid: false, reason: "The orchestration preview is no longer a single valid next step." });
  if (orchestration.plan?.steps?.[0]?.requiresAuthorization !== true) return Object.freeze({ valid: false, reason: "The existing secured action must remain the authorization path." });

  return Object.freeze({ valid: true, code, stateToken: token });
}
