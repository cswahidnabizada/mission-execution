import {api,jsonOptions} from "./api.js";
import {hasCanonicalAction,normalizeActionId} from "./action-registry.js";
import {withMutationLock} from "../extensions/runtime-resilience.js";

/**
 * Canonical action client.
 * The authoritative mutation request uses `jsonOptions(target.method||"POST"` semantics
 * at the final application/domain boundary; browser code does not call target URLs directly.
 * The browser supplies WHAT + contextual identity; the server owns the complete
 * application pipeline and delegates final authority to the secured domain service.
 */
export async function resolveCanonicalActionTarget(code,context={}){
  const normalized=normalizeActionId(code);
  if(!hasCanonicalAction(normalized))throw new Error(`Action ${normalized} is not registered in the canonical Action Registry.`);
  const d=await api("/api/actions/resolve-target",jsonOptions("POST",{actionCode:normalized,...normalizeContext(context)}));
  if(!d?.action?.target)throw new Error(`Action ${normalized} has no executable target for this context.`);
  return d.action;
}

export async function executeCanonicalObjectAction(code,context={},options={}){
  const normalized=normalizeActionId(code);
  const targetKey=[normalized,context.missionId,context.personId||context.driverId||context.executorId,context.customerId,context.partnerId||context.relationshipId,context.networkInvitationId,context.forYouRequestId].filter(v=>v!==undefined&&v!==null).join(":");
  return withMutationLock(`canonical-action:${targetKey}`,async()=>{
    const expectedUpdatedAt=String(options.expectedUpdatedAt||context.expectedUpdatedAt||"");
    const idempotencyKey=options.idempotencyKey||crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
    const d=await api("/api/actions/execute",jsonOptions("POST",{
      actionCode:normalized,
      ...normalizeContext(context),
      stateToken:expectedUpdatedAt||undefined,
      actionPayload:context.payload&&typeof context.payload==="object"?context.payload:{}
    },{expectedUpdatedAt:expectedUpdatedAt||null,idempotencyKey}));
    if(d?.success===false)throw new Error(d?.error||"Canonical action failed.");
    return {action:d?.preparation?.target?{code:normalized,target:d.preparation.target}:null,target:d?.preparation?.target||null,refresh:d?.preparation?.target?.refresh||"none",execution:d?.execution||null};
  });
}

function normalizeContext(context){
  const allowed=["missionId","personId","driverId","executorId","customerId","partnerId","relationshipId","trustId","networkInvitationId","forYouRequestId","openExceptionId","requirementId","expectedUpdatedAt"];
  const out={};
  for(const key of allowed)if(context[key]!==undefined)out[key]=context[key];
  return out;
}

/** Read-only canonical decision/preparation helpers. These never execute mutations. */
export async function decideCanonicalAction(code,context={},options={}){
  const normalized=normalizeActionId(code);
  if(!hasCanonicalAction(normalized))throw new Error(`Action ${normalized} is not registered in the canonical Action Registry.`);
  return api("/api/actions/decision",jsonOptions("POST",{actionCode:normalized,...normalizeContext(context),actionPayload:context.payload&&typeof context.payload==="object"?context.payload:{}}));
}

export async function getCanonicalActionDecisions(missionId,context={},options={}){
  return api("/api/actions/decisions",jsonOptions("POST",{missionId:Number(missionId)||null,...normalizeContext(context),limit:options.limit||12}));
}

export async function getCanonicalActionOrchestration(missionId){
  return api(`/api/actions/orchestration/${Number(missionId)||0}`);
}

export async function getCanonicalOperationalJourney(missionId){
  return api(`/api/actions/journeys/${Number(missionId)||0}`);
}
