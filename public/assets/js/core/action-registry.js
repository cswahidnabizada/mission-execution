/* ON Mission 10.30.39 — Canonical Action Identity Registry (UI)
 * Identity-only mirror of the server Action Registry. UI code references stable IDs;
 * it never grants authority, decides permission, or mutates canonical truth.
 * Server registry + secured services remain authoritative.
 */
const IDS = [
  "open_mission","check_assignment","edit_mission","edit_mission_data","review_network","review_foryou","share_foryou","share_network","assign_driver","change_driver","accept_network","request_foryou_mission","cancel_foryou_request","reject_network","approve_foryou_request","decline_foryou_request","advance_execution","confirm_arrival","confirm_pickup","start_transit","capture_delivery_proof","confirm_delivery","complete_mission","report_exception","resolve_exception","navigate","message","review_availability","reclaim_execution","start_navigation","request_current_location","share_current_location","resolve_traffic","resolve_waiting","cancel_mission","delete_mission","repost_foryou","restart_network","withdraw_foryou","withdraw_network","reactivate_mission","start_custody_recovery","abort_custody_transfer","start_custody_resolution","confirm_custody_release","finalize_custody_transfer","accept_custody","reassign_custody_receiver","review_completion_blocker","edit_driver","edit_driver_operational_profile","toggle_driver_status","remove_driver","request_trust","accept_trust","reject_trust","suspend_trust","add_customer_location","archive_customer"
]
const SET = new Set(IDS);
export const ACTION_IDS = Object.freeze(Object.fromEntries(IDS.map(code=>[code,code])));
export const ACTION_ID_LIST = Object.freeze([...IDS]);
export const ACTION_GROUPS = Object.freeze({
  people: Object.freeze(["edit_driver","edit_driver_operational_profile","toggle_driver_status","remove_driver","add_customer_location","archive_customer"]),
  networkTrust: Object.freeze(["request_trust","accept_trust","reject_trust","suspend_trust"]),
  assignment: Object.freeze(["assign_driver","change_driver","reassign_custody_receiver","start_custody_resolution"]),
  execution: Object.freeze(["reclaim_execution","complete_mission","start_custody_recovery","finalize_custody_transfer","accept_custody","abort_custody_transfer"]),
  management: Object.freeze(["edit_mission","edit_mission_data","cancel_mission","delete_mission","reactivate_mission"]),
  custody: Object.freeze(["start_custody_resolution","start_custody_recovery","confirm_custody_release","accept_custody","finalize_custody_transfer","reassign_custody_receiver","abort_custody_transfer"]),
  missionFlow: Object.freeze(["confirm_arrival","confirm_pickup","start_transit","confirm_delivery","complete_mission"]),
  distribution: Object.freeze(["share_foryou","share_network","repost_foryou","restart_network","review_network","review_foryou","accept_network","request_foryou_mission","cancel_foryou_request","reject_network","approve_foryou_request","decline_foryou_request"])
});
export function actionInGroup(code,group){return Boolean(ACTION_GROUPS[group]?.includes(normalizeActionId(code)));}
export const ACTION_COMPATIBILITY_ALIASES=Object.freeze({accept_foryou:"approve_foryou_request",decline_foryou:"decline_foryou_request"});
export function normalizeActionId(code){const raw=String(code??"").trim().toLowerCase();return ACTION_COMPATIBILITY_ALIASES[raw]||raw;}
export function hasCanonicalAction(code){return SET.has(normalizeActionId(code));}
export function requireCanonicalAction(code){const id=normalizeActionId(code);if(!SET.has(id))throw new Error(`Unknown canonical action: ${id||"(empty)"}`);return id;}
export function canonicalActionId(code){const id=normalizeActionId(code);return SET.has(id)?id:null;}
export function canonicalActionCount(){return IDS.length;}
