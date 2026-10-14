import {RELEASE_VERSION} from "/assets/js/core/release.js";
/* ON Mission 10.16 — Coordination Situation Contract
 * Read-only presentation contract. User-facing output is deliberately limited
 * to navigation, scope, object, and action concepts.
 * It does not authorize, mutate, assign, transfer custody/responsibility, or execute.
 */

const text = value => String(value ?? "").trim();
const num = value => Number(value || 0) || 0;

const NAVIGATION = Object.freeze(["overview", "operations", "insights", "marketplace"]);

const cleanAction = action => action ? Object.freeze({
  id: text(action.id || action.code),
  label: text(action.label) || "Open",
  navigation: text(action.navigation) || "operations",
  missionId: num(action.missionId) || null,
  requestId: num(action.requestId) || null
}) : null;

function scopeLabel(value) {
  const key = text(value).toLowerCase();
  return ({
    current: "Current",
    actions: "Actions",
    attention: "Attention",
    requests: "Requests",
    people: "People",
    marketplace: "Marketplace",
    history: "History"
  })[key] || "Current";
}

function objectLabel(value) {
  const key = text(value).toLowerCase();
  return ({
    mission: "Mission",
    request: "Request",
    foryourequest: "ForYou Request",
    person: "Person",
    partner: "Partner",
    opportunity: "Opportunity"
  })[key] || "Item";
}

export function buildCoordinationSituation(input = {}) {
  const situation = input.situation || input;
  const scope = scopeLabel(situation.scope || situation.category);
  const object = objectLabel(situation.objectType || situation.kind);
  const action = cleanAction(situation.action || situation.nextAction);
  const navigation = NAVIGATION.includes(text(action?.navigation).toLowerCase())
    ? text(action.navigation).toLowerCase()
    : "operations";

  return Object.freeze({
    version: RELEASE_VERSION,
    presentationOnly: true,
    navigation,
    scope,
    object,
    action,
    waitingOn: text(situation.waitingOn) || null,
    reason: text(situation.reason) || null,
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

export { NAVIGATION };
