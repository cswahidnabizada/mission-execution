import {canonicalFirst} from '../../core/canonical-db.js';
import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.32.12 — Canonical Action Application Service.
 *
 * Single application-level pipeline for canonical actions:
 * WHAT (Action Registry) -> context/situation -> authorization/policy ->
 * WHERE (Action Service Map) -> authoritative domain route -> canonical result.
 *
 * This layer orchestrates and gates execution; it never replaces domain
 * authorization, lifecycle, custody, tenant isolation, or fenced mutation logic.
 */
import {getForSession} from "../../modules/missions/missions.service.js";
import {resolveMissionAccess} from "../../security/mission-access.js";
import * as fileRepo from "../../repositories/file.repository.js";
import {listMissionExceptions} from "../../modules/attention/attention.service.js";
import {unifiedActionForMission} from "../../extensions/unified-action/unified-action.service.js";
import {serviceDefinition,resolveActionTarget} from "./action-service-map.js";
import {missionManagement} from "../../extensions/mission-management/mission-management.service.js";
import {executionOwnershipSnapshot} from "../../extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {actionDefinition,normalizeActionCode} from "./action-registry.js";
import {buildSecuredActionPreparation,validateSecuredActionPreparation} from "../../extensions/action-execution/secured-action-execution.contract.js";
import {evaluateSecuredActionAuthorization} from "../../extensions/action-execution/secured-action-authorization.contract.js";
import {requireOperationalAction} from "../../security/operational-gate.service.js";
import {resolveUserSituation} from "../../security/user-situation.service.js";
import {resolveMissionByAccessCode} from "../../repositories/mission-access-code.repository.js";
import {buildCanonicalActionResult} from "./canonical-action-result.contract.js";
import {prepareCriticalAudit,completeCriticalAudit} from "../../security/critical-audit.service.js";
import {assertConsentForPurpose} from "../../modules/privacy/consent.service.js";
import {appendOutcomeFromCanonicalExecution} from "../../extensions/agentic-layer/agent-outcome-ledger.service.js";
import {authorizeAgentExecution} from "../../extensions/agentic-layer/agentic-governance.service.js";

export async function prepareCanonicalAction(env,request,session,{missionId=null,body={},consumeOperational=true}={}){
  const rawCode=String(body.actionCode||body.code||"").trim().slice(0,120);
  if(!rawCode)return result(400,{success:false,error:"Action code is required"});
  const normalizedCode=normalizeActionCode(rawCode);
  const definition=actionDefinition(normalizedCode);
  if(!definition)return result(404,{success:false,error:"Action not registered",code:"ACTION_NOT_REGISTERED"});

  const operational=await requireOperationalAction(env,request,session,normalizedCode);
  if(!operational.allowed)return result(423,{success:false,error:"ACTIVATION_REQUIRED",code:"ACTIVATION_REQUIRED",operationalGate:operational.gate,redirect:operational.gate?.items?.[0]?.action?.href||"/app#account?activation=1"});

  const context={
    missionId:Number(missionId||body.missionId||0)||null,
    personId:Number(body.personId||body.driverId||body.executorId||0)||null,
    customerId:Number(body.customerId||0)||null,
    partnerId:Number(body.partnerId||0)||null,
    relationshipId:Number(body.relationshipId||body.trustId||0)||null,
    networkInvitationId:Number(body.networkInvitationId||0)||null,
    forYouRequestId:Number(body.forYouRequestId||0)||null,
    openExceptionId:Number(body.openExceptionId||0)||null,
    requirementId:Number(body.requirementId||0)||null,
    role:String(session.role||""),
    payload:normalizeActionPayload(body.actionPayload||body.payload,normalizedCode)
  };

  const target=resolveActionTarget(normalizedCode,context);
  if(!target)return result(409,{success:false,error:"Action target unavailable",code:"ACTION_TARGET_UNAVAILABLE"});

  const situation=await resolveUserSituation(env,session);
  // Consent is an explicit policy gate, not a new authorization authority.
  // Only purposes whose Admin Control Plane policy requires consent are gated.
  let consentState=null;
  try {
    const purposeForAction = purposeForCanonicalAction(normalizedCode);
    if(purposeForAction) consentState=await assertConsentForPurpose(env,session,purposeForAction);
  } catch(error) {
    if(error?.code==='CONSENT_REQUIRED') return result(error.status||403,{success:false,error:'CONSENT_REQUIRED',code:'CONSENT_REQUIRED',consent:error.consent||null});
    throw error;
  }
  if(!situation?.readyToGo && operational.gate?.decision!=="ALLOW")
    return result(423,{success:false,error:"OPERATIONAL_ACCESS_REQUIRED",code:"OPERATIONAL_ACCESS_REQUIRED",situation});

  if(!context.missionId){
    // Object actions have their final resource authorization inside the
    // authoritative domain service. The application service still enforces the
    // canonical registry, role, operational policy and target map before dispatch.
    const roleAllowed=!Array.isArray(definition.roles)||definition.roles.length===0||definition.roles.includes(String(session.role||""));
    if(!roleAllowed)return result(403,{success:false,error:"Action not available for this role",code:"ROLE_NOT_AUTHORIZED",situation,target});
    return result(200,{success:true,preparation:objectPreparation({normalizedCode,definition,target,situation,operational})});
  }

  let accessResult=await resolveMissionAccess(env,session,context.missionId);
  let mission=accessResult?.mission||null;
  let privateForYouAccess=false;
  if(!mission && normalizedCode==="request_foryou_mission" && context.payload?.accessCode){
    const resolved=await resolveMissionByAccessCode(env,context.payload.accessCode);
    if(resolved && Number(resolved.mission.id)===Number(context.missionId)){
      mission=resolved.mission;
      accessResult={mission,tenantId:Number(mission.company_id),accessKind:"foryou-code-discovery",privateCodeId:resolved.codeId};
      privateForYouAccess=true;
    }
  }
  if(!mission)return result(404,{success:false,error:"Mission not found or access denied"});

  const suppliedToken=String(request.headers.get("x-mission-state-token")||body.stateToken||body.expectedUpdatedAt||"");
  const exceptions=await listMissionExceptions(env,session,context.missionId);
  let candidates=[];
  let management=null;
  if(privateForYouAccess){
    candidates=[{code:normalizedCode,label:definition.label,target:resolveActionTarget(normalizedCode,context)}];
  }else{
    const {surface}=await unifiedActionForMission(env,session,mission,{exceptions});
    management=await missionManagement(env,session,mission,{exceptions});
    const intelligenceCandidates=[surface?.primary,...(surface?.utilities||[])].filter(Boolean);
    const managementCandidates=(management?.actions||[]).map(a=>{
      const t=resolveActionTarget(a.code,{...context,missionId:context.missionId,forYouRequestId:Number(a.forYouRequestId||0)||null,networkInvitationId:Number(a.networkInvitationId||0)||null,openExceptionId:Number(a.openExceptionId||0)||null,requirementId:Number(a.requirementId||0)||null});
      return t?Object.freeze({...a,target:t}):a;
    }).filter(Boolean);
    candidates=[...intelligenceCandidates,...managementCandidates];
  }
  const selected=candidates.find(a=>String(a.code)===rawCode||String(a.code)===normalizedCode)||null;
  let authoritativeForYouRequestId=Number(selected?.forYouRequestId||selected?.target?.forYouRequestId||accessResult?.mission?.foryou_request_id||context.forYouRequestId||0)||null;
  if(normalizedCode==="approve_foryou_request"||normalizedCode==="decline_foryou_request"){
    const resolved=await resolveOwnerForYouRequest(env,session,mission,authoritativeForYouRequestId);
    if(resolved.error)return result(resolved.status||403,{success:false,error:resolved.error,code:resolved.error,problems:[resolved.problem]});
    authoritativeForYouRequestId=resolved.requestId;
  }

  const deliveryProofPresent=Number(mission.delivery_proof_required??1)===0?true:Boolean(await fileRepo.findDeliveryProof(env,Number(accessResult.tenantId),context.missionId));
  const openCustodyCase=Boolean(await canonicalFirst(env,`SELECT id FROM mission_custody_cases WHERE company_id=? AND mission_id=? AND status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance') ORDER BY id DESC LIMIT 1`,[Number(accessResult.tenantId),context.missionId],'mission_custody_authority'));
  const access={...accessResult,deliveryProofPresent,openCustodyCase};
  const ownerSharingAuthority=session.role==="admin"&&Number(session.tenantId)>0&&Number(mission.company_id)>0&&Number(session.tenantId)===Number(mission.company_id)&&["owner","owner-admin"].includes(String(accessResult.accessKind||""));
  const ownershipSnapshot=await executionOwnershipSnapshot(env,Number(accessResult.tenantId),context.missionId);
  let auth=await evaluateSecuredActionAuthorization({env,session,access,actionCode:normalizedCode,mission});
  if(privateForYouAccess&&normalizedCode==="request_foryou_mission"&&session.role!=="driver"&&Number(session.tenantId||0)!==Number(mission.company_id))
    auth=Object.freeze({authorized:true,reasons:Object.freeze([])});
  if(ownerSharingAuthority&&(normalizedCode==="share_network"||normalizedCode==="share_foryou"))auth=Object.freeze({...auth,authorized:true,reasons:Object.freeze((auth.reasons||[]).filter(r=>r!=="responsibility_not_held"))});
  if(selected&&management?.actions?.some(a=>String(a.code)===rawCode)){
    const managementAuthorized=accessResult.accessKind==="owner"&&session.role==="admin";
    if(managementAuthorized)auth=Object.freeze({...auth,authorized:true,reasons:Object.freeze((auth.reasons||[]).filter(r=>r!=="role_not_authorized"&&r!=="responsibility_not_held"))});
  }
  if(normalizedCode==="reclaim_execution"&&(!ownershipSnapshot||ownershipSnapshot.ownerCount!==1||!(ownershipSnapshot.executorId||ownershipSnapshot.sharedTenantId))){
    auth.authorized=false;auth.reasons=[...(auth.reasons||[]),"no_external_execution_owner_to_reclaim"];
  }

  const targetContext={...context,forYouRequestId:authoritativeForYouRequestId};
  const canonicalTarget=resolveActionTarget(normalizedCode,targetContext);
  const canonicalAction=Object.freeze({...(selected||{code:rawCode,label:definition.label}),code:rawCode,target:canonicalTarget||target});
  const preparation=buildSecuredActionPreparation({mission,action:canonicalAction,stateToken:suppliedToken});
  const problems=[...validateSecuredActionPreparation(preparation)];
  if(!auth.authorized)problems.push(...auth.reasons);
  const secured=Object.freeze({...preparation,authorization:{...preparation.authorization,...auth,user:{authorized:Boolean(auth.authorized),decision:auth.authorized?"ALLOW":"DENY",authority:"canonical_action_application_service"},situation:Object.freeze({class:"operational_access",readyToGo:true,decision:operational.gate?.decision||"ALLOW",source:operational.gate?.source||"session_cache",expiresAt:operational.gate?.expiresAt||null}),compliance:situation?.compliance||null,consent:consentState||null},service:{domain:serviceDefinition(normalizedCode)?.domain||null,kind:serviceDefinition(normalizedCode)?.kind||null}});
  const allProblems=Object.freeze([...new Set([...problems,...(auth.reasons||[]),...(preparation.preconditions?.reasons||[])])]);
  const stale=allProblems.includes("stale_state_token");
  const status=auth.authorized&&preparation.preconditions.ready?200:stale?409:403;
  return result(status,{success:status===200,preparation:secured,problems:allProblems,error:status===200?null:stale?"MISSION_CHANGED":allProblems[0]||"ACTION_NOT_READY",code:status===200?null:stale?"MISSION_CHANGED":allProblems[0]||"ACTION_NOT_READY"});
}

export async function executeCanonicalAction(env,request,router,session,options={}){
  const startedAt=Date.now();
  const requestId=String(request.headers.get("X-Request-ID")||"").trim().slice(0,128)||null;
  const prepared=await prepareCanonicalAction(env,request,session,options);
  if(prepared.status!==200||!prepared.body?.success)return prepared;
  const prep=prepared.body.preparation;
  const target=prep?.target;
  if(!target||target.kind==="ui"||target.kind==="navigate")return result(200,{...prepared.body,execution:{executed:false,mode:target?.kind||"none",reason:"presentation_action"}});
  if(!["api","mission_status"].includes(String(target.kind)))return result(409,{success:false,error:"Unsupported canonical execution target",code:"UNSUPPORTED_EXECUTION_TARGET"});

  const headers=new Headers();
  if(requestId)headers.set("X-Request-ID",requestId);
  const cookie=request.headers.get("Cookie");if(cookie)headers.set("Cookie",cookie);
  const origin=request.headers.get("Origin")||new URL(request.url).origin;headers.set("Origin",origin);
  headers.set("Sec-Fetch-Site","same-origin");headers.set("Accept","application/json");
  const stateToken=String(prep.state?.currentToken||"");if(stateToken)headers.set("X-Mission-State-Token",stateToken);
  const suppliedIdempotency=String(request.headers.get("X-Idempotency-Key")||"").trim().slice(0,120);
  const idempotency=suppliedIdempotency||crypto.randomUUID();
  headers.set("X-Idempotency-Key",idempotency);
  let body;
  if(target.body!==undefined){headers.set("Content-Type","application/json");body=JSON.stringify(target.body==null?{}:target.body);}
  const endpoint=String(target.endpoint||"");
  if(!endpoint.startsWith("/")||endpoint.startsWith("//")||/[\r\n]/.test(endpoint))return result(409,{success:false,error:"Invalid canonical execution target",code:"INVALID_EXECUTION_TARGET"});
  const targetRequest=new Request(new URL(endpoint,request.url).toString(),{method:String(target.method||"POST").toUpperCase(),headers,body});
  const agentDecisionId=String(options?.body?.agentDecisionId||request.headers.get("X-ON-Agent-Decision-ID")||"").trim().slice(0,120);
  if(agentDecisionId){
    const agentCompanyId=Number(session?.tenantId||0)||0;
    const agentMissionId=Number(options?.missionId||prep.missionId||0)||0;
    const agentContextHash=String(options?.body?.agentContextHash||request.headers.get("X-ON-Agent-Context-Hash")||"").trim();
    if(!agentContextHash)return result(409,{success:false,error:"AGENT_CONTEXT_HASH_REQUIRED",code:"AGENT_CONTEXT_HASH_REQUIRED"});
    const gate=await authorizeAgentExecution(env,{decisionId:agentDecisionId,companyId:agentCompanyId,missionId:agentMissionId,actionCode:prep.actionCode||prep.action?.code||prep.code});
    if(String(gate.decision.context_hash||"")!==agentContextHash)return result(409,{success:false,error:"AGENT_CONTEXT_HASH_MISMATCH",code:"AGENT_CONTEXT_HASH_MISMATCH"});
  }
  const agentBeforeMission=agentDecisionId&&Number(options?.missionId||prep.missionId||0)>0?await canonicalFirst(env,'SELECT id,status,state_version,updated_at FROM missions WHERE id=? LIMIT 1',[Number(options?.missionId||prep.missionId)],'mission_authority'):null;
  const criticalEventId=await prepareCriticalAudit(env,{session,action:prep.actionCode||prep.action?.code||prep.code,resourceType:target.resourceType||"mission",resourceId:Number(options?.missionId||prep.missionId||0)||null,requestId,metadata:{targetKind:target.kind,endpoint}}).catch(error=>{throw error;});
  let response;
  try{response=await router.fetch(targetRequest,env,request.cf||null);}
  catch(error){await completeCriticalAudit(env,criticalEventId,{success:false,errorCode:error?.code||error?.message||"CANONICAL_ACTION_FAILED"});throw error;}
  const text=await response.text();
  let domainResult=null;try{domainResult=JSON.parse(text);}catch{domainResult={raw:text};}
  const success=response.ok&&domainResult?.success!==false;
  const stale=response.status===409&&["MISSION_CHANGED","stale_state_token","MISSION_STATE_TOKEN_REQUIRED"].includes(String(domainResult?.code||domainResult?.error||""));
  await completeCriticalAudit(env,criticalEventId,{success,errorCode:success?null:(domainResult?.code||domainResult?.error||`HTTP_${response.status}`)});
  const actionResult=buildCanonicalActionResult({actionCode:prep.actionCode||prep.action?.code||prep.code,target,responseStatus:response.status,domainResult,executed:success,requestId,durationMs:Date.now()-startedAt,stale,preparation:{version:prep.version||null}});
  let agentOutcome=null;
  if(agentDecisionId){
    try{
      const agentAfterMission=Number(options?.missionId||prep.missionId||0)>0?await canonicalFirst(env,'SELECT id,status,state_version,updated_at FROM missions WHERE id=? LIMIT 1',[Number(options?.missionId||prep.missionId)],'mission_authority'):null;
      agentOutcome=await appendOutcomeFromCanonicalExecution(env,{request,session,prepared:prep,actionResult,missionId:Number(options?.missionId||prep.missionId||0)||null,decisionId:agentDecisionId,contextHash:String(options?.body?.agentContextHash||request.headers.get("X-ON-Agent-Context-Hash")||"").trim(),beforeMission:agentBeforeMission,afterMission:agentAfterMission,agentMeta:{agentId:options?.body?.agentId||request.headers.get("X-ON-Agent-ID")||"on-mission-agent",intent:options?.body?.agentIntent,plan:options?.body?.agentPlan,contextVersion:options?.body?.agentContextVersion||"1.0",modelProvider:options?.body?.agentModelProvider,modelId:options?.body?.agentModelId,modelVersion:options?.body?.agentModelVersion,recalibrationVersion:options?.body?.agentRecalibrationVersion||"BASELINE"}});
    }catch(error){
      agentOutcome={created:false,recordingFailed:true,decisionId:agentDecisionId,errorCode:error?.code||error?.message||"AGENT_OUTCOME_RECORD_FAILED"};
    }
  }
  return result(response.status,{success,...prepared.body,execution:actionResult,...(agentDecisionId?{agentOutcome}:{})});
}

function objectPreparation({normalizedCode,definition,target,situation,operational}){
  return Object.freeze({version:RELEASE_VERSION,missionId:null,actionCode:normalizedCode,state:{currentToken:null,suppliedToken:null,valid:true},target,authorization:{contextAvailable:true,delegatedToSecuredService:true,serverAuthorizationRequired:true,authority:"canonical_action_application_service",situation},preconditions:{ready:true,reasons:Object.freeze([])},lifecycle:{state:"READY"},service:{domain:definition.domain||null,kind:target.kind||null},operationalGate:operational.gate});
}
function result(status,body){return {status,body};}

export async function resolveOwnerForYouRequest(env,session,mission,candidateRequestId=null){
  if(session?.role!=="admin"||Number(session.tenantId||0)!==Number(mission?.company_id||0))return {error:"FOR_YOU_REQUEST_OWNER_REQUIRED",problem:"owner_authority_required",status:403};
  const candidate=Number(candidateRequestId||0)||0;
  let row=candidate?await canonicalFirst(env,`SELECT id,status,requester_type,requester_company_id,executor_id FROM public_mission_requests WHERE id=? AND company_id=? AND mission_id=? LIMIT 1`,[candidate,Number(mission.company_id),Number(mission.id)],'mission_request_authority'):null;
  if(!row)row=await canonicalFirst(env,`SELECT id,status,requester_type,requester_company_id,executor_id FROM public_mission_requests WHERE company_id=? AND mission_id=? AND status='Pending' ORDER BY id ASC LIMIT 1`,[Number(mission.company_id),Number(mission.id)],'mission_request_authority');
  if(!row)return {error:"FOR_YOU_REQUEST_NOT_FOUND",problem:"for_you_request_not_found",status:403};
  if(String(row.status||"")!=="Pending")return {error:"MISSION_CHANGED",problem:"for_you_request_state_changed",status:409};
  return {requestId:Number(row.id),request:row};
}

function purposeForCanonicalAction(code){
  const c=String(code||'');
  if(['message','message_executor','share_foryou','repost_foryou','share_network','restart_network','request_foryou_mission','accept_network'].includes(c))return 'operational_communications';
  if(['create_mission','edit_mission','edit_mission_data','assign_driver','change_driver','start_custody_resolution','start_custody_recovery','confirm_custody_release','accept_custody','reassign_custody_receiver','cancel_mission','delete_mission'].includes(c))return 'mission_execution';
  return null;
}

export function normalizeActionPayload(value,code){
  const p=value&&typeof value==="object"&&!Array.isArray(value)?value:{};const text=(v,n)=>String(v??"").slice(0,n);const num=v=>v===null||v===undefined||v===""?null:(Number.isFinite(Number(v))?Number(v):null);
  switch(String(code||"")){
    case "assign_driver":case "change_driver":return {driverId:Number(p.driverId||0)||null};
    case "share_foryou":case "repost_foryou":return {publicDescription:text(p.publicDescription,2000)};
    case "share_network":case "restart_network":return {recipientType:text(p.recipientType||"tenant",20),recipientId:Number(p.recipientId||0)||null,message:text(p.message,500)};
    case "edit_mission":case "edit_mission_data":return {...p};
    case "message":case "message_executor":return {message:text(p.message,2000)};
    case "report_exception":return {exceptionType:text(p.exceptionType||"other",80),note:text(p.note,500)};
    case "cancel_mission":return {reasonCode:text(p.reasonCode,64),note:text(p.note,500)};
    case "delete_mission":case "delete_customer":return {confirmation:text(p.confirmation,200)};
    case "accept_network":return {driverId:Number(p.driverId||0)||null};
    case "request_foryou_mission":return {message:text(p.message,1500),driverId:Number(p.driverId||0)||null,accessCode:text(p.accessCode,32)};
    case "edit_customer":return {companyName:text(p.companyName,200),contactName:text(p.contactName,200),email:text(p.email,250),phone:text(p.phone,80),address:text(p.address,500),customerReference:text(p.customerReference,120),notes:text(p.notes,1000)};
    case "start_custody_resolution":case "start_custody_recovery":return {channel:text(p.channel||"driver",24),recovery:Boolean(p.recovery),targetDriverId:Number(p.targetDriverId||0)||null,recipientType:text(p.recipientType,24),recipientId:Number(p.recipientId||0)||null,note:text(p.note,500)};
    case "confirm_custody_release":case "accept_custody":return {requirementId:Number(p.requirementId||0)||null};
    case "reassign_custody_receiver":return {targetDriverId:Number(p.targetDriverId||0)||null};
    default:return {};
  }
}
