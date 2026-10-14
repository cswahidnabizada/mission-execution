import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
import {MISSION_LIVENESS_STATES} from "../../core/canonical-liveness-registry.js";
/* ON Mission 10.30.18 — Universal Operational Flow & Context Integrity.
 * Read-only convergence contract. It defines the canonical operational handoff
 * from context/truth through readiness, decision, action target and reassessment.
 * It never grants authorization and never executes or mutates state.
 */
import {resolveActionTarget} from "../../application/actions/action-service-map.js";
import {actionDefinition} from "../../application/actions/action-registry.js";

export const CANONICAL_OPERATIONAL_FLOW_VERSION="1.0";
const FLOW_STATES=new Set([...MISSION_LIVENESS_STATES,"OBSERVE"]);

export function buildCanonicalOperationalFlow({mission=null,context={},truth=null,liveness=null,readiness=null,decision=null,action=null,responsibility=null,operatorIntent=null}={}){
  const missionId=id(mission?.id||context?.missionId);
  const status=String(truth?.lifecycle?.status||mission?.status||context?.status||"");
  const stateToken=token(mission);
  const actionCode=String(action?.code||readiness?.next?.code||operatorIntent?.action?.code||"").trim();
  const actionDefinitionValue=actionDefinition(actionCode);
  const targetContext={missionId,role:String(context?.role||""),networkInvitationId:id(action?.networkInvitationId||action?.target?.networkInvitationId||context?.networkInvitationId),forYouRequestId:id(action?.forYouRequestId||action?.target?.forYouRequestId||context?.forYouRequestId),openExceptionId:id(action?.openExceptionId||action?.target?.openExceptionId||context?.openExceptionId),requirementId:id(action?.requirementId||action?.target?.requirementId||context?.requirementId)};
  const target=actionCode?resolveActionTarget(actionCode,targetContext):null;
  const waiting=Boolean(liveness?.state==="WAITING"||readiness?.waiting?.isActive||context?.waiting);
  const livenessState=String(liveness?.state||"").toUpperCase();
  const state=isLifecycleTerminal(status)||status.toLowerCase()==="closed"?"TERMINAL":FLOW_STATES.has(livenessState)?livenessState:waiting?"WAITING":actionCode?"ACTIONABLE":"OBSERVE";
  const executable=Boolean(actionCode&&actionDefinitionValue&&target&&readiness?.execution?.state!=="BLOCKED"&&readiness?.execution?.state!=="STALE");
  const result=Object.freeze({
    version:CANONICAL_OPERATIONAL_FLOW_VERSION,
    advisory:true,
    authoritative:false,
    missionId,
    state,
    context:Object.freeze({missionId,role:String(context?.role||""),stateToken,networkInvitationId:targetContext.networkInvitationId,forYouRequestId:targetContext.forYouRequestId,openExceptionId:targetContext.openExceptionId,requirementId:targetContext.requirementId}),
    truth:Object.freeze({status,valid:truth?Object.values(truth?.invariant||{}).every(Boolean):true,stateToken}),
    responsibility:Object.freeze({actor:responsibility?.responsible||responsibility?.actor||context?.responsible||null}),
    liveness:Object.freeze({state:livenessState||state,reason:String(liveness?.reason||liveness?.explanation||""),waiting}),
    readiness:Object.freeze({state:String(readiness?.readiness?.state||readiness?.state||"UNKNOWN"),executionState:String(readiness?.execution?.state||"NOT_ESTABLISHED"),ready:Boolean(readiness?.ready||readiness?.execution?.state==="EXECUTABLE")}),
    decision:Object.freeze({state:String(decision?.state||operatorIntent?.state||"OBSERVE"),code:String(decision?.code||actionCode||""),label:String(decision?.label||action?.label||actionCode||"")}),
    action:Object.freeze({code:actionCode||null,registered:Boolean(actionDefinitionValue),target:target||null,executable,requiresConfirmation:Boolean(actionDefinitionValue?.confirmation)}),
    reassessment:Object.freeze({required:Boolean(actionCode&&!target?.refresh?.includes("none")),refresh:String(target?.refresh||"context"),afterExecution:true}),
    safety:Object.freeze({createsTruth:false,createsAuthorization:false,changesCustody:false,changesResponsibility:false,executesAction:false})
  });
  return result;
}

export function validateCanonicalOperationalFlow(flow){
  const p=[];
  if(flow?.advisory!==true||flow?.authoritative!==false)p.push("authority_boundary_violation");
  if(!FLOW_STATES.has(String(flow?.state||"")))p.push("invalid_flow_state");
  if(flow?.action?.executable&&(!flow.action.code||!flow.action.target))p.push("executable_action_without_target");
  if(flow?.action?.code&&!flow?.action?.registered)p.push("unregistered_action");
  if(flow?.safety?.createsTruth!==false||flow?.safety?.createsAuthorization!==false||flow?.safety?.executesAction!==false)p.push("mutation_boundary_violation");
  if(flow?.reassessment?.afterExecution!==true)p.push("missing_post_execution_reassessment");
  return [...new Set(p)];
}
function id(v){const n=Number(v||0);return Number.isFinite(n)&&n>0?n:null;}
function token(m){const n=Number(m?.state_version||0);return n>0?`v:${n}`:String(m?.updated_at||"")||null;}
