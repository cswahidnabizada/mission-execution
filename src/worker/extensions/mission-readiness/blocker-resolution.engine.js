import {resolutionPolicy} from "./blocker-resolution.policy.js";
import {actionDefinition} from "../../application/actions/action-registry.js";
import {resolveActionTarget} from "../../application/actions/action-service-map.js";

export function resolveMissionBlocker({blocker,conditions={},featureState={},executionAvailability={},session={}}={}){
  if(!blocker)return null;
  const policy=resolutionPolicy(blocker.code);
  if(!policy)return unresolved(blocker,"resolution_policy_missing");

  const actor=resolveActor(policy.actorStrategy,{conditions,featureState,executionAvailability,session});
  if(!actor)return unresolved(blocker,"resolution_actor_unavailable");

  const def=actionDefinition(policy.actionCode);
  if(!def)return unresolved(blocker,"resolution_action_unregistered");

  const context={
    missionId:Number(conditions.missionId||0)||null,
    openExceptionId:Number(featureState.exceptions?.primaryExceptionId||0)||null,
    networkInvitationId:Number(featureState.network?.id||0)||null,
    forYouRequestId:Number(featureState.foryou?.id||0)||null
  };
  const target=resolveActionTarget(policy.actionCode,context);
  if(!target)return unresolved(blocker,"resolution_target_unavailable");

  const executableByViewer=viewerMatchesActor(session,actor);
  return Object.freeze({
    blocker:Object.freeze({code:blocker.code,domain:blocker.domain,severity:blocker.severity||"attention"}),
    reasonCode:blocker.code,
    reason:policy.reason,
    actor,
    action:Object.freeze({
      code:policy.actionCode,
      label:def.label,
      target,
      confirmation:Boolean(def.confirmation)
    }),
    executableByViewer,
    waitingFor:executableByViewer?null:actor.name,
    resolutionState:executableByViewer?"ACTION_REQUIRED":"WAITING_FOR_ACTOR",
    valid:true
  });
}

function resolveActor(strategy,{conditions,featureState,executionAvailability,session}){
  const r=conditions.responsibility||{},p=conditions.perspective||{};
  if(strategy==="owner_tenant"){
    return actor("tenant",Number(conditions.context?.identity?.ownerCompanyId||conditions.context?.raw?.company_id||0)||null,String(p.ownerName||conditions.context?.identity?.ownerCompanyName||"Owning tenant"));
  }
  if(strategy==="responsible_tenant"){
    const id=Number(r.responsibilityCompanyId||conditions.context?.raw?.company_id||0)||null;
    return actor("tenant",id,String(r.responsibilityCompanyName||p.executionCompany||p.ownerName||"Responsible tenant"));
  }
  if(strategy==="assigned_executor"){
    const id=Number(r.executorId||executionAvailability.actorId||0)||null;
    return id?actor("executor",id,String(r.executorName||executionAvailability.actorName||"Independent executor")):null;
  }
  if(strategy==="execution_actor"){
    const type=executionAvailability.actorType;
    const id=Number(executionAvailability.actorId||0)||null;
    return type&&id?actor(type,id,String(executionAvailability.actorName||type)):null;
  }
  return null;
}
function actor(type,id,name){return Object.freeze({type,id,name:String(name||type)});}
function viewerMatchesActor(session,actor){
  if(actor.type==="tenant")return session.role==="admin"&&Number(session.tenantId||0)===Number(actor.id||0);
  if(actor.type==="driver")return session.role==="driver"&&Number(session.driverId||0)===Number(actor.id||0);
  if(actor.type==="executor")return session.role==="executor"&&Number(session.executorId||0)===Number(actor.id||0);
  return false;
}
function unresolved(blocker,reasonCode){
  return Object.freeze({
    blocker:Object.freeze({code:blocker.code,domain:blocker.domain,severity:blocker.severity||"attention"}),
    reasonCode,reason:"The mission is blocked but a safe recovery path could not be resolved.",
    actor:null,action:null,executableByViewer:false,waitingFor:null,resolutionState:"REVIEW_REQUIRED",valid:false
  });
}
