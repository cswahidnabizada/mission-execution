export const ACTION_EXPERIENCE_VERSION="8.9.8";

const CATALOG=Object.freeze({
  assign_driver:{label:"Assign",icon:"👤",tone:"primary",confirm:"none",hint:"Choose who will execute this mission."},
  change_driver:{label:"Change Driver",icon:"⇄",tone:"primary",confirm:"none",hint:"Choose another eligible driver."},
  review_network:{label:"Trusted Network",icon:"🤝",tone:"primary",confirm:"none",hint:"Choose a trusted partner."},
  review_foryou:{label:"ForYou",icon:"🌐",tone:"primary",confirm:"none",hint:"Open the public execution channel."},
  share_foryou:{label:"Publish",icon:"🌐",tone:"primary",confirm:"context",hint:"Publish this mission to ForYou."},
  share_network:{label:"Send",icon:"🤝",tone:"primary",confirm:"none",hint:"Choose a trusted partner."},
  accept_network_mission:{label:"Accept",icon:"✓",tone:"primary",confirm:"context",hint:"Accept this Trusted Network mission."},
  confirm_arrival:{label:"Arrived",icon:"📍",tone:"primary",confirm:"context",hint:"Confirm arrival at the mission location."},
  confirm_pickup:{label:"Picked Up",icon:"📦",tone:"primary",confirm:"context",hint:"Confirm physical pickup and custody."},
  start_transit:{label:"Start",icon:"→",tone:"primary",confirm:"none",hint:"Continue toward delivery."},
  confirm_delivery:{label:"Delivered",icon:"🖼️",tone:"primary",confirm:"context",hint:"Secure delivery proof and confirm delivery."},
  complete_mission:{label:"100% ✓",icon:"✓",tone:"complete",confirm:"context",hint:"Close the mission after all completion requirements are satisfied."},
  navigate:{label:"Navigate",icon:"🧭",tone:"quiet",confirm:"none",hint:"Open this location in maps."},
  report_exception:{label:"Report",icon:"⚠️",tone:"quiet",confirm:"none",hint:"Report a mission exception."},
  message:{label:"Message",icon:"💬",tone:"quiet",confirm:"none",hint:"Message this mission."},
  reclaim_execution:{label:"Take Back",icon:"↩️",tone:"warning",confirm:"strong",hint:"Return execution responsibility to the owner when lifecycle and custody permit it."},
  start_custody_resolution:{label:"Transfer Custody",icon:"⇄",tone:"warning",confirm:"none",hint:"Choose the next physical receiver through the secured handoff."},
  start_custody_recovery:{label:"Custodian Unreachable",icon:"⚠️",tone:"danger",confirm:"strong",hint:"Recover the mission without inventing a handover."},
  confirm_custody_release:{label:"Ready to Hand Over",icon:"📤",tone:"warning",confirm:"context",hint:"You remain responsible until the receiver accepts custody."},
  finalize_custody_transfer:{label:"Continue Handoff",icon:"⇄",tone:"warning",confirm:"context",hint:"Prepare the selected receiver. Current responsibility remains unchanged until acceptance."},
  accept_custody:{label:"Accept Custody",icon:"📥",tone:"warning",confirm:"strong",hint:"Accept only after the freight is physically in your possession."},
  reassign_custody_receiver:{label:"Change Receiving Driver",icon:"⇄",tone:"warning",confirm:"strong",hint:"The current holder remains responsible while the receiving tenant selects another driver."},
  abort_custody_transfer:{label:"Keep Current Executor",icon:"↩️",tone:"quiet",confirm:"strong",hint:"Cancel the incomplete handoff and retain current responsibility."},
  cancel_mission:{label:"Cancel Mission",icon:"✕",tone:"danger",confirm:"strong",hint:"Terminally cancel this mission with a reason."},
  delete_mission:{label:"Delete Mission",icon:"⌫",tone:"danger",confirm:"strong",hint:"Permanently delete this mission and its operational records."},
  reactivate_mission:{label:"Reactivate",icon:"↻",tone:"warning",confirm:"strong",hint:"Return this mission to active Pending operations."},
  capture_delivery_proof:{label:"Add Photo",icon:"📷",tone:"primary",confirm:"none",hint:"Capture the required delivery proof."},
  resolve_exception:{label:"Resolve",icon:"✓",tone:"primary",confirm:"context",hint:"Confirm that the reported exception is resolved."},
  request_current_location:{label:"Request Location",icon:"📍",tone:"quiet",confirm:"none",hint:"Ask the active executor for current location."},
  resolve_traffic:{label:"Traffic Solved",icon:"✓",tone:"primary",confirm:"context",hint:"Confirm the traffic condition is resolved."},
  resolve_waiting:{label:"Waiting Is Over",icon:"✓",tone:"primary",confirm:"context",hint:"Confirm the waiting condition is resolved."},
  start_navigation:{label:"Start Navigation",icon:"🧭",tone:"primary",confirm:"none",hint:"Start navigation for this mission."},
  check_assignment:{label:"Check Assignment",icon:"👤",tone:"primary",confirm:"none",hint:"Review the current execution responsibility."},
  repost_foryou:{label:"Publish Again",icon:"🌐",tone:"primary",confirm:"context",hint:"Publish this mission to ForYou again."},
  restart_network:{label:"Share Again",icon:"🤝",tone:"primary",confirm:"none",hint:"Send this mission through Trusted Network again."},
  withdraw_foryou:{label:"Remove from ForYou",icon:"×",tone:"quiet",confirm:"strong",hint:"Remove this mission from ForYou."},
  withdraw_network:{label:"Cancel Network Share",icon:"×",tone:"quiet",confirm:"strong",hint:"Cancel the current Trusted Network share."},
  share_current_location:{label:"Share Location",icon:"📍",tone:"quiet",confirm:"none",hint:"Share the current device location."},
  approve_foryou:{label:"Approve",icon:"✓",tone:"primary",confirm:"context",hint:"Approve this ForYou request."},
  approve_foryou_request:{label:"Approve Request",icon:"✓",tone:"primary",confirm:"context",hint:"Approve this ForYou requester."},
  decline_foryou_request:{label:"Reject Request",icon:"×",tone:"danger",confirm:"context",hint:"Reject this ForYou requester."}
});

export function actionExperience(action,{mission=null}={}){
  if(!action)return null;
  const code=String(action.code||"");
  const d=CATALOG[code]||{};
  const label=String(d.label||action.label||code||"Action");
  return Object.freeze({
    ...action,
    label,
    experience:Object.freeze({
      version:ACTION_EXPERIENCE_VERSION,
      label,
      icon:String(d.icon||"▶"),
      tone:String(d.tone||"primary"),
      confirm:String(d.confirm||((action.confirmation)?"context":"none")),
      hint:String(d.hint||action.reason||"Continue the mission."),
      confirmationText:confirmationText(code,mission,label)
    })
  });
}

export function actionExperienceList(actions,{mission=null}={}){
  return Object.freeze((actions||[]).filter(Boolean).map(a=>actionExperience(a,{mission})));
}

function confirmationText(code,mission,label){
  const ref=mission?.reference||"this mission";
  return ({
    confirm_arrival:`Confirm arrival for ${ref}?`,
    confirm_pickup:`Confirm pickup and physical custody for ${ref}?`,
    confirm_delivery:`Confirm delivery for ${ref}? Delivery proof will still be required.`,
    complete_mission:`Complete ${ref}? This closes the active mission lifecycle.`,
    reclaim_execution:`Take execution responsibility for ${ref} back? Custody and lifecycle rules still apply.`,
    start_custody_recovery:`Start custody recovery for ${ref}? Use this only when the current custodian cannot respond.`,
    confirm_custody_release:`Ready to hand over ${ref}? You remain responsible until the receiving driver or executor accepts custody.`,
    finalize_custody_transfer:`Continue the handoff for ${ref}? Current responsibility remains unchanged until final custody acceptance.`,
    accept_custody:`Accept custody of ${ref}? Confirm only after the freight is physically in your possession. You become responsible after the secured switch succeeds.`,
    reassign_custody_receiver:`Change the receiving driver for ${ref}? The current custody holder remains responsible until the new receiver accepts.`,
    abort_custody_transfer:`Cancel this handoff for ${ref} and keep the current executor responsible?`,
    cancel_mission:`Cancel ${ref}? This is a terminal cancellation.`,
    delete_mission:`Delete ${ref}? This permanently removes the mission.`,
    reactivate_mission:`Reactivate ${ref} and return it to Pending operations?`,
    withdraw_foryou:`Remove ${ref} from ForYou? The mission will remain available for direct execution.`,
    withdraw_network:`Cancel the Trusted Network share for ${ref}?`,
    approve_foryou:`Approve this ForYou request for ${ref}?`,
    approve_foryou_request:`Approve this requester for ${ref}?`,
    decline_foryou_request:`Reject this requester for ${ref}?`
  })[code]||`${label} for ${ref}?`;
}
