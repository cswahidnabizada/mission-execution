import {RELEASE_VERSION} from "/assets/js/core/release.js";
/* ON Mission 10.10.1 — Coordinated Operational Decision Contract
 * Read-only presentation/coordinator contract. It composes existing truth, liveness,
 * authorization/action contracts and request/people context into one operational path.
 * It never creates truth, grants authority, mutates state, or executes services.
 */
export const OPERATIONS_DECISION_COORDINATOR_VERSION=RELEASE_VERSION;

const clean=v=>String(v??"").trim();
const upper=v=>clean(v).toUpperCase();
const terminalStates=new Set(["COMPLETED","COMPLETE","CLOSED","DELIVERED","CANCELLED","CANCELED"]);

export function coordinateOperationalDecision({item=null,context=null,finalProduct=null,coordination=null,truth=null,actionContract=null,request=null,people=null}={}){
  const kind=clean(item?.kind);
  const status=upper(item?.status||item?.requestState||truth?.mission?.status||finalProduct?.status||"");
  const isRequest=["request","foryouRequest","trust"].includes(kind);
  const isPeople=["driver","customer","partner","executor","partnerCandidate","partnerCandidateExecutor"].includes(kind);
  const fp=finalProduct||{};
  const ec=fp.experienceContract||{};
  const ac=actionContract||coordination?.unified||{};
  const current=ac.primary||null;
  const waiting=ac.waiting||coordination?.liveness||null;
  let mode=upper(fp.mode)||"STABLE";
  let title=clean(ec.title);
  let next=clean(ec.nextAction)||clean(current?.label);
  let responsible=clean(ec.actor);
  let why=clean(fp.reasonCode)?.replaceAll("_"," ");
  let summary=clean(ec.summary);
  let actionCode=clean(current?.code);
  let workspace=clean(context?.kind)||kind;
  let gate=clean(ac.state)||null;
  let outcome="Refresh after action";

  if(isRequest){
    const pending=upper(item?.requestState||request?.status||item?.status||"PENDING")==="PENDING";
    const requestType=kind==="foryouRequest"?"FORYOU":kind==="trust"?"TRUST":"SHARED MISSION";
    const incoming=kind==="trust" ? item?.networkApproval===true : true;
    mode=pending?(incoming?"ACT":"WAIT"):"CLOSED";
    title=pending?(requestType==="FORYOU"?"REVIEW FORYOU REQUEST":requestType==="TRUST"?"REVIEW TRUST REQUEST":"REVIEW SHARED MISSION REQUEST"):"REQUEST CLOSED";
    summary=pending?`Review the ${requestType.toLowerCase()} request in the Request Workbench before making a decision.`:"The request is no longer pending; refresh canonical request state before any decision.";
    next=pending?(requestType==="FORYOU"?"Review ForYou Request":requestType==="TRUST"?"Review Trust Request":"Review Shared Mission Request"):"Refresh Request State";
    responsible="Operations";
    why=pending?"pending_request_requires_review":"request_not_pending";
    actionCode=pending?`review_${requestType.toLowerCase().replace(" ","_")}_request`:null;
    workspace="requestHandlings";
    gate=pending?"REQUEST_PENDING":"REQUEST_TERMINAL";
    outcome=pending?"Review the request, complete the action, then continue to the next request.":"The request is closed; refresh it before taking action.";
  } else if(isPeople){
    const personType=kind.includes("driver")?"EXECUTOR":kind.includes("customer")?"CUSTOMER":"PARTNER";
    mode="ACT";
    title=clean(context?.title)||`${personType} WORKSPACE`;
    summary=`Coordinate the ${personType.toLowerCase()} operation from one Workbench context using existing secured services.`;
    next=clean(context?.kindLabel)||"Review Profile";
    responsible="Operations";
    why="people_context_selected";
    actionCode=null;
    workspace=clean(context?.kind)||"people";
    gate="AUTHORIZED_SERVICE_REQUIRED";
    outcome="Complete the action, then continue with the next related operation.";
  } else {
    if(terminalStates.has(status)) mode="CLOSED";
    if(!title) title=mode==="ACT"?"ACT NOW":mode==="WAIT"?"WAIT":mode==="BLOCKED"?"ACTION BLOCKED":mode==="ESCALATE"?"ESCALATE":mode==="WATCH"?"WATCH":"NO ACTION REQUIRED";
    if(!summary) summary=clean(item?.reason)||clean(item?.subtitle)||"Continue with the current operational flow.";
    if(!responsible) responsible=clean(coordination?.execution?.actor?.name||coordination?.flow?.next?.actor?.name);
    if(!responsible) responsible="Current responsible actor";
    if(!why) why=clean(item?.reason)||"current operational information";
  }
  return Object.freeze({version:OPERATIONS_DECISION_COORDINATOR_VERSION,kind,mode,title,summary,next,responsible,why,actionCode,workspace,gate,outcome,
    chain:Object.freeze(["SIGNAL","CONTEXT","DECISION","WORKBENCH","AUTHORIZED EXECUTION","CANONICAL REFRESH","NEXT OPERATION"]),
    safety:Object.freeze({readOnly:true,createsTruth:false,createsAuthorization:false,createsAction:false,executesAction:false,requiresCanonicalRefresh:true,staleSafe:true})
  });
}

export function nextOperationAfterDecision(decision,{actionSucceeded=false,currentStillValid=false}={}){
  if(!decision)return {stage:"IDLE",label:"Select operational work"};
  if(!actionSucceeded)return {stage:"WORKBENCH",label:decision.next||"Review current operation"};
  if(currentStillValid)return {stage:"RECOMPUTE",label:"Refresh current status"};
  return {stage:"NEXT",label:"Find next valid operation"};
}
