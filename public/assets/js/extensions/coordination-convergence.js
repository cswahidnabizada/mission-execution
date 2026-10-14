/* ON Mission 10.16 — Coordination Convergence & Conflict Hardening
 * Read-only deterministic convergence over existing presentation signals.
 * This module selects one situation; it does not create truth, authorize,
 * mutate, assign, transfer custody/responsibility, or execute actions.
 */

const text = value => String(value ?? "").trim();
const num = value => Number(value || 0) || 0;

const SEVERITY = Object.freeze({ CRITICAL: 100, URGENT: 90, HIGH: 80, MEDIUM: 60, LOW: 40, INFO: 20 });

function severityScore(value) {
  return SEVERITY[text(value).toUpperCase()] ?? 0;
}

function signalScore(signal = {}) {
  const level = text(signal.level).toUpperCase();
  const severity = severityScore(signal.severity || signal.priority || signal.level);
  if (level === "BLOCKED" || level === "BREACH" || level === "ESCALATED") return 120 + severity;
  if (level === "WAITING") return 70 + severity;
  if (level === "ACTIONABLE") return 65 + severity;
  return 30 + severity;
}

function candidateKey(candidate) {
  return [
    text(candidate.type).toLowerCase(),
    num(candidate.missionId),
    num(candidate.requestId),
    text(candidate.id).toLowerCase()
  ].join("|");
}

function candidateFromSignal(signal, index) {
  const missionId = num(signal?.missionId);
  if (!missionId) return null;
  return {
    type: "mission",
    id: "open_mission",
    missionId,
    requestId: null,
    score: signalScore(signal),
    order: index,
    signal
  };
}

function candidateFromRequest(request, index) {
  const requestId = num(request?.id || request?.request_id);
  if (!requestId) return null;
  return {
    type: text(request?.requestType || request?.type).toLowerCase().includes("foryou") ? "foryouRequest" : "request",
    id: "review_request",
    missionId: num(request?.mission_id || request?.missionId) || null,
    requestId,
    score: 60,
    order: index,
    request
  };
}

function candidateFromOpportunity(opportunity, index) {
  if (text(opportunity?.state).toUpperCase() !== "ACTIONABLE") return null;
  return {
    type: "opportunity",
    id: "open_marketplace",
    missionId: null,
    requestId: null,
    score: 30,
    order: index,
    opportunity
  };
}

export function convergeCoordinationCandidates({ signals = [], requests = [], opportunities = [] } = {}) {
  const candidates = [];
  signals.forEach((x, i) => { const c = candidateFromSignal(x, i); if (c) candidates.push(c); });
  requests.forEach((x, i) => { const c = candidateFromRequest(x, i); if (c) candidates.push(c); });
  opportunities.forEach((x, i) => { const c = candidateFromOpportunity(x, i); if (c) candidates.push(c); });

  const unique = new Map();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const existing = unique.get(key);
    if (!existing || candidate.score > existing.score) unique.set(key, candidate);
  }

  const ordered = [...unique.values()].sort((a, b) =>
    (b.score - a.score) || (a.type.localeCompare(b.type)) || (a.missionId || 0) - (b.missionId || 0) || (a.requestId || 0) - (b.requestId || 0) || (a.order - b.order)
  );

  return Object.freeze({
    selected: ordered[0] || null,
    candidateCount: ordered.length,
    suppressedCount: Math.max(0, ordered.length - 1),
    candidates: Object.freeze(ordered.map(x => Object.freeze(x))),
    safety: Object.freeze({
      readOnly: true,
      createsTruth: false,
      createsAuthorization: false,
      createsAction: false,
      executesAction: false,
      changesResponsibility: false,
      changesCustody: false
    })
  });
}

export { severityScore };
