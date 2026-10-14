/* ON Mission 10.29.50 — Canonical Action Execution Bridge
 * Read-only presentation bridge. It converges the canonical lifecycle capability
 * with the viewer-scoped Action Contract and existing Action Service Map.
 * It never grants authorization or executes mutation.
 */
import {ACTION_REGISTRY} from "../../application/actions/action-registry.js";
import {resolveActionTarget} from "../../application/actions/action-service-map.js";

export const CANONICAL_ACTION_EXECUTION_BRIDGE_VERSION="1.0";
const STATES=new Set(["EXECUTABLE","NOT_EXPOSED","REQUIRES_VALIDATION","NOT_APPLICABLE","NOT_ESTABLISHED"]);

export function buildCanonicalActionExecutionBridge({mission,flow,session={},canonicalCapability=null,availableActions=[]}={}){
  const next=flow?.next?.action||null;
  const terminal=Boolean(flow?.terminal)||["Completed","Cancelled","Canceled"].includes(String(mission?.status||flow?.status||""));
  if(terminal)return freeze({version:CANONICAL_ACTION_EXECUTION_BRIDGE_VERSION,advisory:true,authoritative:false,missionId:id(mission?.id||flow?.missionId),state:"NOT_APPLICABLE",code:null,label:null,target:null,source:"canonical_capability",reason:"The mission is terminal; no active action may be executed.",stateToken:token(mission),safety:safety()});
  if(!next)return freeze({version:CANONICAL_ACTION_EXECUTION_BRIDGE_VERSION,advisory:true,authoritative:false,missionId:id(mission?.id||flow?.missionId),state:"NOT_ESTABLISHED",code:null,label:null,target:null,source:"canonical_capability",reason:"No canonical lifecycle action is currently established.",stateToken:token(mission),safety:safety()});
  const code=String(next.code||canonicalCapability?.code||"");
  const label=String(next.label||canonicalCapability?.label||code);
  const matching=(Array.isArray(availableActions)?availableActions:[]).find(a=>String(a?.code||"")===code)||null;
  const target=canonicalCapability?.action?.target||matching?.target||resolveActionTarget(code,{missionId:id(mission?.id||flow?.missionId),role:String(session.role||""),stateToken:token(mission),networkInvitationId:id(matching?.networkInvitationId||matching?.target?.networkInvitationId),forYouRequestId:id(matching?.forYouRequestId||matching?.target?.forYouRequestId),openExceptionId:id(matching?.openExceptionId||matching?.target?.openExceptionId),requirementId:id(matching?.requirementId||matching?.target?.requirementId)});
  const registered=Boolean(ACTION_REGISTRY[code]);
  const route=Boolean(target);
  const flowAllows=Boolean(flow?.next?.viewerCanExecute);
  let state="NOT_EXPOSED",reason=`${label} is not currently exposed as an executable action to this viewer.`;
  if(canonicalCapability?.exposureState==="NOT_APPLICABLE")state="NOT_APPLICABLE",reason=canonicalCapability.reason||reason;
  else if(!registered||!route)state="REQUIRES_VALIDATION",reason=`${label} is the canonical next lifecycle action, but its executable route is incomplete and requires validation.`;
  else if(flowAllows&&matching)state="EXECUTABLE",reason=`${label} is exposed through the viewer-scoped Action Contract. The secured service must revalidate authorization, lifecycle, custody, preconditions and state before mutation.`;
  else if(flowAllows&&canonicalCapability?.exposureState==="EXECUTABLE")state="EXECUTABLE",reason=`${label} is exposed by the canonical capability contract. The secured service must revalidate current truth and preconditions before mutation.`;
  return freeze({version:CANONICAL_ACTION_EXECUTION_BRIDGE_VERSION,advisory:true,authoritative:false,missionId:id(mission?.id||flow?.missionId),state,code,label,target:target?freeze({...target}):null,source:"canonical_capability_and_viewer_action_contract",viewerCanExecute:flowAllows,registered,routed:route,availableInViewerActionContract:Boolean(matching),reason,stateToken:token(mission),safety:safety()});
}

export function validateCanonicalActionExecutionBridge(b){
  const p=[];
  if(!b?.missionId)p.push("mission_id_missing");
  if(b?.advisory!==true)p.push("bridge_not_advisory");
  if(b?.authoritative!==false)p.push("bridge_claims_authority");
  if(!STATES.has(String(b?.state||"")))p.push("invalid_bridge_state");
  if(b?.state==="EXECUTABLE"&&(!b?.code||!b?.target))p.push("executable_without_route");
  if(b?.state==="EXECUTABLE"&&b?.viewerCanExecute!==true)p.push("executable_without_viewer_flow_permission");
  if(b?.safety?.createsAuthorization!==false||b?.safety?.executesAction!==false)p.push("bridge_mutation_boundary_violation");
  return [...new Set(p)];
}
function id(v){const n=Number(v||0);return Number.isFinite(n)&&n>0?n:null;}
function token(m){const n=Number(m?.state_version||0);return n>0?`v:${n}`:null;}
function safety(){return Object.freeze({createsTruth:false,createsAuthorization:false,changesCustody:false,changesResponsibility:false,executesAction:false});}
function freeze(x){return Object.freeze(x);}
