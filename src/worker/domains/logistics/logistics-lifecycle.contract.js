/**
 * ON Mission — Logistics sector lifecycle contract.
 * Logistics is a sector implementation of the generic Product/Sector Lifecycle Contract.
 * It is not part of the Canonical Core.
 */
import {normalizeLifecycleCode,definitionTransition,definitionSuccessors,isDefinitionTerminal} from "../../core/lifecycle-contract.js";

export const LOGISTICS_LIFECYCLE_KEY="logistics.default";
export const LOGISTICS_LIFECYCLE_VERSION="1";

const STATES=Object.freeze([
  {stateCode:"PENDING",label:"Pending",stage:"PRE_CUSTODY",terminal:false,custodyActive:false},
  {stateCode:"ARRIVED",label:"Arrived",stage:"PRE_CUSTODY",terminal:false,custodyActive:false},
  {stateCode:"PICKED_UP",label:"Picked Up",stage:"CUSTODY_ACTIVE",terminal:false,custodyActive:true},
  {stateCode:"IN_TRANSIT",label:"In Transit",stage:"CUSTODY_ACTIVE",terminal:false,custodyActive:true},
  {stateCode:"DELIVERED",label:"Delivered",stage:"POST_DELIVERY",terminal:false,custodyActive:false},
  {stateCode:"COMPLETED",label:"Completed",stage:"TERMINAL",terminal:true,custodyActive:false},
  {stateCode:"CANCELLED",label:"Cancelled",stage:"TERMINAL",terminal:true,custodyActive:false}
]);

const EDGES=Object.freeze({
  PENDING:[["ARRIVED","execution","executor_confirms_arrival"],["CANCELLED","lifecycle","owner_cancels_pre_custody"]],
  ARRIVED:[["PICKED_UP","execution","executor_confirms_pickup"],["PENDING","rebase","execution_responsibility_rebased_pre_custody"],["CANCELLED","lifecycle","owner_cancels_pre_custody"]],
  PICKED_UP:[["IN_TRANSIT","execution","custodian_starts_transit"]],
  IN_TRANSIT:[["DELIVERED","execution","executor_confirms_delivery"]],
  DELIVERED:[["COMPLETED","completion","authorized_completion_after_gate"]],
  COMPLETED:[],
  CANCELLED:[["PENDING","reactivation","owner_reactivates_cancelled_mission"]]
});

export const LOGISTICS_LIFECYCLE_DEFINITION=Object.freeze({
  lifecycleKey:LOGISTICS_LIFECYCLE_KEY,
  version:LOGISTICS_LIFECYCLE_VERSION,
  states:STATES,
  terminalStates:Object.freeze(["COMPLETED","CANCELLED"]),
  transitions:Object.freeze(Object.entries(EDGES).flatMap(([from,edges])=>edges.map(([to,kind,reasonCode],i)=>Object.freeze({
    fromStateCode:from,toStateCode:to,transitionCode:`${from}_TO_${to}`,actionCode:kind,reasonCode,sequenceNo:i
  }))))
});

export const MISSION_STATUS_FLOW=Object.freeze(["Pending","Arrived","PickedUp","InTransit","Delivered","Completed"]);
export const MISSION_TERMINAL_STATUSES=Object.freeze(["Completed","Cancelled"]);
export const MISSION_PRE_CUSTODY_STATUSES=Object.freeze(["Pending","Arrived"]);
export const MISSION_CUSTODY_STATUSES=Object.freeze(["PickedUp","InTransit"]);
export const CANONICAL_LIFECYCLE_STATUSES=Object.freeze(["Pending","Arrived","PickedUp","InTransit","Delivered","Completed","Cancelled"]);

export function canonicalMissionStatus(value){
  const raw=String(value||"Pending").trim();
  const key=raw.toLowerCase().replace(/[_ -]/g,"");
  return {pending:"Pending",arrived:"Arrived",pickedup:"PickedUp",intransit:"InTransit",delivered:"Delivered",completed:"Completed",cancelled:"Cancelled",canceled:"Cancelled"}[key]||raw;
}
function code(status){return normalizeLifecycleCode(canonicalMissionStatus(status));}
function state(status){return STATES.find(s=>s.stateCode===code(status))||null;}
export function lifecycleDefinition(status){return state(status)?Object.freeze({status:canonicalMissionStatus(status),...state(status),allowedSuccessors:Object.freeze(definitionSuccessors(LOGISTICS_LIFECYCLE_DEFINITION,code(status))),edges:Object.freeze(LOGISTICS_LIFECYCLE_DEFINITION.transitions.filter(t=>t.fromStateCode===code(status)))}):null;}
export function lifecycleEdges(status){return lifecycleDefinition(status)?.edges||Object.freeze([]);}
export function lifecycleSuccessors(status){return lifecycleDefinition(status)?.allowedSuccessors||Object.freeze([]);}
export function lifecycleStage(status){return lifecycleDefinition(status)?.stage||null;}
export function isCanonicalLifecycleStatus(status){return Boolean(lifecycleDefinition(status));}
export function isLifecycleTerminal(status){return isDefinitionTerminal(LOGISTICS_LIFECYCLE_DEFINITION,code(status));}
export function hasPhysicalCustody(status){return state(status)?.custodyActive===true;}
export function isExecutionActiveStatus(status){const s=canonicalMissionStatus(status);return s==="Arrived"||s==="PickedUp"||s==="InTransit";}
export function transitionDefinition(fromStatus,toStatus){return definitionTransition(LOGISTICS_LIFECYCLE_DEFINITION,code(fromStatus),code(toStatus))||null;}
export function canLifecycleTransition(fromStatus,toStatus){return Boolean(transitionDefinition(fromStatus,toStatus));}
export function nextLifecycleStatus(status){const canonical=canonicalMissionStatus(status);if(isLifecycleTerminal(canonical))return null;return lifecycleSuccessors(canonical).map(canonicalMissionStatus)[0]||null;}
export function allLifecycleDefinitions(){return [LOGISTICS_LIFECYCLE_DEFINITION];}
export function isTerminalStatus(status){return isLifecycleTerminal(status);}
export function isPreCustodyStatus(status){return MISSION_PRE_CUSTODY_STATUSES.includes(canonicalMissionStatus(status));}
export function lifecycleProgressPercent(status){
  const canonical=canonicalMissionStatus(status);
  if(canonical==='Cancelled')return null;
  const index=MISSION_STATUS_FLOW.indexOf(canonical);
  if(index<0)return 0;
  return [5,20,38,62,82,100][index]??0;
}

export function operationalNextLabel(status){
  const next=nextLifecycleStatus(status);
  return next?({Arrived:'Arrival',PickedUp:'Pickup',InTransit:'Transit',Delivered:'Delivery',Completed:'Completion'}[next]||next):null;
}

export function isCustodyStatus(status){return MISSION_CUSTODY_STATUSES.includes(canonicalMissionStatus(status));}
