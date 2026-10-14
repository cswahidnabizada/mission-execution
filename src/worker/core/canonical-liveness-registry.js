/** ON Mission 10.30.42 — Canonical Liveness Registry.
 * One read-only liveness contract for mission continuation.
 * It owns liveness vocabulary and assessment semantics; it never authorizes
 * or mutates mission state.
 */
import {isLifecycleTerminal,canonicalMissionStatus,isExecutionActiveStatus} from "../domains/logistics/logistics-lifecycle.contract.js";

export const CANONICAL_LIVENESS_VERSION="1.1";
export const MISSION_LIVENESS_STATES=Object.freeze(["ACTIONABLE","WAITING","ESCALATED","BREACH","TERMINAL"]);
export const MISSION_LIVENESS_TERMINAL_STATES=Object.freeze(["TERMINAL"]);
export const MISSION_LIVENESS_NON_TERMINAL_STATES=Object.freeze(["ACTIONABLE","WAITING","ESCALATED","BREACH"]);

const META=Object.freeze({
  ACTIONABLE:Object.freeze({terminal:false,requiresActor:false,requiresEscalation:false}),
  WAITING:Object.freeze({terminal:false,requiresActor:true,requiresEscalation:false}),
  ESCALATED:Object.freeze({terminal:false,requiresActor:false,requiresEscalation:true}),
  BREACH:Object.freeze({terminal:false,requiresActor:false,requiresEscalation:true}),
  TERMINAL:Object.freeze({terminal:true,requiresActor:false,requiresEscalation:false})
});

export const CANONICAL_LIVENESS_REGISTRY=Object.freeze(Object.fromEntries(
  MISSION_LIVENESS_STATES.map(state=>[state,Object.freeze({state,...META[state]})])
));

export function canonicalLivenessState(value){
  const raw=String(value||"").trim().toUpperCase();
  return MISSION_LIVENESS_STATES.includes(raw)?raw:null;
}
export function livenessDefinition(value){return CANONICAL_LIVENESS_REGISTRY[canonicalLivenessState(value)]||null;}
export function isCanonicalLivenessState(value){return Boolean(livenessDefinition(value));}
export function isLivenessTerminal(value){return canonicalLivenessState(value)==="TERMINAL";}
export function isLivenessBreach(value){return ["ESCALATED","BREACH"].includes(canonicalLivenessState(value));}
export function isLivenessWaiting(value){return canonicalLivenessState(value)==="WAITING";}
export function isLivenessActionable(value){return canonicalLivenessState(value)==="ACTIONABLE";}

export function assessCanonicalMissionLiveness({mission,flow=null,management=null,unified=null,recovery=null}={}){
  const status=canonicalMissionStatus(mission?.status||flow?.status||"Pending");
  const terminal=isLifecycleTerminal(status)||Boolean(flow?.terminal);
  const viewer=flow?.viewer||{};
  const ownership=flow?.ownership||{};
  if(terminal)return live("TERMINAL","terminal",null,null,false);

  if(recovery?.required)return live("ESCALATED","transition_recovery_required",null,recovery?.actor||null,true);

  if(unified?.primary)return live("ACTIONABLE","primary_action",unified.primary.code,unified.primary.actor||null,false);
  if(unified?.waiting){
    const stale=staleManagementWait(management);
    if(stale)return live("ESCALATED","stalled_requirement","review_mission_recovery",stale.actor||null,true);
    return live("WAITING",String(unified.waiting.reasonCode||"known_wait"),unified.waiting.action?.code||null,unified.waiting.actor||null,false);
  }

  const managementActions=(management?.actions||[]).filter(Boolean);
  const realManagementAction=managementActions.find(a=>!['review_completion_blocker'].includes(String(a.code||"")));
  if(realManagementAction)return live("ACTIONABLE","management_action",realManagementAction.code,null,false);

  if(viewer.isOwner&&ownership.kind==="OWNER_UNASSIGNED"&&["Pending","Arrived"].includes(status))
    return live("ACTIONABLE","owner_execution_selection","choose_execution_path",null,false);

  if(viewer.isOwner&&ownership.actor&&isExecutionActiveStatus(status))
    return live("WAITING","execution_actor_progress",null,ownership.actor,false);

  if(status==="Delivered"&&management?.completion&&!management.completion.allowed){
    const blocker=management.completion.blockers?.[0]||null;
    return live("ESCALATED",String(blocker?.code||"completion_blocked"),"review_mission_recovery",null,true);
  }

  if(flow?.next?.action&&!flow?.next?.viewerCanExecute)
    return live("WAITING",String(flow.next.reasonCode||"other_actor_action"),flow.next.action.code||null,flow.next.actor||null,false);
  if(flow?.next?.waitingFor){
    const stale=staleManagementWait(management);
    if(stale)return live("ESCALATED","stalled_requirement","review_mission_recovery",stale.actor||flow.next.actor||null,true);
    return live("WAITING",String(flow.next.reasonCode||"known_wait"),flow.next.action?.code||null,flow.next.actor||null,false);
  }
  return live("BREACH","no_valid_continuation",null,null,true);
}

export function validateCanonicalMissionLiveness(liveness){
  const problems=[];
  const state=canonicalLivenessState(liveness?.state);
  if(!state)problems.push("mission_liveness_missing_or_invalid");
  if(state!=="TERMINAL"&&!liveness?.missionId)problems.push("mission_id_missing");
  if(state==="WAITING"&&!liveness?.responsibleActor)problems.push("waiting_without_responsible_actor");
  if(["ESCALATED","BREACH"].includes(state)&&liveness?.requiresEscalation!==true)problems.push("escalation_state_without_escalation_requirement");
  if(liveness?.safety?.createsTruth!==false||liveness?.safety?.createsAuthorization!==false||liveness?.safety?.executesAction!==false)problems.push("liveness_mutation_boundary_violation");
  return [...new Set(problems)];
}

function live(state,reasonCode,nextActionCode,responsibleActor,requiresEscalation){
  return Object.freeze({version:CANONICAL_LIVENESS_VERSION,state,reasonCode,nextActionCode:nextActionCode||null,responsibleActor:responsibleActor?Object.freeze({...responsibleActor}):null,requiresEscalation:Boolean(requiresEscalation),safety:Object.freeze({createsTruth:false,createsAuthorization:false,executesAction:false})});
}
function staleManagementWait(management){
  const now=Date.now(),threshold=30*60*1000;
  for(const r of management?.requirements||[]){
    if(String(r.state||"")!=="WAITING"||!r.createdAt)continue;
    const at=Date.parse(r.createdAt);
    if(Number.isFinite(at)&&now-at>=threshold)return r;
  }
  return null;
}
