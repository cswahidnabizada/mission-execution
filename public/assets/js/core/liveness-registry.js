/* ON Mission 10.30.42 — canonical frontend liveness vocabulary. */
export const CANONICAL_LIVENESS_VERSION="1.1";
export const MISSION_LIVENESS_STATES=Object.freeze(["ACTIONABLE","WAITING","ESCALATED","BREACH","TERMINAL"]);
export function canonicalLivenessState(value){const s=String(value||"").trim().toUpperCase();return MISSION_LIVENESS_STATES.includes(s)?s:null;}
export function isLivenessWaiting(value){return canonicalLivenessState(value)==="WAITING";}
export function isLivenessBreach(value){return ["ESCALATED","BREACH"].includes(canonicalLivenessState(value));}
export function isLivenessTerminal(value){return canonicalLivenessState(value)==="TERMINAL";}
