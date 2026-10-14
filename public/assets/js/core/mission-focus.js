import {MISSION_STATUS_FLOW,isTerminalStatus,canonicalMissionStatus,canLifecycleTransition} from "./lifecycle-registry.js";
import {formatMissionAddress} from "./mission-presentation.js";
export const MISSION_FOCUS_VERSION="2.0";
const EXECUTION_ROLES=new Set(["driver","executor"]);
const ACTIVE_CUSTODY={has:isCustodyStatus};

export function chooseFocusMission(missions=[],selectedMissionId=0,{role="",surfaces={}}={}){
  const active=(missions||[]).filter(m=>!TERMINAL.has(String(m.status||"")));
  if(!active.length)return null;
  const selected=active.find(m=>Number(m.id)===Number(selectedMissionId||0));
  const selectedRank=selected?focusPriority(selected,surfaces):null;
  const strongest=active.slice().sort((a,b)=>compareFocus(a,b,surfaces))[0]||null;

  // User selection is respected unless a stronger physical-custody truth exists.
  if(selected){
    if(EXECUTION_ROLES.has(String(role||""))&&strongest&&ACTIVE_CUSTODY.has(String(strongest.status||""))&&!ACTIVE_CUSTODY.has(String(selected.status||"")))return strongest;
    return selected;
  }
  return strongest;
}

export function buildMissionFocus({missions=[],selectedMissionId=0,role="",surfaces={}}={}){
  const mission=chooseFocusMission(missions,selectedMissionId,{role,surfaces});
  if(!mission)return Object.freeze({available:false});
  const surface=surfaceFor(surfaces,mission.id);
  const actorExecution=EXECUTION_ROLES.has(String(role||""));
  const route=focusRoute(mission);
  const primary=surface?.primary||fallbackFocusPrimary(mission,role);
  const liveness=classifyFocusLiveness(mission,surface,primary);
  return Object.freeze({
    available:true,mission,missionId:Number(mission.id),role:String(role||""),actorExecution,
    route:Object.freeze(route),primary:primary?Object.freeze({...primary}):null,
    waiting:surface?.waiting||null,surface,liveness:Object.freeze(liveness),
    progress:missionProgress(mission)
  });
}

export function focusPriority(m,surfaces={}){
  const status=canonicalMissionStatus(m?.status),surface=surfaceFor(surfaces,m?.id);
  const primary=surface?.primary||null;
  const waiting=surface?.waiting||null;
  const blocker=Boolean(surface?.blocker||surface?.readiness?.blocked||surface?.health?.blocked||["report_exception","resolve_exception","resolve_blocker","recover_completion"].includes(String(primary?.code||"")));
  const urgent=deadlineMinutes(m)<=30;
  let band=70;
  if(status==="InTransit")band=0;
  else if(status==="PickedUp")band=5;
  else if(blocker)band=10;
  else if(status==="Arrived")band=20;
  else if(urgent)band=30;
  else if(status==="Pending")band=40;
  else if(status==="Delivered")band=50;
  else if(waiting)band=60;
  return {band,deadline:deadlineTime(m),schedule:time(m?.pickup_at_utc||m?.deadline_at_utc||m?.updated_at)};
}

export function classifyFocusLiveness(m,surface={},primary=null){
  if(TERMINAL.has(String(m?.status||"")))return {state:"TERMINAL",label:"Closed"};
  if(surface?.waiting)return {state:"WAITING",label:surface.waiting.waitingFor||"Waiting"};
  if(surface?.blocker||surface?.readiness?.blocked||surface?.health?.blocked)return {state:"BLOCKED",label:surface?.readiness?.reason||"Needs resolution"};
  if(["recover_completion","resolve_blocker","resolve_exception","reclaim_execution"].includes(String(primary?.code||"")))return {state:"RECOVERY",label:"Recovery required"};
  return {state:"ACTIONABLE",label:primary?.reason||"Ready"};
}

export function focusRoute(m){
  const status=canonicalMissionStatus(m?.status);
  if(isPreCustodyStatus(status))return {stage:"PICKUP",title:status==="Pending"?"Complete pickup":"Pickup location reached",company:m.pickup_company||"Pickup",address:formatMissionAddress(m,"pickup"),navLabel:"GO TO PICKUP"};
  if(isCustodyStatus(status))return {stage:"DELIVERY",title:status==="PickedUp"?"Begin delivery":"Complete delivery",company:m.delivery_company||"Delivery",address:formatMissionAddress(m,"delivery"),navLabel:"GO TO DELIVERY"};
  if(status==="Delivered")return {stage:"DELIVERED",title:"Delivery confirmed",company:m.delivery_company||"Delivery",address:formatMissionAddress(m,"delivery"),navLabel:"GO TO DELIVERY"};
  return {stage:"MISSION",title:"Mission execution",company:m?.pickup_company||m?.delivery_company||"Mission",address:formatMissionAddress(m, isPreCustodyStatus(status)?"pickup":"delivery"),navLabel:"NAVIGATE"};
}

export function fallbackFocusPrimary(m,role){
  if(!EXECUTION_ROLES.has(String(role||"")))return null;
  return ({Pending:{code:"confirm_arrival",label:"ARRIVED"},Arrived:{code:"confirm_pickup",label:"PICKED UP"},PickedUp:{code:"start_transit",label:"START TRANSIT"},InTransit:{code:"confirm_delivery",label:"DELIVERED"},Delivered:{code:"complete_mission",label:"COMPLETE"}})[String(m?.status||"")]||null;
}
export function missionProgress(m){return ({Pending:12,Arrived:30,PickedUp:52,InTransit:76,Delivered:92,Completed:100})[String(m?.status||"")]||0;}
export function focusSelectionIsPure(previousMission={},nextMission={}){return Object.freeze({changesMissionTruth:false,changesResponsibility:false,changesCustody:false,changesLifecycle:false,previousMissionId:Number(previousMission?.id||0)||null,nextMissionId:Number(nextMission?.id||0)||null});}

function compareFocus(a,b,surfaces){const x=focusPriority(a,surfaces),y=focusPriority(b,surfaces);return x.band-y.band||x.deadline-y.deadline||x.schedule-y.schedule||Number(a.id)-Number(b.id);}
function surfaceFor(surfaces,id){return surfaces?.[Number(id)]||surfaces?.[String(Number(id))]||null;}
function deadlineTime(m){return time(m?.deadline_at_utc||m?.delivery_at_utc||m?.pickup_at_utc);}
function deadlineMinutes(m){const t=deadlineTime(m);return Number.isFinite(t)?Math.floor((t-Date.now())/60000):Infinity;}
function time(v){const t=Date.parse(v||"");return Number.isFinite(t)?t:Number.MAX_SAFE_INTEGER;}
