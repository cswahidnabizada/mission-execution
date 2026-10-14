import {MISSION_PRE_CUSTODY_STATUSES,MISSION_TERMINAL_STATUSES} from "../../domains/logistics/logistics-lifecycle.contract.js";
import * as repo from "../../repositories/network.repository.js";
import * as missionRepo from "../../repositories/mission.repository.js";
import * as driverRepo from "../../repositories/driver.repository.js";
import * as sharedRepo from "../../repositories/shared-mission.repository.js";
import * as executorRepo from "../../repositories/executor.repository.js";
import * as driverWorkspaceRepo from "../../repositories/driver-workspace.repository.js";
import * as messageRepo from "../../repositories/message.repository.js";
import * as notificationRepo from "../../repositories/notification.repository.js";
import {requireWorkTrust} from "../verification/verification.service.js";
import {requireUserSituationAction} from "../../security/user-situation.service.js";
import {audit} from "../../security/audit.js";
import {notifyMissionAssigned} from "../notifications/notifications.service.js";
import {markTenantNew} from "../awareness/awareness.service.js";
import {operationalMissionHref} from "../intelligence/operational-mission-route.js";
import {assertSingleExecutionOwner} from "../../extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {driverAssignmentEligibility} from "../assignments/driver-assignment.policy.js";
import {prepareExecutionTransition} from "../transitions/execution-transition.service.js";
import {activateExternalCustodyRecipient,markCustodyDistributionRejected,assignTrustedExecutorToMission} from "../../extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {canonicalAssignmentStatements} from "../../security/mission-assignment-authority.service.js";

import { authorityUnavailable } from '../../core/canonical-db.js';
export async function getSummary(env,session){return repo.summary(env,Number(session.tenantId));}
export async function searchTenants(env,session,q){return String(q||"").trim().length<2?[]:repo.searchTenants(env,Number(session.tenantId),q);}
export async function tenantRelationships(env,session,filters={}){return repo.listTenantTrust(env,Number(session.tenantId),filters);}
export async function trustedExecutors(env,session,filters={}){return repo.listTrustedExecutors(env,Number(session.tenantId),filters);}
export async function discoverForYouPartners(env,session){
  const tenantId=Number(session.tenantId);
  if(!tenantId)return [];
  const [companies,executors]=await Promise.all([
    env.DB.prepare(`SELECT r.requester_company_id AS partner_id,c.name AS partner_name,COUNT(DISTINCT r.mission_id) AS completed_missions,MAX(COALESCE(r.updated_at,r.created_at)) AS last_completed_at
      FROM public_mission_requests r JOIN mission_canonical_projection m ON m.id=r.mission_id AND m.company_id=r.company_id
      LEFT JOIN companies c ON c.id=r.requester_company_id
      WHERE r.company_id=? AND r.status='Approved' AND r.requester_company_id IS NOT NULL AND r.requester_company_id<>? AND LOWER(COALESCE(m.status,'')) IN ('completed','complete','delivered','closed')
      GROUP BY r.requester_company_id,c.name ORDER BY last_completed_at DESC LIMIT 100`).bind(tenantId,tenantId).all(),
    env.DB.prepare(`SELECT r.executor_id AS partner_id,COALESCE(pei.display_name,'Executor') AS partner_name,pep.registered_company_name AS company_name,COUNT(DISTINCT r.mission_id) AS completed_missions,MAX(COALESCE(r.updated_at,r.created_at)) AS last_completed_at
      FROM public_mission_requests r JOIN mission_canonical_projection m ON m.id=r.mission_id AND m.company_id=r.company_id
      LEFT JOIN public_executor_identities pei ON pei.id=r.executor_id
      LEFT JOIN public_executor_profiles pep ON pep.executor_id=r.executor_id
      WHERE r.company_id=? AND r.status='Approved' AND r.executor_id IS NOT NULL AND LOWER(COALESCE(m.status,'')) IN ('completed','complete','delivered','closed')
      GROUP BY r.executor_id,pei.display_name,pep.registered_company_name ORDER BY last_completed_at DESC LIMIT 100`).bind(tenantId).all()
  ]);
  return [
    ...(companies?.results||[]).filter(x=>Number(x.partner_id)>0).map(x=>({candidateType:'tenant',partnerId:Number(x.partner_id),name:x.partner_name||'Completed ForYou partner',companyName:x.partner_name||'',completedMissions:Number(x.completed_missions||0),lastCompletedAt:x.last_completed_at||null})),
    ...(executors?.results||[]).filter(x=>Number(x.partner_id)>0).map(x=>({candidateType:'executor',partnerId:Number(x.partner_id),name:x.partner_name||'Completed ForYou executor',companyName:x.company_name||'',completedMissions:Number(x.completed_missions||0),lastCompletedAt:x.last_completed_at||null}))
  ];
}

export async function executionPartners(env,session){
  const tenantId=Number(session.tenantId);
  const [relationships,executors]=await Promise.all([repo.listTenantTrust(env,tenantId),repo.listTrustedExecutors(env,tenantId)]);
  const tenants=(relationships||[])
    .filter(x=>String(x.status||"").toLowerCase()==="trusted"&&Number(x.can_receive_missions||0)===1)
    .map(x=>({recipientType:"tenant",recipientId:Number(x.partner_company_id),name:x.partner_company_name||"Trusted company",kind:"Trusted company"}));
  const independent=(executors||[])
    .filter(x=>String(x.status||"").toLowerCase()==="trusted"&&Number(x.can_receive_missions??1)===1)
    .map(x=>({recipientType:"executor",recipientId:Number(x.executor_id),name:x.display_name||"Independent executor",kind:"Independent executor",companyName:x.registered_company_name||""}));
  return [...tenants,...independent].filter(x=>x.recipientId).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
export async function searchExecutors(env,session,q){return String(q||"").trim().length<2?[]:repo.searchExecutors(env,Number(session.tenantId),q);}
export async function customers(env,session,includeAll=false,filters={}){return repo.listCustomers(env,Number(session.tenantId),Boolean(includeAll),filters);}
export async function customerForMission(env,session,customerId){return repo.findCustomer(env,Number(session.tenantId),Number(customerId));}
export async function searchCustomers(env,session,q,includeAll=false){return String(q||"").trim().length<1?[]:repo.searchCustomers(env,Number(session.tenantId),q,Boolean(includeAll));}
export async function customerLocations(env,session,customerId){const c=await repo.findCustomerAny(env,Number(session.tenantId),Number(customerId));if(!c)throw notFound("Customer not found");return repo.listCustomerLocations(env,Number(session.tenantId),Number(customerId));}
export async function createCustomerLocation(env,session,customerId,d){await requireWorkTrust(env,session);const c=await repo.findCustomer(env,Number(session.tenantId),Number(customerId));if(!c)throw notFound("Customer not found");if(!d.label||!d.companyName||!d.address)throw bad("Location label, company and address are required");const id=await repo.createCustomerLocation(env,Number(session.tenantId),Number(customerId),d);await audit(env,{session,action:"network.customer_location.create",resourceType:"customer",resourceId:Number(customerId),metadata:{locationId:id}});return {id};}
export async function networkMissions(env,session){return repo.listNetworkMissions(env,Number(session.tenantId));}
export async function incomingInvitations(env,session,filters={}){return repo.listIncomingInvitations(env,session,filters);}

export async function sendTenantTrustRequest(env,session,partnerId){
  await requireWorkTrust(env,session);
  const companyId=Number(session.tenantId),partner=Number(partnerId);
  if(!partner||partner===companyId)throw bad("Choose another tenant");
  const company=await env.DB.prepare(`SELECT id,name FROM companies WHERE id=? LIMIT 1`).bind(partner).first();
  if(!company)throw notFound("Tenant not found");
  const current=await repo.findTenantTrust(env,companyId,partner);
  if(current?.status==="trusted")throw conflict("Tenant is already trusted");
  if(current?.status==="blocked")throw forbidden("This relationship is blocked");
  const trust=await repo.requestTenantTrust(env,companyId,partner);
  try{await notificationRepo.insertNotification(env,{
    recipientRole:"admin",recipientTenantId:partner,type:"network_trust_request",
    title:`Trust request · ${session.companyName||"ON Mission tenant"}`,
    body:"A logistics tenant wants to establish a trusted network relationship.",
    link:"/app#network",priority:"normal",dedupeKey:`network-trust:${trust.id}:${trust.updated_at||Date.now()}`
  });}catch{}
  await audit(env,{session,action:"network.tenant_trust.request",resourceType:"company",resourceId:partner,metadata:{trustId:trust.id}});
  return trust;
}

export async function respondTenantTrust(env,session,trustId,action){
  await requireWorkTrust(env,session);
  const companyId=Number(session.tenantId);
  const rows=await repo.listTenantTrust(env,companyId);
  const trust=rows.find(x=>Number(x.id)===Number(trustId));
  if(!trust)throw notFound("Trust relationship not found");
  const incoming=Number(trust.requested_by_company_id)!==companyId;
  if(action==="accept"){
    if(trust.status!=="pending"||!incoming)throw conflict("Only the receiving tenant can accept this request");
    await repo.updateTenantTrust(env,companyId,trustId,"trusted");
  }else if(action==="reject"){
    if(trust.status!=="pending"||!incoming)throw conflict("Only the receiving tenant can reject this request");
    await repo.updateTenantTrust(env,companyId,trustId,"rejected");
  }else if(action==="suspend"){
    if(trust.status!=="trusted")throw conflict("Only trusted relationships can be suspended");
    await repo.updateTenantTrust(env,companyId,trustId,"suspended");
  }else throw bad("Invalid trust action");
  if(["accept","reject"].includes(action)){
    try{await notificationRepo.insertNotification(env,{
      recipientRole:"admin",recipientTenantId:Number(trust.requested_by_company_id),
      type:"network_trust_response",title:`Trust request ${action==="accept"?"accepted":"rejected"}`,
      body:`${session.companyName||"ON Mission tenant"} ${action==="accept"?"accepted":"rejected"} your network trust request.`,
      link:"/app#network",priority:action==="accept"?"normal":"low",
      dedupeKey:`network-trust-response:${trustId}:${action}`
    });}catch{}
  }
  await audit(env,{session,action:`network.tenant_trust.${action}`,resourceType:"network_trust",resourceId:Number(trustId),metadata:{partnerCompanyId:Number(trust.partner_company_id)}});
  return {id:Number(trustId),status:action==="accept"?"trusted":action==="reject"?"rejected":"suspended"};
}

export async function setExecutorTrust(env,session,executorId,status="trusted"){
  await requireWorkTrust(env,session);
  const companyId=Number(session.tenantId),id=Number(executorId);
  const executor=await executorRepo.findExecutorById(env,id);
  if(!executor)throw notFound("Executor not found");
  if(!["trusted","suspended","blocked"].includes(status))throw bad("Invalid executor trust status");
  await repo.trustExecutor(env,companyId,id,status);
  await audit(env,{session,action:`network.executor.${status}`,resourceType:"executor",resourceId:id});
  return {executorId:id,status};
}

export async function createCustomer(env,session,d){
  await requireWorkTrust(env,session);
  if(!d.companyName)throw bad("Customer company name is required");
  const id=await repo.createCustomer(env,Number(session.tenantId),d);
  await audit(env,{session,action:"network.customer.create",resourceType:"customer",resourceId:id});
  return {id};
}
export async function updateCustomer(env,session,id,d){
  await requireWorkTrust(env,session);
  if(!d.companyName)throw bad("Customer company name is required");
  const companyId=Number(session.tenantId),customerId=Number(id);
  const current=await repo.findCustomer(env,companyId,customerId);
  if(!current)throw notFound("Active customer not found");
  const result=await repo.updateCustomer(env,companyId,customerId,d);
  if(Number(result?.meta?.changes||0)!==1)throw conflict("Customer changed before update could be completed");
  await audit(env,{session,action:"network.customer.update",resourceType:"customer",resourceId:customerId});
  return {id:customerId};
}
export async function deleteCustomer(env,session,id,confirmation=""){
  await requireWorkTrust(env,session);
  const companyId=Number(session.tenantId),customerId=Number(id);
  const current=await repo.findCustomer(env,companyId,customerId);
  if(!current)throw notFound("Active customer not found");
  if(String(confirmation||"")!=="DELETE"&&String(confirmation||"")!==String(current.customer_reference||current.company_name||""))throw bad("Type DELETE or the exact customer reference to confirm");
  const used=await env.DB.prepare(`SELECT COUNT(*) AS c FROM mission_canonical_projection WHERE company_id=? AND customer_id=?`).bind(companyId,customerId).first();
  if(Number(used?.c||0)>0)throw conflict("This customer is referenced by mission history. Archive the customer instead so historical mission truth remains intact.");
  const result=await repo.deleteCustomer(env,companyId,customerId);
  if(Number(result?.result?.meta?.changes||0)!==1)throw conflict("Customer changed before deletion could be completed");
  await audit(env,{session,action:"network.customer.delete",resourceType:"customer",resourceId:customerId});
  return {customerId,status:"deleted"};
}
export async function archiveCustomer(env,session,id){
  await requireWorkTrust(env,session);
  const tenantId=Number(session.tenantId),customerId=Number(id);
  const customer=await repo.findCustomer(env,tenantId,customerId);
  if(!customer)throw notFound("Active customer not found");
  const impact=await env.DB.prepare(`SELECT COUNT(*) AS c FROM mission_canonical_projection WHERE company_id=? AND customer_id=? AND status NOT IN ('Completed','Cancelled','Canceled')`).bind(tenantId,customerId).first();
  if(Number(impact?.c||0)>0)throw conflict("Customer is still attached to active missions. Complete or reassign those missions before archiving.");
  const result=await repo.archiveCustomer(env,tenantId,customerId);
  if(Number(result?.meta?.changes||0)!==1)throw conflict("Customer changed before archive could be completed");
  await audit(env,{session,action:"network.customer.archive",resourceType:"customer",resourceId:customerId});
  return {customerId,status:"archived"};
}

export async function assertTrustedRecipient(env,session,recipientType,recipientId){
  const companyId=Number(session.tenantId),id=Number(recipientId);
  if(recipientType==="tenant"){
    const trust=await repo.findTenantTrust(env,companyId,id);
    if(!trust||trust.status!=="trusted"||Number(trust.can_receive_missions)!==1)throw forbidden("Tenant is not trusted for mission invitations");
    return {recipientCompanyId:id,recipientExecutorId:null};
  }
  if(recipientType==="executor"){
    const trust=await repo.hasTrustedExecutor(env,companyId,id);
    if(!trust)throw forbidden("Executor is not trusted for mission invitations");
    return {recipientCompanyId:null,recipientExecutorId:id};
  }
  throw bad("Invalid network recipient");
}

export async function inviteMission(env,session,missionId,recipientType,recipientId,message="",mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  await requireWorkTrust(env,session);
  await requireUserSituationAction(env,session,"share_network");
  const companyId=Number(session.tenantId);
  const mission=await missionRepo.findMission(env,companyId,Number(missionId));
  if(!mission)throw notFound("Mission not found");
  if(!MISSION_PRE_CUSTODY_STATUSES.includes(String(mission.status||"")))throw conflict("Only a pre-pickup mission can be shared through Network");
  if(Number(mission.public_enabled)===1)throw conflict("Public ForYou missions cannot also be direct network missions");
  const [ownerAssignment,assignedExecutor,sharedAccess,activeInvite]=await Promise.all([
    env.DB.prepare(`SELECT assignee_id AS driver_id FROM mission_assignments WHERE company_id=? AND mission_id=? AND assignment_type='owner_driver' AND assignee_type='driver' AND status='active' ORDER BY id DESC LIMIT 1`).bind(companyId,missionId).first(),
    env.DB.prepare(`SELECT id FROM mission_assignments WHERE company_id=? AND mission_id=? AND assignment_type='executor' AND assignee_type='executor' AND status='active' LIMIT 1`).bind(companyId,missionId).first(),
    env.DB.prepare(`SELECT id FROM mission_tenant_access WHERE owner_company_id=? AND mission_id=? AND status='active' LIMIT 1`).bind(companyId,missionId).first(),
    repo.findActiveMissionInvitation(env,companyId,missionId)
  ]);
  const previousDriverId=Number(ownerAssignment?.driver_id||0)||null;
  if(assignedExecutor||sharedAccess||activeInvite)throw conflict("Mission already has an active network recipient or invitation");
  const target=await assertTrustedRecipient(env,session,recipientType,recipientId);
  await prepareExecutionTransition(env,session,mission,{reason:"trusted_network_invitation"});
  const invitationData={missionId:Number(missionId),ownerCompanyId:companyId,recipientType,...target,message};
  const id=previousDriverId
    ?await repo.createMissionInvitationReplacingOwnerDriver(env,{...invitationData,previousDriverId})
    :await repo.createMissionInvitation(env,invitationData);
  await messageRepo.insertMessage(env,{tenantId:companyId,missionId:Number(missionId),senderRole:"system",message:previousDriverId?"Local driver assignment changed to Trusted Network invitation":"Mission invitation sent to a trusted network partner",messageType:"text"});
  await audit(env,{session,action:"network.mission.invite",resourceType:"mission",resourceId:Number(missionId),metadata:{invitationId:id,recipientType,recipientId:Number(recipientId)}});
  return {invitationId:id,missionId:Number(missionId)};
}

export async function invitationMutationContext(env,session,invitationId){
  await requireWorkTrust(env,session);
  const invitation=await repo.findMissionInvitation(env,Number(invitationId));
  if(!invitation)throw notFound("Invitation not found");
  const isRecipient=(session.role==="admin"&&invitation.recipient_type==="tenant"&&Number(invitation.recipient_company_id)===Number(session.tenantId))
    ||(session.role==="executor"&&invitation.recipient_type==="executor"&&Number(invitation.recipient_executor_id)===Number(session.executorId));
  if(!isRecipient)throw forbidden("This invitation belongs to another account");
  return {invitation,ownerCompanyId:Number(invitation.owner_company_id),missionId:Number(invitation.mission_id),stateToken:String(invitation.mission_updated_at||"")};
}

export async function respondMissionInvitation(env,session,invitationId,action,{driverId=null}={},mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  await requireWorkTrust(env,session);
  if(action==="accept")await requireUserSituationAction(env,session,"accept_network");
  const invitation=await repo.findMissionInvitation(env,Number(invitationId));
  if(!invitation)throw notFound("Invitation not found");
  if(invitation.status!=="Pending"){
    if(action==="accept"&&invitation.status==="Accepted")return {missionId:Number(invitation.mission_id),status:"Accepted",alreadyApplied:true};
    if(action==="reject"&&invitation.status==="Rejected")return {missionId:Number(invitation.mission_id),status:"Rejected",alreadyApplied:true};
    throw conflict(`Invitation is already ${invitation.status}`);
  }
  const isRecipient=(session.role==="admin"&&invitation.recipient_type==="tenant"&&Number(invitation.recipient_company_id)===Number(session.tenantId))
    ||(session.role==="executor"&&invitation.recipient_type==="executor"&&Number(invitation.recipient_executor_id)===Number(session.executorId));
  if(!isRecipient)throw forbidden("This invitation belongs to another account");
  if(!["accept","reject"].includes(action))throw bad("Invalid invitation action");
  if(action==="reject"){
    await repo.respondInvitation(env,invitation.id,"Rejected");
    await markCustodyDistributionRejected(env,Number(invitation.owner_company_id),Number(invitation.mission_id));
    try{await notificationRepo.insertNotification(env,{
      recipientRole:"admin",recipientTenantId:Number(invitation.owner_company_id),
      missionId:Number(invitation.mission_id),missionOwnerCompanyId:Number(invitation.owner_company_id),
      type:"network_mission_response",title:`Network mission declined · ${invitation.reference||"Mission"}`,
      body:"Your Trusted Network partner declined the mission invitation.",
      link:operationalMissionHref(invitation.mission_id,{role:"admin"}),priority:"normal",
      dedupeKey:`network-mission-response:${invitation.id}:Rejected`
    });}catch{}
    await audit(env,{session,action:"network.mission.reject",resourceType:"mission",resourceId:Number(invitation.mission_id),metadata:{invitationId:Number(invitation.id)}});
    return {missionId:Number(invitation.mission_id),status:"Rejected"};
  }

  if(MISSION_TERMINAL_STATUSES.includes(String(invitation.mission_status||"")))throw conflict("Mission is closed and cannot be accepted");

  const custodyCase=await env.DB.prepare(`
    SELECT * FROM mission_custody_cases
    WHERE company_id=? AND mission_id=? AND transfer_channel='network'
      AND status='ready_to_transfer' AND distribution_status='network_pending'
      AND recipient_type=? AND recipient_id=?
    ORDER BY id DESC LIMIT 1
  `).bind(
    Number(invitation.owner_company_id),Number(invitation.mission_id),String(invitation.recipient_type),
    invitation.recipient_type==="tenant"?Number(invitation.recipient_company_id):Number(invitation.recipient_executor_id)
  ).first();

  if(custodyCase){
    let receivingDriverId=null;
    if(invitation.recipient_type==="tenant"){
      receivingDriverId=Number(driverId||0);
      if(!receivingDriverId)throw conflict("Choose the driver who will receive custody before accepting this handoff");
      const driver=await driverRepo.findActiveDriver(env,Number(invitation.recipient_company_id),receivingDriverId);
      if(!driver)throw conflict("Receiving driver is no longer active");
    }

    await repo.respondInvitation(env,invitation.id,"Accepted");
    await activateExternalCustodyRecipient(env,session,Number(invitation.mission_id),{
      ownerCompanyId:Number(invitation.owner_company_id),
      recipientType:invitation.recipient_type,
      recipientId:invitation.recipient_type==="tenant"?Number(invitation.recipient_company_id):Number(invitation.recipient_executor_id),
      driverId:receivingDriverId
    });
    await messageRepo.insertMessage(env,{tenantId:Number(invitation.owner_company_id),missionId:Number(invitation.mission_id),senderRole:"system",
      message:invitation.recipient_type==="tenant"
        ?"Trusted tenant accepted the custody handoff · receiving driver must now accept physical custody"
        :"Trusted executor accepted the custody handoff · physical custody acceptance is still required",
      messageType:"text"});
    await audit(env,{session:{...session,tenantId:Number(invitation.owner_company_id)},action:"network.custody.receiver_ready",resourceType:"mission",resourceId:Number(invitation.mission_id),metadata:{invitationId:Number(invitation.id),recipientType:invitation.recipient_type,receivingDriverId,currentHolderRetained:true}});
    return {missionId:Number(invitation.mission_id),status:"Accepted",custodyPending:true,receivingDriverId,currentHolderRetained:true};
  }

  const ownership=await assertSingleExecutionOwner(env,Number(invitation.owner_company_id),Number(invitation.mission_id));
  if(ownership.marketplace)throw conflict("Mission distribution changed to ForYou before this invitation was accepted");
  if(ownership.ownerCount>0)throw conflict("Mission execution ownership changed before this invitation was accepted");
  if(invitation.driver_id)throw conflict("Mission was assigned to a local driver before you accepted");
  const currentExecutor=await env.DB.prepare(`SELECT assignee_id AS executor_id FROM mission_assignments WHERE company_id=? AND mission_id=? AND assignment_type='executor' AND assignee_type='executor' AND status='active' LIMIT 1`).bind(invitation.owner_company_id,invitation.mission_id).first();
  const currentShared=await env.DB.prepare(`SELECT access_company_id FROM mission_tenant_access WHERE owner_company_id=? AND mission_id=? AND status='active' LIMIT 1`).bind(invitation.owner_company_id,invitation.mission_id).first();
  if(currentExecutor||currentShared)throw conflict("Mission execution access changed before this invitation was accepted");

  if(invitation.recipient_type==="tenant"){
    const trust=await repo.findTenantTrust(env,Number(invitation.owner_company_id),Number(invitation.recipient_company_id));
    if(!trust||trust.status!=="trusted")throw forbidden("Trusted relationship is no longer active");
    const selectedDriverId=Number(driverId||0);
    if(!selectedDriverId)throw conflict("Choose the driver who will execute this shared mission before accepting it");
    const driver=await driverRepo.findActiveDriver(env,Number(invitation.recipient_company_id),selectedDriverId);
    if(!driver)throw conflict("Selected driver is no longer active");
    // Network acceptance is a recipient-side mutation. Do not call the generic
    // owner/shared assignment service from inside this guarded mutation: that
    // service resolves the same mission again and is allowed to perform its own
    // execution-preparation checks. The outer Network acceptance already owns
    // the mission lease and has validated the recipient, trust, driver and
    // execution-owner preconditions. Re-entering the generic assignment path
    // can therefore produce a false 409 while the invitation is still Pending.
    // Keep the acceptance transition atomic at its core: grant the recipient
    // access and bind exactly one receiving driver in the same D1 batch.
    const profile=await driverWorkspaceRepo.ensureProfile(env,Number(invitation.recipient_company_id),selectedDriverId);
    const eligibility=driverAssignmentEligibility({...driver,...profile},String(invitation.mission_status||"Pending"));
    if(!eligibility.allowed)throw conflict(eligibility.reason);
    const coreAcceptance=await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO mission_tenant_access(
          mission_id,owner_company_id,access_company_id,request_id,status,approved_at,created_at,updated_at
        ) VALUES (?,?,?,?, 'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(mission_id,access_company_id) DO UPDATE SET
          request_id=excluded.request_id,status='active',approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      `).bind(Number(invitation.mission_id),Number(invitation.owner_company_id),Number(invitation.recipient_company_id),null),
      ...canonicalAssignmentStatements(env,{companyId:Number(invitation.owner_company_id),missionId:Number(invitation.mission_id),assignmentType:'tenant_driver',assigneeType:'driver',assigneeId:selectedDriverId,assigneeCompanyId:Number(invitation.recipient_company_id),sourceType:'network_invitation',sourceId:String(invitation.id)}),
      env.DB.prepare(`
        UPDATE network_mission_invitations
        SET status='Accepted',responded_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status='Pending'
      `).bind(Number(invitation.id))
    ]);
    if(Number(coreAcceptance?.[2]?.meta?.changes||0)!==1){
      throw conflict("Network invitation changed before acceptance could be committed. Refresh the mission and review the current invitation.");
    }
    // Awareness/communication are projections of the committed acceptance. They
    // must never be able to turn a successful acceptance into a reported 409/500.
    try{await markTenantNew(env,{missionId:Number(invitation.mission_id),ownerCompanyId:Number(invitation.owner_company_id),tenantId:Number(invitation.recipient_company_id)});}catch(error){throw authorityUnavailable('network_shared_tenant_state',error);}
  }else{
    const trust=await repo.hasTrustedExecutor(env,Number(invitation.owner_company_id),Number(invitation.recipient_executor_id));
    if(!trust)throw forbidden("Executor trust is no longer active");
    await assignTrustedExecutorToMission(env,{
      companyId:Number(invitation.owner_company_id),missionId:Number(invitation.mission_id),
      executorId:Number(invitation.recipient_executor_id),invitationId:Number(invitation.id)
    });
  }

  // The normal tenant/executor acceptance path commits the invitation together
  // with its execution access above. Keep the legacy responder out of that core
  // transaction so a second status write cannot race the committed invitation.
  if(invitation.recipient_type!=="tenant")await repo.respondInvitation(env,invitation.id,"Accepted");
  await activateExternalCustodyRecipient(env,session,Number(invitation.mission_id),{
    ownerCompanyId:Number(invitation.owner_company_id),
    recipientType:invitation.recipient_type,
    recipientId:invitation.recipient_type==="tenant"?Number(invitation.recipient_company_id):Number(invitation.recipient_executor_id)
  });
  const acceptedDriverId=invitation.recipient_type==="tenant"?Number(driverId||0):0;
  const acceptedDriver=acceptedDriverId?await driverRepo.findActiveDriver(env,Number(invitation.recipient_company_id),acceptedDriverId):null;
  const acceptanceMessage=invitation.recipient_type==="tenant"
    ?`Trusted Network partner accepted Mission ${invitation.reference||invitation.mission_id}${acceptedDriver?.name?` and assigned driver ${acceptedDriver.name}.`:"."}`
    :`Trusted Network executor accepted Mission ${invitation.reference||invitation.mission_id}.`;
  await messageRepo.insertMessage(env,{tenantId:Number(invitation.owner_company_id),missionId:Number(invitation.mission_id),senderRole:"system",message:acceptanceMessage,messageType:"text"}).catch(error=>{console.warn('Optional mission acceptance message projection unavailable:',error?.message||error);});
  try{await notificationRepo.insertNotification(env,{
    recipientRole:"admin",recipientTenantId:Number(invitation.owner_company_id),
    missionId:Number(invitation.mission_id),missionOwnerCompanyId:Number(invitation.owner_company_id),
    type:"network_mission_response",title:`Network mission accepted · ${invitation.reference||"Mission"}`,
    body:acceptedDriver?.name?`Your Trusted Network partner accepted the mission and assigned driver ${acceptedDriver.name}.`:
      "Your Trusted Network partner accepted the mission. The mission is now active with the partner.",
    link:operationalMissionHref(invitation.mission_id,{role:"admin"}),priority:"high",
    dedupeKey:`network-mission-response:${invitation.id}:Accepted`
  });}catch{}
  const mission=await missionRepo.findMission(env,Number(invitation.owner_company_id),Number(invitation.mission_id));
  if(mission)await notifyMissionAssigned(env,mission).catch(error=>{console.warn('Optional mission assignment notification unavailable:',error?.message||error);});
  try{await audit(env,{session:{...session,tenantId:Number(invitation.owner_company_id)},action:"network.mission.accept",resourceType:"mission",resourceId:Number(invitation.mission_id),metadata:{invitationId:Number(invitation.id),recipientType:invitation.recipient_type}});}catch(error){throw authorityUnavailable('network_accept_audit',error);}
  return {missionId:Number(invitation.mission_id),status:"Accepted",assignedDriverId:acceptedDriverId||null};
}


function make(message,status){const e=new Error(message);e.status=status;return e;}
const bad=m=>make(m,400),notFound=m=>make(m,404),conflict=m=>make(m,409),forbidden=m=>make(m,403);
