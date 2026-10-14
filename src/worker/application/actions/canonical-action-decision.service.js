import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.32.9–10.32.12 — Canonical Action Decision Layer.
 * Read-only decision/preparation orchestration above the Action Application Service.
 * It determines what is READY/BLOCKED/WAITING/STALE/UNAUTHORIZED/UNAVAILABLE/
 * REQUIRES_INPUT without creating a second authority or executing mutations.
 */
import {actionDefinition,allActionDefinitions,normalizeActionCode} from "./action-registry.js";
import {resolveActionTarget} from "./action-service-map.js";
import {prepareCanonicalAction} from "./canonical-action.application.service.js";

export const CANONICAL_ACTION_DECISION_VERSION=RELEASE_VERSION;
export const ACTION_DECISION_STATES=Object.freeze(["READY","BLOCKED","WAITING","STALE","UNAUTHORIZED","UNAVAILABLE","REQUIRES_INPUT"]);

export async function decideCanonicalAction(env,request,session,{missionId=null,body={}}={}){
  const raw=String(body.actionCode||body.code||"").trim();
  const code=normalizeActionCode(raw);
  if(!raw||!actionDefinition(code)) return decision({actionCode:code||raw,state:"UNAVAILABLE",reason:"ACTION_NOT_REGISTERED"});
  const prepared=await prepareCanonicalAction(env,request,session,{missionId,body,consumeOperational:false});
  return decisionFromPreparation(code,prepared);
}

export async function decideCanonicalActions(env,request,session,{missionId=null,body={},limit=12}={}){
  const candidates=canonicalCandidates(env,session,missionId,body).slice(0,Math.max(1,Math.min(20,Number(limit)||12)));
  const results=[];
  for(const code of candidates){
    const candidateBody={...body,actionCode:code,missionId:Number(missionId||body.missionId||0)||null};
    const prepared=await prepareCanonicalAction(env,request,session,{missionId,body:candidateBody,consumeOperational:false});
    results.push(decisionFromPreparation(code,prepared));
  }
  const ranked=results.slice().sort(compareDecisions);
  return Object.freeze({
    version:CANONICAL_ACTION_DECISION_VERSION,
    missionId:Number(missionId||0)||null,
    decisions:Object.freeze(ranked),
    ready:Object.freeze(ranked.filter(x=>x.state==="READY")),
    blocked:Object.freeze(ranked.filter(x=>x.state!=="READY")),
    primary:ranked.find(x=>x.state==="READY")||ranked[0]||null,
    execution:{allowed:false,reason:"decision_layer_is_read_only"},
    authority:{decision:"canonical_action_application",truth:"authoritative_domain_service",authorization:"secured_domain_authorization"}
  });
}

function canonicalCandidates(env,session,missionId,body){
  const requested=String(body.actionCode||body.code||"").trim();
  const definitions=allActionDefinitions();
  const preferred=definitions.filter(d=>d.canonical&&(!d.roles?.length||d.roles.includes(String(session?.role||""))));
  const context={missionId:Number(missionId||body.missionId||0)||null,personId:Number(body.personId||body.driverId||body.executorId||0)||null,customerId:Number(body.customerId||0)||null,partnerId:Number(body.partnerId||0)||null,relationshipId:Number(body.relationshipId||body.trustId||0)||null,networkInvitationId:Number(body.networkInvitationId||0)||null,forYouRequestId:Number(body.forYouRequestId||0)||null,openExceptionId:Number(body.openExceptionId||0)||null,requirementId:Number(body.requirementId||0)||null,role:String(session?.role||""),payload:body.actionPayload||body.payload||{}};
  const executable=preferred.filter(d=>resolveActionTarget(d.code,context));
  const requestedCode=requested?normalizeActionCode(requested):null;
  const ordered=[requestedCode,...executable.map(d=>d.code)].filter(Boolean);
  return [...new Set(ordered)];
}

function decisionFromPreparation(code,prepared){
  const body=prepared?.body||{};
  const prep=body.preparation||null;
  const problems=Array.isArray(body.problems)?body.problems.map(String):[];
  let state="READY",reason="Action is authorized and ready for authoritative execution.";
  if(prepared?.status===409||body.code==="MISSION_CHANGED"||problems.includes("stale_state_token")){state="STALE";reason="Current mission Truth changed; re-read and prepare again before execution.";}
  else if(prepared?.status===401||prepared?.status===403||body.code==="ROLE_NOT_AUTHORIZED"||problems.some(p=>/unauthor|role|responsibility|permission/i.test(p))){state="UNAUTHORIZED";reason=body.error||problems[0]||"Action is not authorized for the current actor/context.";}
  else if(prepared?.status===423||body.code==="ACTIVATION_REQUIRED"||body.code==="OPERATIONAL_ACCESS_REQUIRED"){state="BLOCKED";reason=body.error||"Operational access is not currently available.";}
  else if(!prep?.target){state="UNAVAILABLE";reason="No canonical execution target is currently available.";}
  else if(requiresInput(code, prep)){state="REQUIRES_INPUT";reason="The canonical action requires operator input before it can be executed.";}
  else if(prep?.preconditions&&!prep.preconditions.ready){state=prep.preconditions.waiting?"WAITING":"BLOCKED";reason=prep.preconditions.reasons?.[0]||"A canonical precondition is not satisfied.";}
  else if(problems.length){state="BLOCKED";reason=problems[0];}
  return decision({actionCode:code,state,reason,preparation:prep,problems,status:prepared?.status||null});
}

function decision({actionCode,state,reason,preparation=null,problems=[],status=null}){
  return Object.freeze({version:CANONICAL_ACTION_DECISION_VERSION,actionCode:String(actionCode||""),state:ACTION_DECISION_STATES.includes(state)?state:"UNAVAILABLE",ready:state==="READY",reason:String(reason||""),status,problems:Object.freeze([...new Set(problems.map(String))]),target:preparation?.target||null,stateToken:preparation?.state?.currentToken||null,authorization:preparation?.authorization?Object.freeze({authorized:Boolean(preparation.authorization.authorized),decision:preparation.authorization.decision||null}):null,next:nextFor(state),execution:{permitted:false,requiresCanonicalApplicationService:true}});
}
function nextFor(state){
  if(state==="READY")return {kind:"execute",requiresFreshPreparation:true};
  if(state==="STALE")return {kind:"reprepare",automaticMutationReplay:false};
  if(state==="WAITING")return {kind:"wait_and_reassess"};
  if(state==="REQUIRES_INPUT")return {kind:"collect_input"};
  if(state==="UNAUTHORIZED")return {kind:"resolve_authorization"};
  if(state==="BLOCKED")return {kind:"resolve_blocker"};
  return {kind:"reassess"};
}
function requiresInput(code,prep){
  const p=prep?.action?.payload||prep?.payload||{};
  if(["assign_driver","change_driver"].includes(code)) return !(Number(p.driverId||0)>0);
  if(["share_network","restart_network"].includes(code)) return !(Number(p.recipientId||0)>0);
  if(["message","message_executor","report_exception","cancel_mission"].includes(code)) return !Object.values(p).some(v=>String(v??"").trim());
  return false;
}
function compareDecisions(a,b){return Number(b.ready)-Number(a.ready)||stateRank(a.state)-stateRank(b.state)||String(a.actionCode).localeCompare(String(b.actionCode));}
function stateRank(s){return {READY:0,REQUIRES_INPUT:1,WAITING:2,BLOCKED:3,STALE:4,UNAUTHORIZED:5,UNAVAILABLE:6}[s]??9;}
