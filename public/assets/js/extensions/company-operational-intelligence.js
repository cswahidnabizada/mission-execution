import {RELEASE_VERSION} from "/assets/js/core/release.js";
/*
 * ON Mission 10.14 — Company Operational Intelligence
 * Read-only company-level presentation contract.
 * Composes the tenant overview's existing intelligence outputs only.
 * It never owns truth, authorization, mutation, custody, responsibility, or execution.
 */

const text = value => String(value ?? "").trim();
const count = value => Math.max(0, Number(value || 0));

function firstSignal(data = {}) {
  return Array.isArray(data?.intelligence?.signals) ? data.intelligence.signals[0] || null : null;
}

function evidenceFrom(signal, analyticsSignal) {
  const source = signal || analyticsSignal || {};
  const evidenceCount = Number(source.evidenceCount ?? source.evidence_count ?? source.evidence?.count ?? 0);
  const confidence = text(source.confidence || source.confidenceLevel || source.evidence?.confidence) || null;
  const sufficient = source.evidenceSufficient ?? source.evidence_sufficient ?? source.evidence?.sufficient;
  return Object.freeze({
    count: Number.isFinite(evidenceCount) ? Math.max(0, evidenceCount) : 0,
    confidence: confidence ? confidence.toUpperCase() : "NOT_EXPOSED",
    sufficient: sufficient == null ? null : Boolean(sufficient),
    source: text(source.evidenceSource || source.source || "") || null
  });
}

function buildWhy(data, signal, evidence) {
  const decision = data?.decision || {};
  const detail = text(decision.detail);
  if (detail) return detail;
  const reason = text(signal?.reason);
  if (reason) return reason;
  if (evidence.sufficient === false) return "Available evidence is not sufficient for a stronger intelligence conclusion.";
  return "No higher-priority operational intelligence signal is currently established.";
}

function buildState(data, signal) {
  const level = text(data?.decision?.level || signal?.level).toLowerCase();
  if (["critical", "attention", "watch"].includes(level)) return level;
  return "stable";
}

function buildNext(data, signal) {
  const action = data?.decision?.action;
  if (action && text(action.label)) return Object.freeze({ label: text(action.label), module: text(action.module), area: text(action.area), href: text(action.href) });
  if (signal?.link) return Object.freeze({ label: "OPEN MISSION", href: text(signal.link) });
  return null;
}

export function buildCompanyOperationalIntelligence(data = {}) {
  const signal = firstSignal(data);
  const analyticsSignal = Array.isArray(data?.analytics?.signals) ? data.analytics.signals[0] || null : null;
  const evidence = evidenceFrom(signal, analyticsSignal);
  const attention = data?.intelligence?.attention || {};
  const state = buildState(data, signal);
  const next = buildNext(data, signal);
  const events = Array.isArray(data?.intelligence?.events) ? data.intelligence.events.slice(0, 3) : [];
  const activeSignals = count(attention.total);

  return Object.freeze({
    version: RELEASE_VERSION,
    presentationOnly: true,
    state,
    signal: signal ? Object.freeze({
      missionId: Number(signal.missionId || 0) || null,
      reference: text(signal.reference) || null,
      level: text(signal.level).toUpperCase() || "SIGNAL",
      reason: text(signal.reason) || null
    }) : null,
    why: buildWhy(data, signal, evidence),
    evidence,
    severity: text(signal?.level || data?.decision?.level).toUpperCase() || "UNSPECIFIED",
    confidence: evidence.confidence,
    activeSignals,
    recentChanges: Object.freeze(events.map(event => Object.freeze({
      label: text(event?.label) || "Operational change",
      actor: text(event?.actor) || null
    }))),
    nextAction: next,
    safety: Object.freeze({
      readOnly: true,
      authoritative: false,
      createsTruth: false,
      createsAuthorization: false,
      createsAction: false,
      executesAction: false
    })
  });
}
