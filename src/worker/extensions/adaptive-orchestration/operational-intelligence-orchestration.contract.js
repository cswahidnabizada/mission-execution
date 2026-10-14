import {RELEASE_VERSION} from '../../core/release.js';
import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 10.19.24 — Operational Intelligence Orchestration.
 * Read-only convergence over authoritative operational projections.
 * It answers: what is happening, what matters, what is likely, what next,
 * which capability handles it, and what the viewer can safely do now.
 * It never creates truth, authorization, custody, responsibility, or execution.
 */
export const OPERATIONAL_INTELLIGENCE_ORCHESTRATION_VERSION=RELEASE_VERSION;

const text = v => String(v ?? "").trim();
const upper = v => text(v).toUpperCase();
const num = v => Number(v || 0) || 0;
const freeze = value => Object.freeze(value);

const PRIORITY = Object.freeze({ CRITICAL: 100, URGENT: 90, HIGH: 80, MEDIUM: 60, LOW: 40, INFO: 20 });

export function buildOperationalIntelligenceOrchestration({
  mission = null,
  coordination = null,
  finalOperationalProduct = null,
  predictive = null,
  capabilityAudit = null,
  now = Date.now()
} = {}) {
  const status = text(mission?.status || coordination?.status || "UNKNOWN");
  const missionId = num(mission?.id || coordination?.missionId);
  const truth = coordination?.truth || null;
  const flow = coordination?.flow || null;
  const liveness = coordination?.liveness || null;
  const unified = coordination?.unified || null;
  const product = finalOperationalProduct || coordination?.finalOperationalProduct || null;
  const primary = unified?.primary || product?.action || null;
  const waiting = unified?.waiting || null;
  const problems = unique([...(coordination?.problems || []), ...(coordination?.truthProblems || [])]);
  const truthValid = Boolean(truth && Object.values(truth?.invariant || {}).every(Boolean));
  const terminal = isLifecycleTerminal(status);
  const stateToken = num(mission?.state_version) > 0 ? `v:${num(mission.state_version)}` : text(mission?.updated_at);

  const situation = buildSituation({ status, flow, liveness, product, problems });
  const significance = buildSignificance({ situation, liveness, problems, unified, predictive, mission });
  const trajectory = buildTrajectory({ mission, liveness, product, predictive, situation, now });
  const next = buildNext({ primary, waiting, flow, product, liveness, terminal, truthValid });
  const capability = buildCapability({ next, primary, capabilityAudit, unified, terminal });
  const safeAction = buildSafeAction({ next, primary, truthValid, stateToken, terminal, capability });
  const verification = buildVerification({ stateToken, primary, truthValid, next, terminal });
  const conflicts = buildConflicts({ problems, truthValid, primary, waiting, capabilityAudit });

  return freeze({
    version: OPERATIONAL_INTELLIGENCE_ORCHESTRATION_VERSION,
    readOnly: true,
    authoritative: false,
    missionId: missionId || null,
    stateToken,
    generatedAt: new Date(now).toISOString(),
    situation,
    significance,
    trajectory,
    next,
    capability,
    safeAction,
    verification,
    conflicts,
    safety: freeze({
      createsTruth: false,
      createsAuthorization: false,
      executesAction: false,
      changesResponsibility: false,
      changesCustody: false,
      persistsPrediction: false
    })
  });
}

export function validateOperationalIntelligenceOrchestration(model) {
  const problems = [];
  if (!model?.missionId) problems.push("mission_id_missing");
  if (model?.readOnly !== true) problems.push("orchestration_not_read_only");
  if (model?.authoritative !== false) problems.push("orchestration_claims_authority");
  if (model?.safeAction?.execute !== false) problems.push("orchestration_execution_enabled");
  if (model?.safety?.createsAuthorization !== false) problems.push("orchestration_authorization_created");
  if (model?.safety?.createsTruth !== false) problems.push("orchestration_truth_created");
  if (model?.next?.state === "ACT_NOW" && !model?.next?.action) problems.push("act_now_without_action");
  if (model?.safeAction?.available && !model?.verification?.required) problems.push("safe_action_without_verification");
  return [...new Set(problems)];
}

function buildSituation({ status, flow, liveness, product, problems }) {
  const state = upper(liveness?.state || product?.liveness?.state || status || "UNKNOWN");
  const reason = text(liveness?.reason || product?.experience?.why || product?.reason || problems[0] || "Current operational state");
  const actor = flow?.next?.actor || product?.action?.actor || null;
  return freeze({ state, status, reason, actor: actor ? freeze({ type: text(actor.type), id: num(actor.id) || null, name: text(actor.name) }) : null });
}

function buildSignificance({ situation, liveness, problems, unified, predictive, mission }) {
  const signals = [];
  const add = (level, reason, source) => { if (reason) signals.push({ level: upper(level), score: PRIORITY[upper(level)] || 0, reason: text(reason), source: text(source) }); };
  const risk = upper(predictive?.riskLevel || predictive?.state || "");
  if (["CRITICAL", "HIGH", "URGENT"].includes(risk)) add(risk, predictive?.reason || "Predictive operational risk is elevated.", "predictive_operations");
  if (["BREACH", "ESCALATED"].includes(situation.state)) add("CRITICAL", situation.reason, "liveness");
  else if (situation.state === "BLOCKED") add("HIGH", situation.reason, "liveness");
  else if (situation.state === "WAITING") add("MEDIUM", situation.reason, "liveness");
  if (problems.length) add("HIGH", problems[0], "coordination");
  if (unified?.waiting && !unified?.primary) add("MEDIUM", `Waiting for ${text(unified.waiting.waitingFor || unified.waiting.actor || "a valid dependency")}.`, "action_coordination");
  const sorted = signals.sort((a, b) => b.score - a.score).slice(0, 5);
  return freeze({ level: sorted[0]?.level || "LOW", reason: sorted[0]?.reason || "No elevated operational signal is currently dominant.", signals: freeze(sorted.map(freeze)) });
}

function buildTrajectory({ mission, liveness, product, predictive, situation, now }) {
  const prediction = predictive?.prediction || predictive?.primary || null;
  const horizon = text(predictive?.horizon || predictive?.timeHorizon || product?.presentation?.horizon || "");
  const deadline = mission?.deadline_at || mission?.deadlineAt;
  let deadlineState = "UNKNOWN";
  if (deadline) {
    const delta = new Date(deadline).getTime() - now;
    deadlineState = delta < 0 ? "OVERDUE" : delta <= 2 * 3600000 ? "CRITICAL_WINDOW" : delta <= 8 * 3600000 ? "AT_RISK_WINDOW" : "ON_TRACK_WINDOW";
  }
  const state = upper(prediction?.riskLevel || prediction?.state || product?.state || situation.state);
  return freeze({ state, deadline: deadlineState, horizon: horizon || "CURRENT_OPERATION", prediction: text(prediction?.label || prediction?.reason || prediction?.description || "") || null, likelyOutcome: text(prediction?.predictedOutcome || product?.consequence?.consequence || "") || null });
}

function buildNext({ primary, waiting, flow, product, liveness, terminal, truthValid }) {
  if (terminal) return freeze({ state: "OBSERVE", action: null, reason: "The mission is terminal; operational mutations are no longer part of the active flow." });
  if (!truthValid) return freeze({ state: "REVIEW", action: null, reason: "Canonical truth is not sufficiently validated for orchestration." });
  if (upper(liveness?.state) === "BREACH") return freeze({ state: "REVIEW", action: null, reason: text(liveness?.reason || "Liveness requires review before proceeding.") });
  if (waiting && !primary) return freeze({ state: "WAIT", action: waiting.action || null, waitingFor: text(waiting.waitingFor || waiting.actor || "a valid dependency"), reason: text(waiting.reasonCode || "The mission is waiting on a valid dependency.") });
  const action = primary || flow?.next?.action || product?.action || null;
  if (action) return freeze({ state: "ACT_NOW", action: freeze({ code: text(action.code), label: text(action.label || action.code), reason: text(action.reason) }), reason: text(action.reason || "The existing action authority exposes the next operational step.") });
  return freeze({ state: "OBSERVE", action: null, reason: "No executable next step is currently exposed by the existing authorities." });
}

function buildCapability({ next, primary, capabilityAudit, unified, terminal }) {
  const code = text(next?.action?.code || primary?.code);
  const routeAligned = capabilityAudit?.complete !== false;
  const domain = text(primary?.domain || "mission");
  const source = text(unified?.source || "existing_action_authority");
  return freeze({
    state: next.state === "ACT_NOW" ? "READY" : next.state,
    actionCode: code || null,
    domain,
    source,
    routeAligned,
    terminal,
    handler: code ? `secured_action:${code}` : null,
    reason: code ? `Use the existing secured capability for ${text(next.action?.label || code)}.` : "No executable capability should be selected until the operational state changes."
  });
}

function buildSafeAction({ next, primary, truthValid, stateToken, terminal, capability }) {
  const candidate = Boolean(next?.state === "ACT_NOW" && primary && truthValid && stateToken && !terminal && capability?.routeAligned);
  return freeze({
    available: candidate,
    execute: false,
    code: candidate ? text(primary.code) : null,
    label: candidate ? text(primary.label || primary.code) : null,
    reason: candidate ? "The action may be handed to the existing secured action surface; authorization must be revalidated there." : text(next?.reason || "No safe action is currently ready."),
    authorization: "EXISTING_SECURED_SERVICE"
  });
}

function buildVerification({ stateToken, primary, truthValid, next, terminal }) {
  return freeze({
    required: Boolean(primary || next?.state === "ACT_NOW") && !terminal,
    truthValid,
    stateToken: stateToken || null,
    actionCode: primary ? text(primary.code) : null,
    mode: "REVALIDATE_BEFORE_EXECUTION"
  });
}

function buildConflicts({ problems, truthValid, primary, waiting, capabilityAudit }) {
  const out = [...problems];
  if (!truthValid) out.push("canonical_truth_not_validated");
  if (primary && waiting) out.push("action_and_waiting_state_conflict");
  if (capabilityAudit?.complete === false) out.push("capability_route_alignment_gap");
  return freeze([...new Set(out)].slice(0, 8));
}

function unique(values) { return [...new Set((values || []).filter(Boolean).map(text))].slice(0, 8); }
