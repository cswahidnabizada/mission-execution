import {actionExperience,actionExperienceList} from "../action-experience/action-experience.contract.js";
import {resolveActionTarget} from "../../application/actions/action-service-map.js";
export const UNIFIED_ACTION_CONTRACT_VERSION="1.0";

export function buildUnifiedActionContract({mission,actions=null,management=null}={}){
  const flow=management?.flow||null;
  const managementActions=management?.actions||[];
  const requiredManagement=managementActions.find(a=>a.domain==="requirement")||null;
  const reactivate=managementActions.find(a=>a.code==="reactivate_mission")||
    (management?.reactivation?.allowed?{
      code:"reactivate_mission",label:"Reactivate Mission",domain:"lifecycle",confirmation:true
    }:null);
  const custodyAction=managementActions.find(a=>["start_custody_resolution","start_custody_recovery","finalize_custody_transfer","reassign_custody_receiver","abort_custody_transfer"].includes(a.code))||null;
  const completionAction=managementActions.find(a=>a.code==="complete_mission")||null;
  const completionBlocked=Boolean(management?.completion&&!management.completion.allowed);
  const custodyCase=management?.custody?.currentCase||null;

  let primary=null,source="none";
  if(reactivate){primary=normalizeManagement(reactivate,mission);source="management";}
  else if(requiredManagement){primary=normalizeManagement(requiredManagement,mission);source="management";}
  else if(custodyAction){primary=normalizeManagement(custodyAction,mission);source="management";}
  else if(custodyCase){primary=null;source="management";}
  else if(completionAction){primary=normalizeManagement(completionAction,mission);source="management";}
  else if(completionBlocked&&isCompletionResolver(actions?.primary)){primary=normalizeIntelligence(actions.primary);source="actions_intelligence";}
  else if(completionBlocked){primary=null;source="management";}
  else if(actions?.primary){primary=normalizeIntelligence(actions.primary);source="actions_intelligence";}
  else if(flow?.next?.action&&flow?.next?.viewerCanExecute){
    primary=normalizeFlow(flow.next.action,mission);source="mission_flow";
  }

  const custodyWaiting=!primary&&custodyCase?custodyWaitingState(custodyCase,flow):null;
  const completionWaiting=!primary&&completionBlocked?completionWaitingState(management,flow):null;
  const waiting=custodyWaiting||completionWaiting||(!primary&&(flow?.next?.waitingFor||null)
    ?Object.freeze({
      actor:flow.next.actor||null,
      waitingFor:flow.next.waitingFor,
      action:flow.next.action||null,
      reasonCode:flow.next.reasonCode||null
    }):null);

  // The unified surface keeps one primary decision, while exposing the complete
  // contextually available action inventory as capabilities. Utilities remain the
  // compact subset used by lightweight surfaces; Actions uses the full inventory.
  const utilities=dedupe([
    ...(actions?.all||actions?.utilities||[]).map(normalizeIntelligence),
    ...managementActions.filter(a=>a!==primary&&a.domain!=="requirement").map(a=>normalizeManagement(a,mission))
  ]).filter(a=>!primary||a.code!==primary.code);

  const status=String(mission?.status||flow?.status||"Pending");
  const cancelled=["Cancelled","Canceled"].includes(status);
  const completed=status==="Completed";
  const terminal=Boolean(flow?.terminal||completed||cancelled);
  const terminalReason=completed?"COMPLETED":cancelled?"CANCELLED":null;
  const experiencedPrimary=actionExperience(primary,{mission});
  const experiencedUtilities=actionExperienceList(utilities,{mission});
  const experiencedWaiting=waiting?Object.freeze({
    ...waiting,
    action:waiting.action?actionExperience(waiting.action,{mission}):null
  }):null;

  return Object.freeze({
    version:UNIFIED_ACTION_CONTRACT_VERSION,
    experienceVersion:"8.9.8",
    missionId:Number(mission?.id||flow?.missionId||0)||null,
    status,
    terminalReason,
    stateToken:Number(mission?.state_version||0)>0?`v:${Number(mission.state_version)}`:null,
    terminal,
    source,
    primary:experiencedPrimary,
    waiting:experiencedWaiting,
    utilities:experiencedUtilities,
    managementState:management?.state||null,
    completion:management?.completion||null,
    readiness:flow?.readiness||null,
    ownership:flow?.ownership||null,
    viewer:flow?.viewer||null
  });
}

export function validateUnifiedActionContract(c){
  const problems=[];
  if(!c?.missionId)problems.push("mission_id_missing");
  if(c?.terminal&&c?.primary&&c.primary.code!=="reactivate_mission")problems.push("terminal_action_not_reactivation");
  if(c?.primary&&!c.primary.code)problems.push("primary_code_missing");
  if(c?.waiting&&c?.primary)problems.push("waiting_and_primary_conflict");
  return problems;
}

function normalizeIntelligence(a){
  if(!a)return null;
  return Object.freeze({
    code:String(a.code||""),label:String(a.label||a.code||"Action"),
    reason:String(a.reason||""),domain:String(a.domain||"mission"),
    confirmation:Boolean(a.confirmation),target:a.target||null,
    actor:a.actor||null,question:null,stateToken:a.stateToken||null
  });
}
function normalizeManagement(a,mission){
  if(!a)return null;
  const code=String(a.code||"");
  const forYouRequestId=Number(a.forYouRequestId||a.target?.forYouRequestId||0)||null;
  const networkInvitationId=Number(a.networkInvitationId||a.target?.networkInvitationId||0)||null;
  const openExceptionId=Number(a.openExceptionId||a.target?.openExceptionId||0)||null;
  const requirementId=Number(a.requirementId||a.target?.requirementId||0)||null;
  const target=resolveActionTarget(code,{missionId:Number(mission?.id||0)||null,forYouRequestId,networkInvitationId,openExceptionId,requirementId});
  return Object.freeze({
    code,label:String(a.label||a.code||"Action"),
    reason:String(a.question||managementReason(a.code,mission)),
    domain:String(a.domain||"management"),
    confirmation:Boolean(a.confirmation),target:target||a.target||null,
    actor:a.actor||null,question:a.question||null,
    ...(forYouRequestId?{forYouRequestId}:{}),...(networkInvitationId?{networkInvitationId}:{}),
    ...(openExceptionId?{openExceptionId}:{}),...(requirementId?{requirementId}:{})
  });
}
function normalizeFlow(a,mission){
  if(!a)return null;
  return Object.freeze({
    code:String(a.code||""),label:String(a.label||a.code||"Action"),
    reason:String(a.reason||`Continue ${mission?.reference||"mission"}`),
    domain:"mission_flow",confirmation:false,target:resolveActionTarget(a.code,{missionId:Number(mission?.id||0)||null}),actor:a.actor||null,question:null
  });
}
function managementReason(code,mission){
  const ref=mission?.reference||"mission";
  return ({
    reactivate_mission:`Reactivate ${ref} before assigning or sharing it.`,
    assign_driver:"Choose the execution driver.",
    repost_foryou:"Publish the mission to ForYou.",
    restart_network:"Share the mission through Trusted Network.",
    cancel_mission:"Close the mission safely with a cancellation reason.",
    reclaim_execution:"Return execution responsibility to the owning tenant while lifecycle and custody rules allow it.",
    start_custody_resolution:"Transfer physical custody through the secured handover process before execution changes.",
    start_custody_recovery:"Recover a live mission when the current custodian cannot respond without fabricating a handover.",
    finalize_custody_transfer:"Continue the prepared custody handoff while keeping the current executor responsible until final acceptance.",
    abort_custody_transfer:"Cancel the incomplete handoff and keep the current executor responsible.",
    request_current_location:"Ask the active execution actor to share current location.",
    start_navigation:"Start the mission navigation flow."
  })[String(code||"")]||"Mission management action";
}
function dedupe(items){
  const seen=new Set(),out=[];
  for(const x of items.filter(Boolean)){if(seen.has(x.code))continue;seen.add(x.code);out.push(x);}
  return out;
}

function custodyWaitingState(c,flow){
  if(c.status==="awaiting_release")return Object.freeze({actor:null,waitingFor:"current custody holder",action:{code:"confirm_custody_release",label:"Ready to Hand Over"},reasonCode:"custody_release_required"});
  if(c.status==="ready_to_transfer")return Object.freeze({actor:null,waitingFor:"owning tenant",action:{code:"finalize_custody_transfer",label:"Continue Handoff"},reasonCode:"custody_transfer_ready"});
  if(c.status==="awaiting_acceptance")return Object.freeze({actor:null,waitingFor:c.target_type==="executor"?"receiving executor":"receiving driver",action:{code:"accept_custody",label:"Accept Custody"},reasonCode:"custody_acceptance_required"});
  return Object.freeze({actor:null,waitingFor:"custody resolution",action:null,reasonCode:"custody_resolution_open"});
}

function isCompletionResolver(action){
  return Boolean(action&&[
    "capture_delivery_proof","resolve_exception","share_current_location","resolve_traffic","resolve_waiting",
    "confirm_custody_release","finalize_custody_transfer","accept_custody","abort_custody_transfer","start_custody_recovery"
  ].includes(String(action.code||"")));
}

function completionWaitingState(management,flow){
  const waitingRequirement=(management?.requirements||[]).find(r=>r.state==="WAITING");
  if(waitingRequirement){
    return Object.freeze({
      actor:waitingRequirement.actor||null,
      waitingFor:waitingRequirement.actor?.name||"the responsible participant",
      action:waitingRequirement.actionCode?{code:waitingRequirement.actionCode,label:waitingRequirement.question||"Complete requirement"}:null,
      reasonCode:`completion_requirement:${waitingRequirement.code||"open"}`
    });
  }
  const blocker=management?.completion?.blockers?.[0]||null;
  const executionActor=flow?.ownership?.actor||null;
  if(blocker?.code==="delivery_proof_missing")return Object.freeze({
    actor:executionActor,waitingFor:executionActor?.name||"the execution actor",
    action:{code:"capture_delivery_proof",label:"Capture Delivery Proof"},reasonCode:blocker.code
  });
  return Object.freeze({actor:null,waitingFor:"completion resolution",action:null,reasonCode:blocker?.code||"completion_blocked"});
}
