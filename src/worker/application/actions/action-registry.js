/**
 * Actions Intelligence V7.8.0 / ON Mission 10.30.38 — Canonical Action Registry
 *
 * Vocabulary only. This registry never executes actions and never grants authority.
 * Existing secured APIs/services remain authoritative and must validate again.
 */
export const ACTION_CODES=Object.freeze({
  OPEN_MISSION:"open_mission",
  CHECK_ASSIGNMENT:"check_assignment",
  EDIT_MISSION:"edit_mission",
  EDIT_MISSION_DATA:"edit_mission_data",
  REVIEW_NETWORK:"review_network",
  REVIEW_FORYOU:"review_foryou",
  SHARE_FORYOU:"share_foryou",
  SHARE_NETWORK:"share_network",
  ASSIGN_DRIVER:"assign_driver",
  CHANGE_DRIVER:"change_driver",
  ACCEPT_NETWORK:"accept_network",
  REQUEST_FORYOU_MISSION:"request_foryou_mission",
  CANCEL_FORYOU_REQUEST:"cancel_foryou_request",
  REJECT_NETWORK:"reject_network",
  APPROVE_FORYOU_REQUEST:"approve_foryou_request",
  DECLINE_FORYOU_REQUEST:"decline_foryou_request",
  ADVANCE_EXECUTION:"advance_execution",
  CONFIRM_ARRIVAL:"confirm_arrival",
  CONFIRM_PICKUP:"confirm_pickup",
  START_TRANSIT:"start_transit",
  START_OPERATION:"start_operation",
  CAPTURE_DELIVERY_PROOF:"capture_delivery_proof",
  CONFIRM_DELIVERY:"confirm_delivery",
  COMPLETE_MISSION:"complete_mission",
  COMPLETE_OPERATION:"complete_operation",
  REPORT_EXCEPTION:"report_exception",
  RESOLVE_EXCEPTION:"resolve_exception",
  NAVIGATE:"navigate",
  MESSAGE:"message",
  MESSAGE_EXECUTOR:"message_executor",
  REVIEW_AVAILABILITY:"review_availability",
  RECLAIM_EXECUTION:"reclaim_execution",
  START_NAVIGATION:"start_navigation",
  REQUEST_CURRENT_LOCATION:"request_current_location",
  SHARE_CURRENT_LOCATION:"share_current_location",
  RESOLVE_TRAFFIC:"resolve_traffic",
  RESOLVE_WAITING:"resolve_waiting",
  CANCEL_MISSION:"cancel_mission",
  DELETE_MISSION:"delete_mission",
  EDIT_DRIVER:"edit_driver",
  EDIT_CUSTOMER:"edit_customer",
  DELETE_CUSTOMER:"delete_customer",
  EDIT_DRIVER_OPERATIONAL_PROFILE:"edit_driver_operational_profile",
  TOGGLE_DRIVER_STATUS:"toggle_driver_status",
  REMOVE_DRIVER:"remove_driver",
  REQUEST_TRUST:"request_trust",
  ACCEPT_TRUST:"accept_trust",
  REJECT_TRUST:"reject_trust",
  SUSPEND_TRUST:"suspend_trust",
  ADD_CUSTOMER_LOCATION:"add_customer_location",
  ARCHIVE_CUSTOMER:"archive_customer",
  REPOST_FORYOU:"repost_foryou",
  RESTART_NETWORK:"restart_network",
  WITHDRAW_FORYOU:"withdraw_foryou",
  WITHDRAW_NETWORK:"withdraw_network",
  REACTIVATE_MISSION:"reactivate_mission",
  START_CUSTODY_RECOVERY:"start_custody_recovery",
  ABORT_CUSTODY_TRANSFER:"abort_custody_transfer",
  START_CUSTODY_RESOLUTION:"start_custody_resolution",
  CONFIRM_CUSTODY_RELEASE:"confirm_custody_release",
  FINALIZE_CUSTODY_TRANSFER:"finalize_custody_transfer",
  ACCEPT_CUSTODY:"accept_custody",
  REASSIGN_CUSTODY_RECEIVER:"reassign_custody_receiver",
  REVIEW_COMPLETION_BLOCKER:"review_completion_blocker"
});

const A=ACTION_CODES;

const ACTION_REGISTRY_RAW=({
  [A.OPEN_MISSION]:def("Open Mission","navigation",{roles:["admin","driver","executor"],safeByDefault:true}),
  [A.CHECK_ASSIGNMENT]:def("Check Assignment","navigation",{roles:["admin"],safeByDefault:true}),
  [A.EDIT_MISSION]:def("Edit Mission","mission_data",{roles:["admin"],requiresMission:true}),
  [A.EDIT_MISSION_DATA]:def("Complete Mission Data","mission_data",{roles:["admin"],requiresMission:true}),
  [A.REVIEW_NETWORK]:def("Review Network Mission","network",{roles:["admin","executor"],safeByDefault:true}),
  [A.REVIEW_FORYOU]:def("Review ForYou Request","foryou",{roles:["admin","executor"],safeByDefault:true}),
  [A.SHARE_FORYOU]:def("Create Private ForYou Access","foryou",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.SHARE_NETWORK]:def("Share with Trusted Partner","network",{roles:["admin"],requiresMission:true}),
  [A.ASSIGN_DRIVER]:def("Assign Executor","assignment",{roles:["admin"],requiresMission:true}),
  [A.CHANGE_DRIVER]:def("Change Driver","assignment",{roles:["admin"],requiresMission:true}),
  [A.ACCEPT_NETWORK]:def("Accept","network",{roles:["admin","executor"],requiresInvitation:true}),
  [A.REQUEST_FORYOU_MISSION]:def("Request Mission","foryou",{roles:["admin","executor"],requiresMission:true}),
  [A.CANCEL_FORYOU_REQUEST]:def("Cancel Request","foryou",{roles:["admin","executor"],requiresRequest:true,confirmation:true}),
  [A.REJECT_NETWORK]:def("Reject","network",{roles:["admin","executor"],requiresInvitation:true,confirmation:true}),
  [A.APPROVE_FORYOU_REQUEST]:def("Approve ForYou Request","foryou",{roles:["admin"],requiresRequest:true,confirmation:true}),
  [A.DECLINE_FORYOU_REQUEST]:def("Decline ForYou Request","foryou",{roles:["admin"],requiresRequest:true,confirmation:true}),
  [A.ADVANCE_EXECUTION]:def("Continue Execution","mission_flow",{roles:["driver","executor"],requiresMission:true,safeByDefault:false}),
  [A.CONFIRM_ARRIVAL]:def("Confirm Arrival","mission_flow",{roles:["driver","executor"],requiredStatus:"Pending",nextStatus:"Arrived"}),
  [A.CONFIRM_PICKUP]:def("Confirm Pickup","mission_flow",{roles:["driver","executor"],requiredStatus:"Arrived",nextStatus:"PickedUp"}),
  [A.START_TRANSIT]:def("Start Transit","mission_flow",{roles:["driver","executor"],requiredStatus:"PickedUp",nextStatus:"InTransit"}),
  [A.START_OPERATION]:def("Start Operation","mission_flow",{roles:["driver","executor"],requiredStatus:"Pending",nextStatus:"InProgress"}),
  [A.CAPTURE_DELIVERY_PROOF]:def("Capture Delivery Proof","delivery_proof",{roles:["driver","executor"]}),
  [A.CONFIRM_DELIVERY]:def("Confirm Delivery","mission_flow",{roles:["driver","executor"],requiredStatus:"InTransit",nextStatus:"Delivered"}),
  [A.COMPLETE_MISSION]:def("Complete Mission","mission_flow",{roles:["driver","executor","admin"],requiredStatus:"Delivered",nextStatus:"Completed",confirmation:true}),
  [A.COMPLETE_OPERATION]:def("Complete Operation","mission_flow",{roles:["driver","executor","admin"],requiredStatus:"InProgress",nextStatus:"Completed",confirmation:true}),
  [A.REPORT_EXCEPTION]:def("Report","exception",{roles:["driver","executor"],requiresMission:true}),
  [A.RESOLVE_EXCEPTION]:def("Resolve","exception",{roles:["admin","driver","executor"],requiresOpenException:true,confirmation:true}),
  [A.NAVIGATE]:def("Navigate","navigation",{roles:["driver","executor"],requiresMission:true,safeByDefault:true}),
  [A.MESSAGE]:def("Message","communication",{roles:["admin","driver","executor"],requiresMission:true,safeByDefault:true}),
  [A.MESSAGE_EXECUTOR]:def("Message Executor","communication",{roles:["admin"],requiresPerson:true,safeByDefault:true}),
  [A.REVIEW_AVAILABILITY]:def("Review Availability","availability",{roles:["executor"],safeByDefault:true}),
  [A.RECLAIM_EXECUTION]:def("Take Back Execution","responsibility",{roles:["admin"],requiresMission:true,confirmation:true,safeByDefault:false}),
  [A.START_NAVIGATION]:def("Start Navigation","management",{roles:["driver","executor"],requiresMission:true,safeByDefault:true}),
  [A.REQUEST_CURRENT_LOCATION]:def("Request Current Location","management",{roles:["admin"],requiresMission:true,safeByDefault:true}),
  [A.SHARE_CURRENT_LOCATION]:def("Share Current Location","management",{roles:["driver","executor"],requiresMission:true,safeByDefault:true}),
  [A.RESOLVE_TRAFFIC]:def("Traffic Solved","management",{roles:["driver","executor"],requiresMission:true}),
  [A.RESOLVE_WAITING]:def("Waiting Is Over","management",{roles:["driver","executor"],requiresMission:true}),
  [A.CANCEL_MISSION]:def("Cancel Mission","management",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.DELETE_MISSION]:def("Delete Mission","management",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.EDIT_DRIVER]:def("Edit Driver","people",{roles:["admin"],requiresPerson:true}),
  [A.EDIT_CUSTOMER]:def("Edit Customer","customer_data",{roles:["admin"],requiresCustomer:true}),
  [A.DELETE_CUSTOMER]:def("Delete Customer","customer_data",{roles:["admin"],requiresCustomer:true,confirmation:true}),
  [A.EDIT_DRIVER_OPERATIONAL_PROFILE]:def("Edit Driver Operational Profile","people",{roles:["admin"],requiresPerson:true}),
  [A.TOGGLE_DRIVER_STATUS]:def("Change Driver Status","people",{roles:["admin"],requiresPerson:true,confirmation:true}),
  [A.REMOVE_DRIVER]:def("Remove Executor","people",{roles:["admin"],requiresPerson:true,confirmation:true}),
  [A.REQUEST_TRUST]:def("Request Trust","network",{roles:["admin"],requiresPartner:true}),
  [A.ACCEPT_TRUST]:def("Accept Trust","network",{roles:["admin"],requiresRelationship:true,confirmation:true}),
  [A.REJECT_TRUST]:def("Decline Trust","network",{roles:["admin"],requiresRelationship:true,confirmation:true}),
  [A.SUSPEND_TRUST]:def("Suspend Trust","network",{roles:["admin"],requiresRelationship:true,confirmation:true}),
  [A.ADD_CUSTOMER_LOCATION]:def("Add Customer Location","customer_data",{roles:["admin"],requiresCustomer:true}),
  [A.ARCHIVE_CUSTOMER]:def("Archive Customer","customer_data",{roles:["admin"],requiresCustomer:true,confirmation:true}),
  [A.REPOST_FORYOU]:def("Create Private ForYou Access","management",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.RESTART_NETWORK]:def("Share Through Network Again","management",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.WITHDRAW_FORYOU]:def("Remove from ForYou","management",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.WITHDRAW_NETWORK]:def("Cancel Network Share","management",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.REACTIVATE_MISSION]:def("Reactivate Mission","management",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.START_CUSTODY_RECOVERY]:def("Recover Custody", "custody",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.ABORT_CUSTODY_TRANSFER]:def("Abort Custody Transfer", "custody",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.START_CUSTODY_RESOLUTION]:def("Resolve Custody","custody",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.CONFIRM_CUSTODY_RELEASE]:def("Confirm Custody Release","custody",{roles:["driver","executor"],requiresMission:true,confirmation:true}),
  [A.FINALIZE_CUSTODY_TRANSFER]:def("Finalize Custody Transfer","custody",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.ACCEPT_CUSTODY]:def("Accept Custody","custody",{roles:["driver","executor"],requiresMission:true,confirmation:true}),
  [A.REASSIGN_CUSTODY_RECEIVER]:def("Change Receiving Driver","custody",{roles:["admin"],requiresMission:true,confirmation:true}),
  [A.REVIEW_COMPLETION_BLOCKER]:def("Resolve Completion Blocker","completion",{roles:["admin","driver","executor"],requiresMission:true,safeByDefault:true})
});

const QUALITY_DEFAULTS={
  security:"server_authoritative",
  isolation:"tenant_scoped",
  truth:"canonical_state_and_event",
  concurrency:"state_token_required_for_mutation",
  idempotency:"secured_service_defined",
  audit:"critical_transition_event",
  liveness:"must_leave_valid_next_step_or_waiting_condition",
  failure:"typed_safe_failure",
  execution:"secured_service_or_authorized_ui_intent"
};

const HIGH_CONSEQUENCE=new Set([
  A.TOGGLE_DRIVER_STATUS,A.REMOVE_DRIVER,A.EDIT_CUSTOMER,A.DELETE_CUSTOMER,A.ACCEPT_TRUST,A.REJECT_TRUST,A.SUSPEND_TRUST,A.ARCHIVE_CUSTOMER,
  A.ASSIGN_DRIVER,A.CHANGE_DRIVER,A.RECLAIM_EXECUTION,A.CANCEL_MISSION,A.DELETE_MISSION,A.REACTIVATE_MISSION,A.WITHDRAW_FORYOU,A.WITHDRAW_NETWORK,
  A.START_CUSTODY_RECOVERY,A.ABORT_CUSTODY_TRANSFER,A.START_CUSTODY_RESOLUTION,A.CONFIRM_CUSTODY_RELEASE,
  A.FINALIZE_CUSTODY_TRANSFER,A.ACCEPT_CUSTODY,A.REASSIGN_CUSTODY_RECEIVER,A.COMPLETE_MISSION,
  A.APPROVE_FORYOU_REQUEST,A.DECLINE_FORYOU_REQUEST,A.ACCEPT_NETWORK,A.REJECT_NETWORK
]);
const READ_ONLY=new Set([A.OPEN_MISSION,A.CHECK_ASSIGNMENT,A.REVIEW_NETWORK,A.REVIEW_FORYOU,A.REVIEW_AVAILABILITY,A.NAVIGATE,A.MESSAGE,A.REVIEW_COMPLETION_BLOCKER]);
const EVIDENCE_REQUIRED=new Set([A.CONFIRM_DELIVERY,A.COMPLETE_MISSION]);
const STATE_TRANSITIONS=new Map([
  [A.CONFIRM_ARRIVAL,{from:["Pending"],to:"Arrived"}],
  [A.CONFIRM_PICKUP,{from:["Arrived"],to:"PickedUp"}],
  [A.START_TRANSIT,{from:["PickedUp"],to:"InTransit"}],
  [A.CONFIRM_DELIVERY,{from:["InTransit"],to:"Delivered"}],
  [A.COMPLETE_MISSION,{from:["Delivered"],to:"Completed"}]
]);

export const ACTION_REGISTRY=Object.freeze(Object.fromEntries(Object.entries(ACTION_REGISTRY_RAW).map(([code,definition])=>{
  const transition=STATE_TRANSITIONS.get(code)||null;
  const executionClass=READ_ONLY.has(code)?"READ_ONLY":(HIGH_CONSEQUENCE.has(code)?"HIGH_CONSEQUENCE":"MUTATION");
  return [code,Object.freeze({
    ...definition,
    id:code,
    quality:Object.freeze({
      ...QUALITY_DEFAULTS,
      executionClass,
      evidence: EVIDENCE_REQUIRED.has(code)?"required_or_verified":"not_required",
      stateTransition:transition?Object.freeze(transition):null
    })
  })];
})));

export const ACTION_COMPATIBILITY_ALIASES=Object.freeze({
  accept_foryou:"approve_foryou_request",
  decline_foryou:"decline_foryou_request"
});

export function normalizeActionCode(code){
  const raw=String(code||"");
  return ACTION_REGISTRY[raw]?raw:(ACTION_COMPATIBILITY_ALIASES[raw]||raw);
}
export function actionDefinition(code){return ACTION_REGISTRY[normalizeActionCode(code)]||null;}
export function allActionDefinitions(){return Object.entries(ACTION_REGISTRY).map(([code,definition])=>({code,...definition}));}
function def(label,domain,extra={}){
  return Object.freeze({
    id:String(extra.id||""),
    lifecycle:"ACTIVE",
    canonical:true,
    label,domain,confirmation:false,safeByDefault:false,
    surfaces:["mission_context"],
    ...extra
  });
}
