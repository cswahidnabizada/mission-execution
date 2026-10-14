/**
 * V4.29 — Final Operational Capability Convergence
 *
 * Declarative presentation contract only. It does not grant authority or execute
 * mutations. Existing secured services remain authoritative.
 */
import {ACTION_REGISTRY} from "../../application/actions/action-registry.js";
import {ACTION_SERVICE_MAP,resolveActionTarget} from "../../application/actions/action-service-map.js";

export const MISSION_CAPABILITY_TYPES=Object.freeze(["context","action","management","navigation","waiting","information"]);

const WORKBENCH_UI_ACTIONS=new Set([
  "check_assignment","edit_mission_data","assign_driver","change_driver","message",
  "review_network","review_foryou","accept_network","reject_network","approve_foryou_request","decline_foryou_request",
  "report_exception","resolve_exception","start_navigation","request_current_location","share_current_location",
  "resolve_traffic","resolve_waiting","cancel_mission","repost_foryou","restart_network","reactivate_mission",
  "start_custody_resolution","start_custody_recovery","confirm_custody_release","finalize_custody_transfer",
  "accept_custody","reassign_custody_receiver","abort_custody_transfer","review_completion_blocker","review_availability"
]);

export const MISSION_CAPABILITIES=Object.freeze({
  mission:{type:"context",feature:"details",label:"Mission"},
  executor:{type:"context",feature:"executor",label:"Executor"},
  attention:{type:"context",feature:"attention",label:"Attention"},
  custody:{type:"context",feature:"custody",label:"Custody"},
  messages:{type:"context",feature:"message",label:"Messages"},
  history:{type:"information",feature:"history",label:"History"},
  timeline:{type:"information",feature:"timeline",label:"Timeline"},
  documents:{type:"context",feature:"files",label:"Documents"},
  delivery_proof:{type:"action",feature:"files",label:"Delivery Proof"},
  foryou:{type:"action",feature:"foryou",label:"ForYou"},
  network:{type:"action",feature:"network",label:"Trusted Network"},
  create_mission:{type:"management",feature:"create",label:"Create Mission"},
  edit_mission:{type:"management",feature:"edit_mission",label:"Edit Mission"},
  edit_executor:{type:"management",feature:"edit_executor",label:"Edit Executor"},
  delete_mission:{type:"management",feature:"delete_mission",label:"Delete Mission"},
  cancel_mission:{type:"action",feature:"cancel_mission",label:"Cancel Mission"}
});

export function buildCapabilityAudit(){
  const registryCodes=new Set(Object.keys(ACTION_REGISTRY).map(String));
  const mapCodes=new Set(Object.keys(ACTION_SERVICE_MAP).map(String));
  const registryWithoutMap=[...registryCodes].filter(c=>!mapCodes.has(c));
  const mapWithoutRegistry=[...mapCodes].filter(c=>!registryCodes.has(c));
  return Object.freeze({
    version:"1.0",
    capabilityTypes:MISSION_CAPABILITY_TYPES,
    capabilities:Object.freeze(Object.entries(MISSION_CAPABILITIES).map(([code,v])=>({code,...v}))),
    actionRegistryCount:registryCodes.size,
    serviceMapCount:mapCodes.size,
    registryWithoutServiceRoute:Object.freeze(registryWithoutMap),
    serviceRouteWithoutRegistry:Object.freeze(mapWithoutRegistry),
    complete:registryWithoutMap.length===0 && mapWithoutRegistry.length===0
  });
}

export function normalizeOperationalActions(actions=[]){
  const seen=new Set();
  return Object.freeze((Array.isArray(actions)?actions:[]).filter(Boolean).map(a=>{
    const code=String(a.code||"");
    if(!code||seen.has(code))return null;
    seen.add(code);
    const registry=ACTION_REGISTRY[code]||{};
    const route=ACTION_SERVICE_MAP[code]||null;
    const target=a.target||null;
    const resolvedTarget=target||resolveActionTarget(code,{
      missionId:a.missionId,
      openExceptionId:a.openExceptionId,
      networkInvitationId:a.networkInvitationId,
      forYouRequestId:a.forYouRequestId,
      role:a.role||"admin"
    });
    const registered=Boolean(ACTION_REGISTRY[code]);
    const routed=Boolean(route);
    const routeExecutable=route?.kind==="api"||route?.kind==="mission_status";
    const uiExecutable=route?.kind==="ui" && WORKBENCH_UI_ACTIONS.has(code);
    const executable=Boolean(registered && routed && resolvedTarget && (routeExecutable || uiExecutable));
    return Object.freeze({
      ...a,
      code,
      domain:String(a.domain||registry.domain||route?.domain||"mission"),
      type:registry.domain==="navigation"||route?.kind==="navigate"?"navigation":"action",
      executable,
      registered,
      routed,
      executionState:executable?"ROUTED":"UNROUTED",
      executionReady:executable,
      target:resolvedTarget,
      confirmation:Boolean(a.confirmation||registry.confirmation),
      requiredStatus:a.requiredStatus||registry.requiredStatus||null,
      nextStatus:a.nextStatus||registry.nextStatus||route?.nextStatus||null
    });
  }).filter(Boolean));
}
