/* ON Mission 10.30.41 — canonical read-only frontend lifecycle contract. */
export const CANONICAL_LIFECYCLE_VERSION="1.0";
export const MISSION_STATUS_FLOW=Object.freeze(["Pending","Arrived","PickedUp","InTransit","Delivered","Completed"]);
export const MISSION_LIFECYCLE_STATUSES=Object.freeze([...MISSION_STATUS_FLOW,"Cancelled"]);
const EDGES=Object.freeze({Pending:["Arrived","Cancelled"],Arrived:["PickedUp","Pending","Cancelled"],PickedUp:["InTransit"],InTransit:["Delivered"],Delivered:["Completed"],Completed:[],Cancelled:["Pending"]});
const META=Object.freeze({Pending:["PRE_CUSTODY",false,false],Arrived:["PRE_CUSTODY",false,false],PickedUp:["CUSTODY_ACTIVE",false,true],InTransit:["CUSTODY_ACTIVE",false,true],Delivered:["POST_DELIVERY",false,false],Completed:["TERMINAL",true,false],Cancelled:["TERMINAL",true,false]});
export function canonicalMissionStatus(v){const s=String(v||"Pending");return s==="Canceled"?"Cancelled":s;}
export function lifecycleDefinition(v){const s=canonicalMissionStatus(v),m=META[s];return m?Object.freeze({status:s,stage:m[0],terminal:m[1],physicalCustody:m[2],allowedSuccessors:Object.freeze(EDGES[s].slice())}):null;}
export function lifecycleSuccessors(v){return lifecycleDefinition(v)?.allowedSuccessors||Object.freeze([]);}
export function nextLifecycleStatus(v){return lifecycleSuccessors(v)[0]||null;}
export function isTerminalStatus(v){return Boolean(lifecycleDefinition(v)?.terminal);}
export function lifecycleIndex(v){return MISSION_STATUS_FLOW.indexOf(canonicalMissionStatus(v));}
export function canLifecycleTransition(a,b){return lifecycleSuccessors(a).includes(canonicalMissionStatus(b));}
