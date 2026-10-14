import { authorityUnavailable } from '../../core/canonical-db.js';
import * as publicRepo from "../../repositories/public.repository.js";
import * as executorRepo from "../../repositories/executor.repository.js";
import * as sharedRepo from "../../repositories/shared-mission.repository.js";
import * as driverRepo from "../../repositories/driver.repository.js";
import * as messageRepo from "../../repositories/message.repository.js";
import { audit } from "../../security/audit.js";
import {requireUserSituationAction} from "../../security/user-situation.service.js";
import { requireWorkTrust } from "../verification/verification.service.js";
import * as missionRepo from "../../repositories/mission.repository.js";
import {notifyMissionAssigned} from "../notifications/notifications.service.js";
import {markTenantNew} from "../awareness/awareness.service.js";
import {assignDriver as engineAssignDriver} from "../../extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {assertMarketplaceAvailableForApproval,closeMarketplaceAfterApproval,assertSingleExecutionOwner} from "../../extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {activateExternalCustodyRecipient,assignExecutorToMission} from "../../extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {buildMarketplaceExchange} from "../../extensions/marketplace-intelligence/marketplace-intelligence.js";
import * as networkRepo from "../../repositories/network.repository.js";
import {findMissionForPrivateRequest} from "../../repositories/public.repository.js";

export async function listPublic(env,session){
  const missions=await publicRepo.listAvailablePublicMissions(env,session);
  if(session?.role!=="admin")return missions;
  const tenantId=Number(session.tenantId);
  const drivers=(await env.DB.prepare(`
    SELECT d.id,d.name,d.active,p.vehicle_type,p.current_location,p.situation,
      nextm.delivery_city AS next_location_city,nextm.delivery_zip_code AS next_location_zip,
      nextm.delivery_at_utc AS next_location_at
    FROM drivers d
    LEFT JOIN driver_operational_profiles p ON p.driver_id=d.id AND p.company_id=d.company_id
    LEFT JOIN mission_canonical_projection nextm ON nextm.id=(
      SELECT m2.id FROM mission_canonical_projection m2
      WHERE m2.company_id=d.company_id AND EXISTS (SELECT 1 FROM mission_active_assignment_projection ca WHERE ca.mission_id=m2.id AND ca.company_id=m2.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.assignee_id=d.id AND ca.status='active')
        AND m2.status NOT IN ('Completed','Cancelled','Canceled')
      ORDER BY datetime(COALESCE(m2.delivery_at_utc,m2.updated_at)) ASC,m2.id ASC LIMIT 1
    )
    WHERE d.company_id=? AND d.active=1
  `).bind(tenantId).all()).results||[];
  let networkExecutors=[];
  try { networkExecutors=await networkRepo.listTrustedExecutors(env,tenantId); } catch { networkExecutors=[]; }
  try {
    const exchange=buildMarketplaceExchange(missions,{drivers,networkExecutors});
    const byId=new Map(exchange.missions.map(x=>[Number(x.missionId),x]));
    return missions.map(m=>({...m,marketplaceIntelligence:byId.get(Number(m.id))||null}));
  } catch {
    // Marketplace intelligence is enrichment, never the availability authority.
    return missions.map(m=>({...m,marketplaceIntelligence:null}));
  }
}

export async function requestMission(env,missionId,session,message="",{driverId=null,accessCode=""}={},mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  await requireWorkTrust(env,session);
  await requireUserSituationAction(env,session,"request_foryou_mission");
  if(!session)throw unauthorized("Sign in to request access.");
  const mission=await findMissionForPrivateRequest(env,missionId,accessCode,session.role==="admin"?Number(session.tenantId):null,session.role==="executor"?Number(session.executorId):null);
  if(!mission)throw notFound("Mission not found or the ForYou access code is invalid or expired");
  const custodyHandoff=await isCustodyForYouHandoff(env,Number(mission.company_id),Number(mission.id));
  if(!custodyHandoff)await assertMarketplaceAvailableForApproval(env,Number(mission.company_id),Number(mission.id));

  if(session.role==="executor"){
    const executor=await executorRepo.findExecutorById(env,Number(session.executorId));
    if(!executor)throw notFound("Executor profile not found");
    return publicRepo.createExecutorPublicRequest(env,mission,executor,message);
  }

  if(session.role==="admin"){
    let receivingDriverId=null;
    if(custodyHandoff){
      receivingDriverId=Number(driverId||0);
      if(!receivingDriverId)throw conflict("Choose your receiving driver before requesting this custody handoff");
      const driver=await env.DB.prepare(`SELECT id FROM drivers WHERE id=? AND company_id=? AND active=1 LIMIT 1`)
        .bind(receivingDriverId,Number(session.tenantId)).first();
      if(!driver)throw conflict("Receiving driver is no longer active");
    }
    return publicRepo.createTenantPublicRequest(env,mission,session,message,receivingDriverId);
  }

  throw forbidden("This account cannot request public missions.");
}

export async function listRequests(env,session,filters={}){
  const rows=await publicRepo.listPublicRequests(env,Number(session.tenantId),filters);
  return rows.map(r=>({
    ...r,
    executor_cities:formatList(r.executor_cities),
    executor_zip_codes:formatList(r.executor_zip_codes),
    executor_vehicle_types:formatList(r.executor_vehicle_types)
  }));
}

export async function approve(env,session,requestId,mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  await requireWorkTrust(env,session);
  await requireUserSituationAction(env,session,"approve_foryou_request");
  const tenantId=Number(session.tenantId);
  const req=await publicRepo.findRequest(env,tenantId,requestId);
  if(!req)throw notFound("Request not found");
  if(req.status==="Approved") {
    // Idempotent completion: an earlier attempt may have committed the request
    // row before a downstream projection failed. Repair the authoritative access
    // state instead of returning early and leaving a half-approved mission.
    const custodyHandoff=await isCustodyForYouHandoff(env,tenantId,Number(req.mission_id));
    if(req.requester_type==="tenant"&&req.requester_company_id){
      if(!custodyHandoff){
        await sharedRepo.grantTenantAccess(env,{missionId:req.mission_id,ownerCompanyId:tenantId,accessCompanyId:Number(req.requester_company_id),requestId});
        await closeMarketplaceAfterApproval(env,{ownerCompanyId:tenantId,missionId:req.mission_id,approvedRequestId:requestId});
      }
      if(custodyHandoff)await activateExternalCustodyRecipient(env,session,Number(req.mission_id),{ownerCompanyId:tenantId,recipientType:"tenant",recipientId:Number(req.requester_company_id),driverId:Number(req.custody_driver_id||0)});
      try{await markTenantNew(env,{missionId:req.mission_id,ownerCompanyId:tenantId,tenantId:Number(req.requester_company_id)});}catch(error){throw authorityUnavailable('public_shared_tenant_state',error);}
      return {missionId:req.mission_id,alreadyApplied:true,status:"Approved",assignmentType:"tenant-shared-access"};
    }
    if(req.executor_id){
      const executor=await executorRepo.findExecutorById(env,Number(req.executor_id));
      if(!executor)throw notFound("Executor account not found");
      await executorRepo.upsertTenantExecutorLink(env,tenantId,executor.id);
      if(!custodyHandoff){
        await assignExecutorToMission(env,{companyId:tenantId,missionId:req.mission_id,executorId:executor.id,requestId});
        await closeMarketplaceAfterApproval(env,{ownerCompanyId:tenantId,missionId:req.mission_id,approvedRequestId:requestId});
      }else{
        await activateExternalCustodyRecipient(env,session,Number(req.mission_id),{ownerCompanyId:tenantId,recipientType:"executor",recipientId:Number(executor.id)});
      }
      return {executorId:executor.id,missionId:req.mission_id,alreadyApplied:true,status:"Approved",assignmentType:"independent-executor"};
    }
    throw conflict("Approved ForYou request has no valid requester");
  }
  if(req.status!=="Pending")throw conflict(`Request is already ${req.status}`);
  const custodyHandoff=await isCustodyForYouHandoff(env,tenantId,Number(req.mission_id));
  if(Number(req.public_enabled)!==1||(!custodyHandoff&&req.mission_status!=="Pending"))throw conflict("Mission is no longer available for new access");
  if(custodyHandoff){
    // The current physical holder intentionally remains the active execution owner
    // until the selected receiver accepts custody.
  }else{
    await assertMarketplaceAvailableForApproval(env,tenantId,Number(req.mission_id));
  }

  if(req.requester_type==="tenant"&&req.requester_company_id){
    if(Number(req.requester_company_id)===tenantId)throw conflict("Owner tenant cannot request its own mission");
    if(!custodyHandoff){
      await sharedRepo.grantTenantAccess(env,{
        missionId:req.mission_id,
        ownerCompanyId:tenantId,
        accessCompanyId:Number(req.requester_company_id),
        requestId
      });
    }
    await publicRepo.approveRequestStatus(env,tenantId,requestId);
    if(custodyHandoff){
      await publicRepo.closeOtherPendingRequests(env,tenantId,req.mission_id,requestId);
      await env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
        .bind(Number(req.mission_id),tenantId).run();
    }else{
      await closeMarketplaceAfterApproval(env,{ownerCompanyId:tenantId,missionId:req.mission_id,approvedRequestId:requestId});
    }
    if(custodyHandoff){
      await activateExternalCustodyRecipient(env,session,Number(req.mission_id),{
        ownerCompanyId:tenantId,recipientType:"tenant",recipientId:Number(req.requester_company_id),driverId:Number(req.custody_driver_id||0)
      });
    }else{
      await markTenantNew(env,{missionId:req.mission_id,ownerCompanyId:tenantId,tenantId:Number(req.requester_company_id)});
    }
    await messageRepo.insertMessage(env,{
      tenantId,missionId:req.mission_id,senderRole:"system",
      message:"A logistics tenant was approved for shared mission access",messageType:"text"
    }).catch(error=>{console.warn('Optional mission approval message unavailable:',error?.message||error);});
    await audit(env,{
      session,action:"public_request.approve_tenant",resourceType:"mission",resourceId:req.mission_id,
      metadata:{requestId,accessCompanyId:Number(req.requester_company_id)}
    });
    return {missionId:req.mission_id,assignmentType:"tenant-shared-access"};
  }

  if(req.executor_id){
    const executor=await executorRepo.findExecutorById(env,Number(req.executor_id));
    if(!executor)throw notFound("Executor account not found");
    await executorRepo.upsertTenantExecutorLink(env,tenantId,executor.id);
    if(!custodyHandoff){
      await assignExecutorToMission(env,{
        companyId:tenantId,missionId:req.mission_id,executorId:executor.id,requestId
      });
    }
    await publicRepo.approveRequestStatus(env,tenantId,requestId);
    if(custodyHandoff){
      await publicRepo.closeOtherPendingRequests(env,tenantId,req.mission_id,requestId);
      await env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
        .bind(Number(req.mission_id),tenantId).run();
    }else{
      await closeMarketplaceAfterApproval(env,{ownerCompanyId:tenantId,missionId:req.mission_id,approvedRequestId:requestId});
    }
    if(custodyHandoff)await activateExternalCustodyRecipient(env,session,Number(req.mission_id),{
      ownerCompanyId:tenantId,recipientType:"executor",recipientId:Number(executor.id)
    });
    await messageRepo.insertMessage(env,{
      tenantId,missionId:req.mission_id,senderRole:"system",
      message:"Independent executor approved for mission access",messageType:"text"
    }).catch(error=>{console.warn('Optional mission approval message unavailable:',error?.message||error);});
    await audit(env,{
      session,action:"public_request.approve_executor",resourceType:"mission",resourceId:req.mission_id,
      metadata:{requestId,executorId:executor.id}
    });
    const assigned=await missionRepo.findMission(env,tenantId,Number(req.mission_id));
    if(assigned)await notifyMissionAssigned(env,assigned).catch(error=>{console.warn('Optional mission assignment notification unavailable:',error?.message||error);});
    return {executorId:executor.id,missionId:req.mission_id,assignmentType:"independent-executor"};
  }

  throw conflict("Unsupported legacy public request. Please ask the requester to sign in and request again.");
}

export async function assignSharedDriver(env,session,missionId,driverId,mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  const result=await engineAssignDriver(env,session,missionId,driverId,mutationFence);
  return {missionId:Number(missionId),driverId:Number(result.assignment.driverId),driverName:result.assignment.driverName};
}

export async function cancelRequest(env,session,requestId,mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  await requireWorkTrust(env,session);
  if(session.role==="admin") {
    const req=await env.DB.prepare(`SELECT id,status FROM public_mission_requests WHERE id=? AND requester_type='tenant' AND requester_company_id=? LIMIT 1`).bind(Number(requestId),Number(session.tenantId)).first();
    if(!req)throw notFound("Request not found");
    if(req.status==="Cancelled")return {alreadyApplied:true};
    if(req.status!=="Pending")throw conflict(`Request is already ${req.status}`);
    const result=await publicRepo.cancelTenantPublicRequest(env,Number(session.tenantId),Number(requestId));
    if(Number(result?.meta?.changes||0)!==1)throw conflict("Request could not be cancelled");
    await audit(env,{session,action:"public_request.cancel_tenant",resourceType:"mission_request",resourceId:Number(requestId),metadata:{requestId:Number(requestId)}});
    return {};
  }
  if(session.role==="executor") {
    const req=await env.DB.prepare(`SELECT id,status FROM public_mission_requests WHERE id=? AND requester_type='executor' AND executor_id=? LIMIT 1`).bind(Number(requestId),Number(session.executorId)).first();
    if(!req)throw notFound("Request not found");
    if(req.status==="Cancelled")return {alreadyApplied:true};
    if(req.status!=="Pending")throw conflict(`Request is already ${req.status}`);
    const result=await publicRepo.cancelExecutorPublicRequest(env,Number(session.executorId),Number(requestId));
    if(Number(result?.meta?.changes||0)!==1)throw conflict("Request could not be cancelled");
    await audit(env,{session,action:"public_request.cancel_executor",resourceType:"mission_request",resourceId:Number(requestId),metadata:{requestId:Number(requestId)}});
    return {};
  }
  throw forbidden("This account cannot cancel public mission requests.");
}

export async function decline(env,session,requestId,mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  const tenantId=Number(session.tenantId);
  const req=await publicRepo.findRequest(env,tenantId,requestId);
  if(!req)throw notFound("Request not found");
  if(req.status==="Declined")return {alreadyApplied:true,status:"Declined"};
  if(req.status!=="Pending")throw conflict(`Request is already ${req.status}`);
  await publicRepo.declineRequest(env,tenantId,requestId);
  await audit(env,{session,action:"public_request.decline",resourceType:"mission",resourceId:req.mission_id,metadata:{requestId}});
}

function formatList(v){try{const a=JSON.parse(v||"[]");return Array.isArray(a)?a.join(", "):"";}catch{return String(v||"");}}
function make(m,s){const e=new Error(m);e.status=s;return e;}
const notFound=m=>make(m,404),conflict=m=>make(m,409),forbidden=m=>make(m,403),unauthorized=m=>make(m,401);

async function isCustodyForYouHandoff(env,companyId,missionId){
  return env.DB.prepare(`
    SELECT id FROM mission_custody_cases
    WHERE company_id=? AND mission_id=? AND transfer_channel='foryou'
      AND status='ready_to_transfer' AND distribution_status='foryou_published'
    ORDER BY id DESC LIMIT 1
  `).bind(Number(companyId),Number(missionId)).first();
}
