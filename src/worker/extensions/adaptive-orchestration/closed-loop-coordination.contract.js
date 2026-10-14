import {RELEASE_VERSION} from '../../core/release.js';
import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 10.19.25 — Closed-Loop Operational Coordination.
 * Read-only loop state over canonical mission truth and existing action telemetry.
 * Detect -> Decide -> Act -> Verify -> Reassess. It never authorizes or mutates.
 */
export const CLOSED_LOOP_COORDINATION_VERSION=RELEASE_VERSION;
const text=v=>String(v??"").trim();
const upper=v=>text(v).toUpperCase();
const num=v=>Number(v||0)||0;
const SUCCESS_PHASES=new Set(["succeeded"]);
const FAILURE_PHASES=new Set(["failed","stale","abandoned"]);

export function buildClosedLoopCoordination({mission=null,orchestration=null,telemetry=null,now=Date.now()}={}){
  const status=upper(mission?.status||"UNKNOWN");
  const terminal=isLifecycleTerminal(status);
  const currentToken=num(mission?.state_version)>0?`v:${num(mission.state_version)}`:text(mission?.updated_at);
  const action=orchestration?.next?.action||null;
  const latest=telemetry?.latest||null;
  const detect={state:text(orchestration?.situation?.state||status),level:text(orchestration?.significance?.level||"LOW"),reason:text(orchestration?.significance?.reason||orchestration?.situation?.reason||"Current canonical operational state.")};
  const decide={state:text(orchestration?.next?.state||"OBSERVE"),action:action?Object.freeze({code:text(action.code),label:text(action.label),reason:text(action.reason)}):null};
  const act={available:Boolean(orchestration?.safeAction?.available),code:text(orchestration?.safeAction?.code||action?.code)||null,mode:"EXISTING_SECURED_ACTION",authorization:"EXISTING_SECURED_SERVICE"};
  const verification=buildVerification({latest,currentToken,terminal,now,initialStateToken:telemetry?.initialStateToken||null,missionStatus:status,expectedNextStatus:action?.nextStatus||null});
  const reassess=buildReassessment({mission,orchestration,verification,terminal});
  const state=deriveState({terminal,latest,verification,reassess,decide});
  return Object.freeze({version:CLOSED_LOOP_COORDINATION_VERSION,readOnly:true,authoritative:false,missionId:num(mission?.id)||null,state,currentStateToken:currentToken||null,detect:Object.freeze(detect),decide,act:Object.freeze({...act,execute:false}),verification,reassess,safety:Object.freeze({createsTruth:false,createsAuthorization:false,executesAction:false,changesResponsibility:false,changesCustody:false,persistsLoopState:false})});
}

export function validateClosedLoopCoordination(model){
 const p=[];
 if(!model?.missionId)p.push("mission_id_missing");
 if(model?.readOnly!==true)p.push("loop_not_read_only");
 if(model?.authoritative!==false)p.push("loop_claims_authority");
 if(model?.act?.execute!==false)p.push("loop_execution_enabled");
 if(model?.safety?.createsTruth!==false)p.push("loop_truth_created");
 if(model?.verification?.required&&!model?.currentStateToken)p.push("verification_without_current_state_token");
 if(model?.state==="ACT_NOW"&&!model?.act?.code)p.push("act_now_without_action_code");
 return [...new Set(p)];
}
function buildVerification({latest,currentToken,terminal,now,initialStateToken,missionStatus,expectedNextStatus}){
 if(!latest)return Object.freeze({required:false,state:"NOT_STARTED",outcome:null,actionCode:null,observedAt:null,stateChanged:null,reason:"No prior action execution is awaiting verification."});
 const phase=lower(latest.phase), observedAt=latest.created_at||latest.client_timestamp||null;
 const age=observedAt?Math.max(0,now-Date.parse(observedAt)):null;
 const stale=age!==null&&age>30*60*1000;
 if(SUCCESS_PHASES.has(phase)){ const stateChanged=initialStateToken!=null&&currentToken?String(initialStateToken)!==String(missionTokenFromVersion(currentToken)):null; const targetMatched=expectedNextStatus?upper(missionStatus)===upper(expectedNextStatus):null; const verified=terminal||targetMatched===true||(!expectedNextStatus&&stateChanged!==false); return Object.freeze({required:true,state:verified?(terminal?"VERIFIED_TERMINAL":"SUCCESS_VERIFIED"):"SUCCESS_UNCONFIRMED",outcome:"success",actionCode:text(latest.action_code),observedAt,stateChanged,targetMatched,reason:verified?"Action success was recorded and the refreshed canonical mission truth supports reassessment.":"Action success was recorded, but the expected canonical state was not confirmed; review is required before continuing."}); }
 if(FAILURE_PHASES.has(phase))return Object.freeze({required:true,state:stale?"STALE_FAILURE":"ACTION_FAILED",outcome:phase,actionCode:text(latest.action_code),observedAt,stateChanged:null,reason:"The latest execution did not complete successfully; reassessment is required."});
 return Object.freeze({required:true,state:stale?"STALE_PENDING":"AWAITING_RESULT",outcome:null,actionCode:text(latest.action_code),observedAt,stateChanged:null,reason:"An execution is still awaiting a terminal result or fresh reconciliation."});
}
function buildReassessment({mission,orchestration,verification,terminal}){
 const status=upper(mission?.status||"");
 if(terminal)return Object.freeze({state:"STABLE",reason:"Terminal mission; no further operational mutation is expected.",nextAction:null});
 if(verification.state==="SUCCESS_VERIFIED"){
   const next=orchestration?.next?.action||null;
   return Object.freeze({state:next?"CONTINUE":"OBSERVE",reason:next?"The action completed and the refreshed operational picture exposes the next valid step.":"The action completed; continue observing canonical truth.",nextAction:next?Object.freeze({code:text(next.code),label:text(next.label)}):null});
 }
 if(["ACTION_FAILED","STALE_FAILURE"].includes(verification.state))return Object.freeze({state:"RECOVER",reason:"Reassess through the existing secured recovery/attention capability before retrying.",nextAction:null});
 if(verification.state==="AWAITING_RESULT"||verification.state==="STALE_PENDING")return Object.freeze({state:"VERIFY",reason:"Wait for or reconcile the current execution result before selecting another action.",nextAction:null});
 const next=orchestration?.next?.action||null;
 return Object.freeze({state:next?"CONTINUE":"OBSERVE",reason:next?"Current truth exposes a valid next operational step.":"No further action is currently exposed by authoritative capabilities.",nextAction:next?Object.freeze({code:text(next.code),label:text(next.label)}):null});
}
function deriveState({terminal,latest,verification,reassess,decide}){
 if(terminal)return "STABLE";
 if(latest&&["AWAITING_RESULT","STALE_PENDING"].includes(verification.state))return "VERIFY";
 if(latest&&["ACTION_FAILED","STALE_FAILURE"].includes(verification.state))return "RECOVER";
 if(latest&&verification.state==="SUCCESS_UNCONFIRMED")return "REVIEW";
 if(verification.state==="SUCCESS_VERIFIED")return reassess.state==="CONTINUE"?"REASSESS":"STABLE";
 if(verification.state==="SUCCESS_UNCONFIRMED")return "REVIEW";
 if(decide.state==="ACT_NOW")return "ACT_NOW";
 if(decide.state==="WAIT")return "WAIT";
 if(decide.state==="REVIEW"||decide.state==="BLOCKED")return "REVIEW";
 return "OBSERVE";
}
function lower(v){return text(v).toLowerCase();}
function missionTokenFromVersion(token){return text(token).replace(/^v:/i,"");}
