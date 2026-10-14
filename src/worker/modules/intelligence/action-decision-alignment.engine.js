import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.1.4 — Action Decision Alignment
 *
 * Pure/read-only adapter. It explains the relationship between operational
 * intelligence and the already-authoritative current-action decision.
 * It never creates, authorizes, executes, persists, or mutates an action.
 */


export function buildActionDecisionAlignment({
  operationalIntelligence=null,
  compoundOperationalIntelligence=null,
  trajectory=null,
  actionContract=null,
  missionFlow=null,
  executionHandoff=null,
  candidate=null
}={}){
  const status=String(
    candidate?.status||
    actionContract?.status||
    missionFlow?.status||
    candidate?.truth?.status||""
  );

  const terminal=Boolean(
    actionContract?.terminal||
    missionFlow?.terminal||
    isLifecycleTerminal(status)
  );

  const authoritative=resolveActionAuthority({actionContract,missionFlow,executionHandoff,terminal});
  const action=authoritative.action;
  const actor=authoritative.actor;
  const viewerCanExecute=Boolean(authoritative.viewerCanExecute);
  const waitingFor=authoritative.waitingFor||null;
  const reasonCode=authoritative.reasonCode||null;

  const state=resolveAlignmentState({
    terminal,
    action,
    actor,
    viewerCanExecute,
    waitingFor,
    authoritativeState:authoritative.state
  });

  const intelligence=normalizeIntelligence({
    operationalIntelligence,
    compoundOperationalIntelligence,
    trajectory,
    candidate
  });

  const explanation=buildExplanation({
    state,
    action,
    actor,
    viewerCanExecute,
    waitingFor,
    reasonCode,
    intelligence,
    authoritative
  });

  return Object.freeze({
    version:"1.0",
    missionId:Number(candidate?.missionId||actionContract?.missionId||missionFlow?.missionId||0)||null,
    alignment:Object.freeze({
      state,
      currentAction:action,
      actor,
      viewerCanExecute,
      dependency:authoritative.dependency||null,
      waitingFor,
      reasonCode,
      source:authoritative.source
    }),
    explanation:Object.freeze(explanation),
    intelligence:Object.freeze(intelligence),
    authoritative:false,
    readOnly:true
  });
}

function resolveActionAuthority({actionContract,missionFlow,executionHandoff,terminal}){
  if(terminal){
    return {state:"closed",action:null,actor:null,viewerCanExecute:false,waitingFor:null,reasonCode:"mission_terminal",dependency:null,source:"mission_flow"};
  }

  const contractNext=actionContract?.primary||null;
  if(contractNext){
    const flowNext=missionFlow?.next||null;
    return {
      state:normalizeAuthorityState(actionContract?.state||flowNext?.state||""),
      action:normalizeAction(contractNext),
      actor:normalizeActor(flowNext?.actor||executionHandoff?.nextActor||contractNext?.actor||null),
      viewerCanExecute:Boolean(flowNext?.viewerCanExecute??executionHandoff?.canViewerExecute??false),
      waitingFor:flowNext?.waitingFor||executionHandoff?.waitingFor||null,
      reasonCode:actionContract?.reasonCode||flowNext?.reasonCode||executionHandoff?.handoffReason||null,
      dependency:actionContract?.gate||null,
      source:"action_contract"
    };
  }

  const flowNext=missionFlow?.next||null;
  if(flowNext?.action || missionFlow?.state || missionFlow?.readiness?.blockers?.length){
    return {
      state:normalizeAuthorityState(missionFlow?.state||executionHandoff?.state||""),
      action:normalizeAction(flowNext?.action),
      actor:normalizeActor(flowNext?.actor||executionHandoff?.nextActor||null),
      viewerCanExecute:Boolean(flowNext?.viewerCanExecute),
      waitingFor:flowNext?.waitingFor||executionHandoff?.waitingFor||null,
      reasonCode:flowNext?.reasonCode||executionHandoff?.handoffReason||null,
      dependency:missionFlow?.readiness?.blockers?.[0]||null,
      source:"mission_flow"
    };
  }

  if(executionHandoff?.nextAction){
    return {
      state:normalizeAuthorityState(executionHandoff.state||""),
      action:normalizeAction(executionHandoff.nextAction),
      actor:normalizeActor(executionHandoff.nextActor||null),
      viewerCanExecute:Boolean(executionHandoff.canViewerExecute),
      waitingFor:executionHandoff.waitingFor||null,
      reasonCode:executionHandoff.handoffReason||null,
      dependency:null,
      source:"execution_handoff"
    };
  }

  return {state:"clear",action:null,actor:null,viewerCanExecute:false,waitingFor:null,reasonCode:null,dependency:null,source:"none"};
}

function resolveAlignmentState({terminal,action,actor,viewerCanExecute,waitingFor,authoritativeState}){
  if(terminal)return "NONE";
  if(waitingFor&&!viewerCanExecute)return "WAITING";
  if(action&&!actor)return "BLOCKED";
  if(action&&viewerCanExecute)return "READY";
  if(action&&!viewerCanExecute)return "WAITING";
  if(["blocked","BLOCKED"].includes(authoritativeState))return "BLOCKED";
  if(["waiting","WAITING"].includes(authoritativeState))return "WAITING";
  return "NONE";
}

function normalizeAction(action){
  if(!action)return null;
  return Object.freeze({
    code:String(action.code||""),
    label:String(action.label||action.code||""),
    reasonCode:String(action.reasonCode||action.reason||""),
    source:action.source||null
  });
}

function normalizeActor(actor){
  if(!actor)return null;
  return Object.freeze({
    type:String(actor.type||""),
    id:Number(actor.id||0)||null,
    name:String(actor.name||"")
  });
}

function normalizeAuthorityState(state){return String(state||"").toLowerCase();}

function normalizeIntelligence({operationalIntelligence,compoundOperationalIntelligence,trajectory,candidate}){
  const primary=compoundOperationalIntelligence?.primary||compoundOperationalIntelligence||operationalIntelligence?.primary||operationalIntelligence||null;
  const category=String(primary?.category||primary?.riskCategory||operationalIntelligence?.category||"").toUpperCase()||null;
  const impact=primary?.impact||operationalIntelligence?.impact||null;
  const evidence=primary?.evidence||operationalIntelligence?.evidence||[];
  return {
    category,
    trajectory:trajectory?.trajectory||null,
    impact,
    evidence:Array.isArray(evidence)?evidence.slice(0,8):[],
    sourceSignals:[...new Set([
      ...(Array.isArray(primary?.sourceSignals)?primary.sourceSignals:[]),
      ...(Array.isArray(operationalIntelligence?.sourceSignals)?operationalIntelligence.sourceSignals:[])
    ])].slice(0,12),
    status:String(candidate?.status||"")||null
  };
}

function buildExplanation({state,action,actor,viewerCanExecute,waitingFor,reasonCode,intelligence,authoritative}){
  const whyNow=whyNowText(intelligence,state);
  let whyThisAction="";
  if(action){
    whyThisAction=actor
      ? `The current operational flow identifies ${action.label} as the valid current action for ${actor.name||actor.type||"the responsible actor"}.`
      : `The current operational flow identifies ${action.label} as the current action, but its responsible actor is not yet available.`;
  }else if(state==="WAITING"&&waitingFor){
    whyThisAction=`No executable action is exposed because the current flow is waiting for ${waitingFor}.`;
  }else if(state==="BLOCKED"){
    whyThisAction="No executable action is exposed because the current operational dependency is not satisfied.";
  }else if(state==="NONE"){
    whyThisAction="No executable current action is established by the existing action authority.";
  }

  const whyNotOtherActions=authoritative.source==="action_contract"&&authoritative.dependency
    ? `The current action contract remains authoritative; other capabilities are not promoted by intelligence.`
    : null;

  return {
    whyNow,
    whyThisAction,
    whyNotOtherActions,
    waitingFor:waitingFor||null,
    actor:actor?.name||actor?.type||null,
    executableForViewer:viewerCanExecute,
    authoritySource:authoritative.source,
    reasonCode:reasonCode||null
  };
}

function whyNowText(intelligence,state){
  if(state==="NONE")return intelligence.trajectory?`The latest intelligence trajectory is ${String(intelligence.trajectory).toLowerCase()}, but it does not create an executable action.`:"No action-driving intelligence is currently established.";
  if(state==="WAITING")return intelligence.category
    ? `${formatCategory(intelligence.category)} is being observed while the mission remains dependent on the current waiting condition.`
    : "The mission remains in a waiting condition under the existing operational flow.";
  if(state==="BLOCKED")return intelligence.category
    ? `${formatCategory(intelligence.category)} is relevant, but the current action remains blocked by an authoritative dependency.`
    : "The current action remains blocked by an authoritative dependency.";
  if(intelligence.category&&intelligence.trajectory){
    return `${formatCategory(intelligence.category)} is ${String(intelligence.trajectory).toLowerCase()} under the available operational evidence.`;
  }
  if(intelligence.category)return `${formatCategory(intelligence.category)} is currently relevant to the mission.`;
  if(intelligence.trajectory)return `Operational risk is ${String(intelligence.trajectory).toLowerCase()} based on the available evidence.`;
  return "The current action is established by the existing operational flow.";
}

function formatCategory(value){return String(value||"operational risk").toLowerCase().replace(/_risk$/," risk").replace(/_/g," ");}
