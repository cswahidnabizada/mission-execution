/** ON Mission 10.30.39 — Canonical Truth Registry.
 * Vocabulary and authority map only. It never mutates or authorizes.
 */
export const CANONICAL_TRUTH_VERSION="1.1";

// Lifecycle vocabulary is owned exclusively by Canonical Lifecycle Registry.
// These exports are compatibility facades for truth consumers and contain no duplicate definitions.
export {MISSION_STATUS_FLOW,MISSION_TERMINAL_STATUSES,MISSION_PRE_CUSTODY_STATUSES,MISSION_CUSTODY_STATUSES,canonicalMissionStatus,isTerminalStatus,isPreCustodyStatus,isCustodyStatus} from "../domains/logistics/logistics-lifecycle.contract.js";

const TRUTH_RAW={
  "mission.status":t("mission","missions.status","mission-transition-service","mission_status_history"),
  "mission.state_version":t("mission","missions.state_version","transition-safety-service","mission_transition_requests"),
  "mission.assignment":t("assignment","mission_assignments","mission-assignment-authority-service","mission_assignment_events"),
  "mission.responsibility":t("responsibility","mission_assignments + custody cases","mission-assignment-authority-service / secured-custody-services","mission events"),
  "mission.custody":t("custody","custody_cases / custody transfers","secured-custody-services","custody events"),
  "mission.distribution":t("distribution","mission_tenant_access / public_mission_requests / network_mission_invitations","secured-sharing-services","sharing events"),
  "mission.delivery_proof":t("evidence","mission delivery-proof records / private R2 objects","secured-file-service","delivery proof events"),
  "mission.files":t("evidence","mission_files / governed R2 objects","canonical-file-governance-service","file governance events"),
  "mission.exceptions":t("exception","mission exceptions","secured-exception-services","exception events"),
  "mission.events":t("audit","mission event ledger / status history","secured-transition-services","immutable event ledger"),
  "mission.liveness":t("liveness","liveness assessment projection","mission-liveness-guard","none-read-only"),
  "mission.outcome":t("outcome","mission_outcome_assessments","mission-outcome-authority-service","immutable outcome assessments"),
  "mission.next_situation":t("continuity","mission_next_situations","mission-continuity-authority-service","immutable continuity assessments")
};
export const CANONICAL_TRUTH_REGISTRY=Object.freeze(Object.fromEntries(Object.entries(TRUTH_RAW).map(([id,v])=>[id,Object.freeze({id,canonical:true,...v})])));
export function truthDefinition(id){return CANONICAL_TRUTH_REGISTRY[String(id||"")]||null;}
export function allTruthDefinitions(){return Object.values(CANONICAL_TRUTH_REGISTRY);}
function t(domain,source,authority,event){return {domain,source,authority,event};}
