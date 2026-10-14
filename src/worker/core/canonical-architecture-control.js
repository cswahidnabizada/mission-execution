import {RELEASE_VERSION} from './release.js';
/* ON Mission 10.30.56 — Full Architecture Control Gate.
 * Registry only: it declares ownership of canonical business decisions.
 * It is not a second business authority and performs no mutations.
 */
export const CANONICAL_ARCHITECTURE_VERSION=RELEASE_VERSION;
export const CANONICAL_AUTHORITIES=Object.freeze({
  truth:"src/worker/core/canonical-truth-registry.js",
  lifecycle:"src/worker/security/sector-lifecycle.service.js",
  liveness:"src/worker/core/canonical-liveness-registry.js",
  custodyResponsibility:"src/worker/extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js",
  actions:"src/worker/application/actions/action-registry.js",
  actionExecution:"src/worker/extensions/action-execution/secured-action-execution.routes.js",
  authorization:"src/worker/security/authorization.js",
  tenantBoundary:"src/worker/security/mission-access.js",
  evidence:"src/worker/modules/verification/verification.service.js",
  attention:"src/worker/modules/attention/attention.service.js",
  operationalContext:"src/worker/extensions/operations-context/unified-operational-execution.contract.js",
  domain:"src/worker/core/canonical-domain-registry.js",
  capability:"src/worker/core/canonical-capability-registry.js",
  vocabulary:"src/worker/core/canonical-vocabulary.js",
  dataEntry:"src/worker/security/platform-data-entry.service.js",
  missionIntelligence:"src/worker/modules/intelligence/mission-context.js",
  events:"src/worker/modules/transitions/transition-safety.service.js",
  transitions:"src/worker/modules/transitions/mission-transition.service.js",
  outcome:"src/worker/security/mission-outcome-authority.service.js",
  continuity:"src/worker/security/mission-continuity-authority.service.js"
});
export const CANONICAL_UI_COMPONENTS=Object.freeze(["lifecycleComponent","livenessBadge","statusBadge","executionComponent","actionButton","feedbackComponent","custodyResponsibilityComponent","custodyComponent","responsibilityComponent","executorComponent","custodyTransferComponent","agreementComponent","identityComponent","tenantBoundaryComponent","relationshipComponent","capabilityComponent","permissionStateComponent","preconditionComponent","evidenceComponent","evidenceStatusComponent","requirementComponent","outcomeComponent","uncertaintyComponent","degradedStateComponent","waitingComponent","blockedComponent","staleStateComponent","attentionComponent","severityComponent","attentionReasonComponent","resolutionComponent","operationalContextComponent","nextStepComponent","operationalSummaryComponent","focusComponent","signalComponent","recommendationComponent","priorityComponent","dataStateComponent","projectionHealthComponent","emptyStateComponent","dataFreshnessComponent","loadingComponent","errorComponent","unavailableComponent","permissionDeniedComponent","notFoundComponent"]);
export const CANONICAL_UI_AUTHORITIES=Object.freeze({
  registry:"public/assets/ui/index.js",
  stylesheet:"public/assets/ui/canonical-ui-system.css",
    custodyResponsibilityStylesheet:"public/assets/css/extensions/canonical-mission-workspace.css"
});
export const CONTROLLED_OUTCOMES=Object.freeze(["SUCCESS","DENIED","INVALID","STALE","WAITING","DEGRADED","UNAVAILABLE","UNKNOWN"]);
export const CONTROLLED_LAYERS=Object.freeze(["SECURITY","TENANT_ISOLATION","TRUTH","LIFECYCLE","LIVENESS","CUSTODY_RESPONSIBILITY","AUTHORIZATION","AGREEMENT","EVIDENCE","ACTIONS","OUTCOME","ATTENTION","OPERATIONAL_CONTEXT","INTELLIGENCE","DATA_PROJECTION","EVENTS","UI","RUNTIME","DATA_ENTRY"]);
export function canonicalArchitectureManifest(){return Object.freeze({version:CANONICAL_ARCHITECTURE_VERSION,architectureFrozen:true,postFreezeFeaturePolicy:"No new competing engines or authorities; changes must reuse existing canonical authorities and remain compatibility/hardening work.",lifecycle:["ENTRY","TRUTH","DECISION","CREATION","RUNTIME","CONTROL","TRASH"],authorities:CANONICAL_AUTHORITIES,ui:CANONICAL_UI_AUTHORITIES,components:CANONICAL_UI_COMPONENTS,outcomes:CONTROLLED_OUTCOMES,layers:CONTROLLED_LAYERS});}
