import {targetForAction} from "./action-targets.js";
import {buildActionState} from "./action-state.engine.js";
import {sequenceNecessaryAction} from "./action-sequencing.engine.js";
export const ACTION_CONTRACT_VERSION="2.0";
export function buildActionContract(capabilities,context={}){
  const state=buildActionState(capabilities,context);
  const accessKind=String(state.accessKind||context?.conditions?.accessKind||"");
  const ownerRequestAction=(context.managementActions||[]).find(a=>["approve_foryou_request","decline_foryou_request"].includes(String(a?.code||"")))||null;
  const sequence=accessKind==="foryou-discovery"
    ? {state:"action_required",gate:"foryou_request",action:(capabilities?.capabilities||[]).find(a=>a.code==="request_foryou_mission")||null,blockedAfter:[],reasonCode:"foryou_request_required"}
    : accessKind==="pending-foryou"
      ? {state:"waiting",gate:"foryou_owner_decision",action:(capabilities?.capabilities||[]).find(a=>a.code==="cancel_foryou_request")||null,blockedAfter:[],reasonCode:"foryou_request_pending"}
      : ownerRequestAction
        ? {state:"action_required",gate:"foryou_owner_decision",action:ownerRequestAction,blockedAfter:[],reasonCode:"foryou_owner_decision_required"}
        : sequenceNecessaryAction(capabilities,state);
  const sequenceAction=sequence.action;
  const primaryAction=(sequenceAction&&["driver","executor"].includes(String(context?.conditions?.role||context?.role||""))&&context?.featureState?.assignment?.assigned)
    ? {...sequenceAction,code:"advance_execution",label:sequenceAction.label||"Continue",reason:sequenceAction.reason,nextActionCode:sequenceAction.code}
    : sequenceAction;
  const primary=primaryAction?withTarget(primaryAction,context):null;
  const utilityCodes=new Set(["message","navigate","report_exception","open_mission","reclaim_execution"]);
  const intelligenceCapabilities=(capabilities?.capabilities||[]).filter(a=>a?.code).map(a=>withTarget(a,context)).filter(Boolean).map(a=>contractAction(a,context));
  const managementCapabilities=(accessKind==="foryou-discovery"||accessKind==="pending-foryou"||accessKind==="pending-network")?[]:(Array.isArray(context.managementActions)?context.managementActions:[])
    .filter(a=>a?.code)
    .map(a=>withTarget(a,context))
    .filter(Boolean)
    .map(a=>contractAction(a,context));
  const byCode=new Map();
  for(const a of intelligenceCapabilities)byCode.set(a.code,a);
  for(const a of managementCapabilities)if(!byCode.has(a.code))byCode.set(a.code,a);
  const allCapabilities=[...byCode.values()].filter(a=>a.code!==primary?.code);
  const utilities=allCapabilities.filter(a=>utilityCodes.has(a.code));
  const all=primary?[contractAction(primary,context),...allCapabilities]:allCapabilities;
  return Object.freeze({
    version:ACTION_CONTRACT_VERSION,advisory:true,singleAction:true,accessKind,
    missionId:Number(context.missionId||capabilities?.missionId||0)||null,
    viewer:String(capabilities?.viewer||capabilities?.role||""),role:String(capabilities?.role||""),status:String(capabilities?.status||""),
    generatedAt:new Date(context.now||Date.now()).toISOString(),missionUpdatedAt:context.missionUpdatedAt||null,stateToken:context.stateToken||null,
    state:sequence.state,gate:sequence.gate,reasonCode:sequence.reasonCode,
    primary:primary?contractAction(primary,context):null,utilities:Object.freeze(utilities),secondary:Object.freeze([]),
    all:Object.freeze(all)
  });
}
function actionContext(action,context={}){
  return {
    ...context,
    missionId:context.missionId,
    forYouRequestId:Number(action?.forYouRequestId||context.forYouRequestId||action?.target?.forYouRequestId||0)||null,
    networkInvitationId:Number(action?.networkInvitationId||context.networkInvitationId||action?.target?.networkInvitationId||0)||null,
    openExceptionId:Number(action?.openExceptionId||context.openExceptionId||action?.target?.openExceptionId||0)||null,
    requirementId:Number(action?.requirementId||context.requirementId||action?.target?.requirementId||0)||null,
    nextActionCode:String(action?.nextActionCode||context.nextActionCode||"")||null
  };
}
function withTarget(action,context){const target=targetForAction(action,actionContext(action,context));return target?{...action,target,stateToken:context.stateToken||null}:null;}
function contractAction(a,context={}){
  const code=a.code==="edit_mission_data"?"edit_mission":a.code;
  const ids=actionContext(a,context);
  const target=a.target||targetForAction(code,ids);
  return Object.freeze({code,label:a.label||"Edit Mission",reason:a.reason,importance:importanceFor(code),confirmation:Boolean(a.confirmation),target,refresh:target?.refresh||"none",stateToken:a.stateToken||context.stateToken||null,
    ...(ids.forYouRequestId?{forYouRequestId:ids.forYouRequestId}:{}),
    ...(ids.networkInvitationId?{networkInvitationId:ids.networkInvitationId}:{}),
    ...(ids.openExceptionId?{openExceptionId:ids.openExceptionId}:{}),
    ...(ids.requirementId?{requirementId:ids.requirementId}:{}),
    ...(ids.nextActionCode?{nextActionCode:ids.nextActionCode}:{})
  });
}
function importanceFor(code){return ["edit_mission_data","assign_driver","resolve_exception","capture_delivery_proof"].includes(code)?"required":["review_network","review_foryou","check_assignment","confirm_arrival","confirm_pickup","start_transit","start_operation","confirm_delivery","complete_mission","complete_operation","message"].includes(code)?"recommended":"optional";}
