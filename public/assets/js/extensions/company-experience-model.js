import {RELEASE_VERSION} from "/assets/js/core/release.js";
import {isTerminalStatus,canonicalMissionStatus} from "../core/lifecycle-registry.js";
/*
 * ON Mission 10.13 — Adaptive Company Experience
 * Presentation-only company experience model.
 *
 * This module composes existing read-only projections into a company-level
 * presentation contract. It does not authorize, mutate, own mission truth,
 * assign responsibility/custody, or execute actions.
 */

const INTENTS = Object.freeze(["intake", "operate", "act", "find", "marketplace"]);

const count = value => Math.max(0, Number(value || 0));
const text = value => String(value ?? "").trim();

function activeMissionCount(overview) {
  const metrics = overview?.operation?.today || overview?.metrics || {};
  const explicit = metrics?.active ?? metrics?.activeMissions;
  if (explicit != null) return count(explicit);
  return count(overview?.activeMissions);
}

function meaningfulWork(overview) {
  const attention = count(overview?.intelligence?.attention?.total);
  const critical = count(overview?.intelligence?.attention?.critical);
  const pending = count(overview?.operation?.collaboration?.pendingForYou);
  const custody = count(overview?.operation?.custody?.activeCases);
  const focus = overview?.intelligence?.focus?.available ? 1 : 0;
  const active = activeMissionCount(overview);
  return {
    attention,
    critical,
    pending,
    custody,
    focus,
    active,
    total: attention + pending + custody + focus
  };
}

function deriveIntents(overview, marketplace = {}) {
  const work = meaningfulWork(overview);
  const hasActive = work.active > 0;
  const hasIntake = work.pending > 0 || count(overview?.operation?.collaboration?.pendingRequests) > 0;
  const hasMarketplace = count(marketplace?.available) > 0 || count(marketplace?.recommended) > 0 || count(marketplace?.requests) > 0 || count(marketplace?.published) > 0;
  const hasFind = Boolean(
    count(marketplace?.available) ||
    count(marketplace?.recommended) ||
    count(overview?.operation?.drivers?.total) ||
    count(overview?.people?.total)
  );

  return INTENTS.filter(intent => {
    if (intent === "intake") return hasIntake;
    if (intent === "operate") return hasActive || work.attention > 0 || work.custody > 0;
    if (intent === "act") return work.total > 0 || Boolean(overview?.decision?.action);
    if (intent === "find") return hasFind;
    if (intent === "marketplace") return hasMarketplace;
    return false;
  });
}

function situation(overview, work) {
  const decision = overview?.decision || {};
  const level = text(decision.level).toLowerCase() || "good";

  if (work.critical > 0) {
    return {
      level: "critical",
      headline: work.critical === 1 ? "One critical item needs attention" : `${work.critical} critical items need attention`,
      detail: text(decision.detail) || "Review the highest-priority operational work first."
    };
  }
  if (work.custody > 0) {
    return {
      level: "attention",
      headline: work.custody === 1 ? "A custody handoff needs attention" : `${work.custody} custody handoffs need attention`,
      detail: text(decision.detail) || "Continue the handoff through the existing secured workflow."
    };
  }
  if (work.attention > 0 || level === "attention" || level === "watch") {
    return {
      level: level === "watch" ? "watch" : "attention",
      headline: text(decision.title) || "Operational work needs attention",
      detail: text(decision.detail) || "Review the current operational situation."
    };
  }
  if (work.active > 0) {
    return {
      level: "active",
      headline: "Operations are in progress",
      detail: "Your current work is active. Open Operations to continue where needed."
    };
  }
  return {
    level: "good",
    headline: "Operation is stable",
    detail: text(decision.detail) || "No higher-priority operational work is asking for attention."
  };
}

function entryTargets(overview = {}) {
  const focusMissionId = Number(overview?.intelligence?.focus?.missionId || overview?.focus?.missionId || 0) || null;
  const signalMissionId = Number(overview?.intelligence?.signals?.[0]?.missionId || 0) || null;
  const pending = count(overview?.operation?.collaboration?.pendingForYou) || count(overview?.operation?.collaboration?.pendingRequests);
  return Object.freeze({
    actMissionId: focusMissionId,
    operateMissionId: signalMissionId,
    intakeSection: pending > 0 ? "requests" : "intake"
  });
}

function nextIntent(intents, work) {
  if (work.critical || work.attention || work.custody || work.focus) return intents.includes("act") ? "act" : "operate";
  if (work.pending) return intents.includes("intake") ? "intake" : "operate";
  if (intents.includes("operate")) return "operate";
  if (intents.includes("marketplace")) return "marketplace";
  if (intents.includes("find")) return "find";
  return intents[0] || "find";
}

/**
 * Build the company-level presentation contract from existing read models.
 * The result is safe to render but is not an authority for authorization or mutation.
 */
export function buildCompanyExperience(overview = {}, marketplace = {}) {
  const work = meaningfulWork(overview);
  const intents = deriveIntents(overview, marketplace);
  const current = situation(overview, work);
  const targets = entryTargets(overview);

  return Object.freeze({
    version: RELEASE_VERSION,
    presentationOnly: true,
    situation: Object.freeze(current),
    work: Object.freeze({
      active: work.active,
      attention: work.attention,
      critical: work.critical,
      pending: work.pending,
      custody: work.custody,
      meaningful: work.total
    }),
    intents: Object.freeze(intents),
    nextIntent: nextIntent(intents, work),
    entryTargets: targets,
    marketplace: Object.freeze({
      available: count(marketplace?.available),
      recommended: count(marketplace?.recommended),
      requests: count(marketplace?.requests),
      published: count(marketplace?.published)
    })
  });
}

export { INTENTS };
