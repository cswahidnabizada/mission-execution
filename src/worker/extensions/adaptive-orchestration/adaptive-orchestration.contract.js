import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.18.0 — Adaptive Operational Orchestration Foundation.
 * Read-only orchestration contract. It observes existing authoritative projections,
 * proposes one guarded next step, and never authorizes or mutates anything.
 */
export const ADAPTIVE_ORCHESTRATION_VERSION=RELEASE_VERSION;

export function buildAdaptiveOrchestrationContract({
  mission,
  coordination,
  finalOperationalProduct = null,
  session = {}
} = {}) {
  const truth = coordination?.truth || null;
  const flow = coordination?.flow || null;
  const unified = coordination?.unified || null;
  const liveness = coordination?.liveness || null;
  const primary = unified?.primary || finalOperationalProduct?.action || null;
  const waiting = unified?.waiting || null;
  const status = String(mission?.status || coordination?.status || "Pending");
  const stateToken = Number(mission?.state_version || 0) > 0
    ? `v:${Number(mission.state_version)}`
    : String(mission?.updated_at || "");

  const blockers = collectBlockers(coordination);
  const evidence = buildEvidence({ truth, flow, liveness, coordination, blockers });
  const decision = buildDecision({ primary, waiting, blockers, liveness, truth, session });
  const plan = buildPlan({ decision, primary, waiting });

  return Object.freeze({
    version: ADAPTIVE_ORCHESTRATION_VERSION,
    readOnly: true,
    authoritative: false,
    missionId: Number(mission?.id || coordination?.missionId || 0) || null,
    status,
    stateToken,
    situation: Object.freeze({
      state: String(liveness?.state || "UNKNOWN"),
      reason: String(liveness?.reason || finalOperationalProduct?.experience?.why || "")
    }),
    evidence,
    decision,
    plan,
    execution: Object.freeze({
      authorized: false,
      executed: false,
      service: null,
      requiresExistingAuthorization: Boolean(primary),
      handoff: primary ? Object.freeze({ code: String(primary.code || ""), label: String(primary.label || "") }) : null
    }),
    verification: Object.freeze({
      required: Boolean(primary),
      stateToken,
      source: "canonical_mission_truth"
    })
  });
}

export function validateAdaptiveOrchestrationContract(contract) {
  const problems = [];
  if (!contract?.missionId) problems.push("mission_id_missing");
  if (contract?.readOnly !== true) problems.push("orchestration_not_read_only");
  if (contract?.authoritative !== false) problems.push("orchestration_claims_authority");
  if (contract?.execution?.authorized !== false) problems.push("orchestration_authorizes_execution");
  if (contract?.execution?.executed !== false) problems.push("orchestration_executed_mutation");
  if (contract?.plan?.steps?.length > 1) problems.push("multiple_primary_steps");
  if (contract?.decision?.state === "EXECUTE" && !contract?.decision?.action) problems.push("execute_without_action");
  if (contract?.decision?.state === "WAIT" && !contract?.decision?.waitingFor) problems.push("wait_without_actor");
  if (contract?.decision?.state === "BLOCKED" && !contract?.decision?.reason) problems.push("blocked_without_reason");
  if (contract?.verification?.required && !contract?.verification?.stateToken) problems.push("verification_without_state_token");
  return [...new Set(problems)];
}

function collectBlockers(coordination) {
  const out = [];
  for (const item of coordination?.problems || []) if (item) out.push(String(item));
  for (const item of coordination?.flow?.readiness?.blockers || []) {
    const text = item?.reason || item?.label || item?.code || item;
    if (text) out.push(String(text));
  }
  return Object.freeze([...new Set(out)].slice(0, 8));
}

function buildEvidence({ truth, flow, liveness, coordination, blockers }) {
  return Object.freeze({
    sufficient: Boolean(truth && Object.values(truth?.invariant || {}).every(Boolean) && blockers.length === 0),
    truthValid: Boolean(truth && Object.values(truth?.invariant || {}).every(Boolean)),
    liveness: String(liveness?.state || "UNKNOWN"),
    readiness: String(flow?.readiness?.state || "UNKNOWN"),
    actionAvailable: Boolean(coordination?.unified?.primary),
    blockers
  });
}

function buildDecision({ primary, waiting, blockers, liveness, truth, session }) {
  if (!truth || !Object.values(truth?.invariant || {}).every(Boolean)) {
    return Object.freeze({ state: "REVIEW", reason: "Canonical mission truth is not sufficiently validated for orchestration.", action: null, waitingFor: null });
  }
  if (blockers.length) {
    return Object.freeze({ state: "BLOCKED", reason: blockers[0], action: null, waitingFor: null });
  }
  if (waiting) {
    return Object.freeze({ state: "WAIT", reason: String(waiting.reasonCode || "The mission is waiting on a valid dependency."), action: waiting.action || null, waitingFor: waiting.waitingFor || waiting.actor || null });
  }
  if (String(liveness?.state || "") === "BREACH") {
    return Object.freeze({ state: "REVIEW", reason: "Mission liveness requires review before orchestration can proceed.", action: null, waitingFor: null });
  }
  if (primary) {
    return Object.freeze({ state: "EXECUTE", reason: String(primary.reason || "A valid next operational action is available."), action: primary, waitingFor: null, viewerCanExecute: Boolean(primary.viewerCanExecute && ["admin","driver","executor"].includes(String(session.role || ""))) });
  }
  return Object.freeze({ state: "OBSERVE", reason: "No valid next action is currently exposed by the existing action authorities.", action: null, waitingFor: null });
}

function buildPlan({ decision, primary, waiting }) {
  const steps = [];
  if (decision.state === "EXECUTE" && primary) steps.push(Object.freeze({ order: 1, kind: "ACTION", code: String(primary.code || ""), label: String(primary.label || ""), requiresAuthorization: true }));
  else if (decision.state === "WAIT" && waiting) steps.push(Object.freeze({ order: 1, kind: "WAIT", code: String(waiting.action?.code || ""), label: String(waiting.action?.label || "Waiting"), requiresAuthorization: false }));
  else if (decision.state === "BLOCKED" || decision.state === "REVIEW") steps.push(Object.freeze({ order: 1, kind: "REVIEW", code: "review_orchestration", label: "Review current situation", requiresAuthorization: false }));
  return Object.freeze({ state: decision.state, steps: Object.freeze(steps), previewOnly: true });
}
