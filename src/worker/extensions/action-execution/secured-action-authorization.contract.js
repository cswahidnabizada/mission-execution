import {actionDefinition} from "../../application/actions/action-registry.js";
import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
import {resolveLifecycleForMission} from "../../security/sector-lifecycle.service.js";

export const SECURED_ACTION_AUTHORIZATION_VERSION="1.4.0";
const EXECUTION_ROLES=new Set(["driver","executor"]);

export async function evaluateSecuredActionAuthorization({env=null,session={},access={},actionCode,mission={}}={}){
  const code=String(actionCode||"");
  const def=actionDefinition(code);
  const role=String(session.role||"");
  const kind=String(access.accessKind||"");
  const reasons=[];
  const checks={identity:false,tenant:false,role:false,participation:false,responsibility:false,lifecycle:false,evidence:true,custody:true};
  const directOwnerTenant = role === "admin" && Number(session.tenantId) > 0 && Number(mission.company_id) > 0 && Number(session.tenantId) === Number(mission.company_id);
  const ownerAuthority = directOwnerTenant && (kind === "owner" || kind === "owner-admin");

  checks.identity=Boolean(session.identityId||session.executorId||session.driverId);
  const pendingRecipientTenant = Number(mission.recipient_company_id||0)>0 && Number(mission.recipient_company_id)===Number(session.tenantId);
  const pendingRecipientExecutor = Number(mission.recipient_executor_id||0)>0 && Number(mission.recipient_executor_id)===Number(session.executorId||0);
  const pendingNetworkRecipient = kind==="pending-network" && (
    (role==="admin" && String(mission.recipient_type||"")==="tenant" && pendingRecipientTenant) ||
    (role==="executor" && String(mission.recipient_type||"")==="executor" && pendingRecipientExecutor)
  );
  const pendingForYouRecipient = kind==="pending-foryou" && (
    (role==="admin" && String(mission.requester_type||"")==="tenant" && Number(mission.requester_company_id||0)===Number(session.tenantId)) ||
    (role==="executor" && String(mission.requester_type||"")==="executor" && Number(mission.executor_id||0)===Number(session.executorId))
  );
  // Independent executors are identity-bound by executorId, not tenantId.
  // Pending Network / ForYou requester contexts therefore must not require a
  // tenant session merely to pass the tenant-boundary gate. The authoritative
  // recipient/requester identity checks above remain mandatory.
  // Independent executors are never tenant members. Their mission boundary is
  // established by the authoritative executor access resolver (assigned
  // execution, pending Network/ForYou request, discovery, or custody recipient)
  // and their executor identity. Do not require a tenantId for any executor
  // execution path; doing so makes every lifecycle mutation fail after a mission
  // is accepted even though the executor owns the execution responsibility.
  const executorScopedAccess = role==="executor" && Boolean(session.executorId) && (
    kind==="executor" ||
    pendingNetworkRecipient ||
    pendingForYouRecipient ||
    kind==="foryou-discovery" ||
    (kind==="custody-recipient" && String(mission.custody_target_type||"")==="executor" && Number(mission.custody_target_id||0)===Number(session.executorId))
  );
  checks.tenant=(Number(session.tenantId)>0 && (
    (Number(access.tenantId)>0 && Number(session.tenantId)===Number(access.tenantId)) ||
    kind==="shared-tenant" || kind==="shared-driver" ||
    kind==="custody-recipient" || pendingNetworkRecipient || pendingForYouRecipient || (kind==="foryou-discovery" && role==="admin")
  )) || executorScopedAccess;
  checks.role=Boolean(def?.roles?.includes(role));
  checks.participation=Boolean(access.mission&&Number(access.mission.id)===Number(mission.id));

  const assignedDriver=Number(mission.owner_driver_id||mission.shared_driver_id||0);
  const assignedExecutor=Number(mission.assigned_executor_id||mission.owner_assigned_executor_id||0);
  const viewerExecution=role==="driver" ? assignedDriver>0 && assignedDriver===Number(session.driverId) :
    role==="executor" ? assignedExecutor>0 && assignedExecutor===Number(session.executorId) : false;
  checks.responsibility=role==="admin" ? (kind==="owner" || kind==="owner-admin") : viewerExecution;

  const status=String(mission.status||"");
  const flow=def?.requiredStatus&&def?.nextStatus?{status:String(def.requiredStatus),next:String(def.nextStatus)}:null;
  if(flow){
    try{
      const lifecycle=await resolveLifecycleForMission(env,mission);
      checks.lifecycle=flow.status===status && lifecycle.transitions.some(t=>t.fromStateCode===String(flow.status).toUpperCase().replaceAll("PICKEDUP","PICKED_UP").replaceAll("INTRANSIT","IN_TRANSIT")&&t.toStateCode===String(flow.next).toUpperCase().replaceAll("PICKEDUP","PICKED_UP").replaceAll("INTRANSIT","IN_TRANSIT")&&(!t.actionCode||t.actionCode===code)) && (def?.roles?.some(r=>EXECUTION_ROLES.has(r))||EXECUTION_ROLES.has(role));
    }catch{checks.lifecycle=false;}
  }else if(isLifecycleTerminal(status)){
    checks.lifecycle=code==="reactivate_mission";
  }else{
    checks.lifecycle=true;
  }

  if(code==="advance_execution"){
    checks.responsibility=EXECUTION_ROLES.has(role)&&viewerExecution;
    checks.lifecycle=!isLifecycleTerminal(status);
  }
  if(code==="complete_mission") checks.responsibility=role==="admin" ? (kind==="owner" || kind==="owner-admin") && !Number(mission.assigned_executor_id||mission.executing_tenant_id||0) : viewerExecution;
  if(code==="capture_delivery_proof") checks.lifecycle=["InTransit","Delivered"].includes(status) && viewerExecution;
  if(code==="resolve_exception") checks.lifecycle=true;
  if(code==="delete_mission") checks.lifecycle=role==="admin" && (kind==="owner" || kind==="owner-admin") && !Number(mission.shared_access||0);
  if(["cancel_mission","edit_mission","edit_mission_data","reclaim_execution","restart_network","repost_foryou","reactivate_mission","share_network","share_foryou"].includes(code)) checks.responsibility=role==="admin" && (kind==="owner" || kind==="owner-admin");
  if(["assign_driver","change_driver"].includes(code)) checks.responsibility=role==="admin" && (kind==="owner" || kind==="owner-admin" || kind==="shared-tenant");
  if(code==="request_foryou_mission") checks.responsibility=(role==="admin"||role==="executor") && kind==="foryou-discovery" && Number(mission.public_enabled||0)===1 && String(mission.status||"")==="Pending";
  if(code==="cancel_foryou_request") checks.responsibility=kind==="pending-foryou" && (
    (role==="admin" && String(mission.requester_type||"")==="tenant" && Number(mission.requester_company_id||0)===Number(session.tenantId)) ||
    (role==="executor" && String(mission.requester_type||"")==="executor" && Number(mission.executor_id||0)===Number(session.executorId||0))
  );
  const sharedCustodyActions=new Set(["start_custody_resolution","finalize_custody_transfer","abort_custody_transfer","reassign_custody_receiver"]);
  if(sharedCustodyActions.has(code)&&role==="admin"&&kind==="shared-tenant") checks.responsibility=true;
  if(code==="reassign_custody_receiver"&&role==="admin"&&kind==="custody-recipient") checks.responsibility=true;
  if(code==="accept_custody"&&role==="executor"&&kind==="custody-recipient" &&
    String(mission.custody_target_type||"")==="executor" && Number(mission.custody_target_id||0)===Number(session.executorId||0))
    checks.responsibility=true;
  if(["accept_network","reject_network"].includes(code)){
    checks.lifecycle=true;
    checks.responsibility=kind==="pending-network" && (
      (role==="admin"&&String(access.mission?.network_invitation_pending||"")==="1") ||
      (role==="executor"&&Number(mission.recipient_executor_id||0)===Number(session.executorId||0))
    );
  }
  if(["approve_foryou_request","decline_foryou_request"].includes(code)){
    checks.lifecycle=true;
    checks.responsibility=ownerAuthority;
  }

  if(code==="confirm_delivery" && Number(mission.delivery_proof_required??1)===1) checks.evidence=Boolean(access.deliveryProofPresent);
  if(code==="complete_mission" && Number(mission.delivery_proof_required??1)===1) checks.evidence=Boolean(access.deliveryProofPresent);

  // Custody is action-specific. An open custody case must never become a blanket
  // denial for unrelated owner actions such as Edit/Cancel/Delete, while normal
  // lifecycle execution must pause until custody is resolved. Custody actions
  // themselves are intentionally allowed to enter the secured custody service.
  const custodySensitiveLifecycle=new Set(["confirm_arrival","confirm_pickup","start_transit","confirm_delivery","complete_mission"]);
  if(access.openCustodyCase && custodySensitiveLifecycle.has(code)) checks.custody=false;

  if(!checks.identity)reasons.push("identity_missing");
  if(!checks.tenant)reasons.push("tenant_boundary_failed");
  if(!checks.role)reasons.push("role_not_authorized");
  if(!checks.participation)reasons.push("mission_participation_failed");
  if(!checks.responsibility)reasons.push("responsibility_not_held");
  if(!checks.lifecycle)reasons.push("lifecycle_precondition_failed");
  if(!checks.evidence)reasons.push("required_evidence_missing");
  if(!checks.custody)reasons.push("custody_resolution_required");

  return Object.freeze({
    version:SECURED_ACTION_AUTHORIZATION_VERSION,
    actionCode:code,
    authorized:Boolean(def&&Object.values(checks).every(Boolean)),
    checks:Object.freeze(checks),
    reasons:Object.freeze(reasons),
    authority:"secured_authoritative_service",
    advisory:false
  });
}
