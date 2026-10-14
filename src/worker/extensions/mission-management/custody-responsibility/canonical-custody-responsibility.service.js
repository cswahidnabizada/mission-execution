import {canonicalFirst} from "../../../core/canonical-db.js";
import {RELEASE_VERSION} from '../../../core/release.js';
import * as missionRepo from "../../../repositories/mission.repository.js";
import * as sharedRepo from "../../../repositories/shared-mission.repository.js";
import * as driverRepo from "../../../repositories/driver.repository.js";
import * as driverWorkspaceRepo from "../../../repositories/driver-workspace.repository.js";
import * as executorRepo from "../../../repositories/executor.repository.js";
import * as publicRepo from "../../../repositories/public.repository.js";
import * as messageRepo from "../../../repositories/message.repository.js";
import * as networkRepo from "../../../repositories/network.repository.js";
import * as notificationRepo from "../../../repositories/notification.repository.js";
import {resolveMissionAccess} from "../../../security/mission-access.js";
import {audit} from "../../../security/audit.js";
import {requireWorkTrust} from "../../../modules/verification/verification.service.js";
import {requireUserSituationAction} from "../../../security/user-situation.service.js";
import {notifyMissionAssigned} from "../../../modules/notifications/notifications.service.js";
import {buildAssignmentState} from "../../../modules/assignments/assignment.engine.js";
import {prepareExecutionTransition,ensureOwnerUnassignedPending} from "../../../modules/transitions/execution-transition.service.js";
import {recordTransitionEvent} from "../../../modules/transitions/transition-safety.service.js";
import {driverAssignmentEligibility} from "../../../modules/assignments/driver-assignment.policy.js";
import {operationalMissionHref} from "../../../modules/intelligence/operational-mission-route.js";
import {createRequirement,resolveRequirement,findOpenRequirement} from "../requirements/management-requirement.repository.js";
import {canonicalAssignmentStatements,canonicalAssignmentRevokeStatements} from "../../../security/mission-assignment-authority.service.js";

import { authorityUnavailable } from '../../../core/canonical-db.js';
/* ON Mission 10.30.45 — Canonical Custody & Responsibility Control
 * Single authoritative domain for physical custody, execution responsibility,
 * assignment, handoff, ownership conflict detection, and responsibility recovery.
 * Read models may consume this domain; no competing custody/responsibility writer is permitted.
 */
export const CANONICAL_CUSTODY_RESPONSIBILITY_VERSION=RELEASE_VERSION;
export const CUSTODY_STATES=Object.freeze(["UNASSIGNED","HANDOFF_PENDING","READY_TO_TRANSFER","ACCEPTANCE_PENDING","RESOLVED","BREACH"]);
export const RESPONSIBILITY_TYPES=Object.freeze(["owner_driver","shared_tenant","executor","tenant"]);

export async function findOpenCase(env,companyId,missionId){
  return env.DB.prepare(`
    SELECT * FROM mission_custody_cases
    WHERE company_id=? AND mission_id=? AND status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance')
    ORDER BY id DESC LIMIT 1
  `).bind(Number(companyId),Number(missionId)).first();
}
async function createCase(env,d){
  const r=await env.DB.prepare(`
    INSERT INTO mission_custody_cases(
      company_id,mission_id,status,current_holder_type,current_holder_id,target_type,target_id,
      resolution_type,note,opened_by_identity_id,transfer_channel,recipient_type,recipient_id,distribution_status
    ) VALUES(?,?,'awaiting_release',?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    Number(d.companyId),Number(d.missionId),d.currentHolderType,d.currentHolderId||null,d.targetType||null,d.targetId||null,
    d.resolutionType,String(d.note||"").slice(0,500),d.openedByIdentityId||null,
    d.transferChannel||"driver",d.recipientType||null,d.recipientId||null,d.distributionStatus||null
  ).run();
  return Number(r.meta.last_row_id);
}
async function markReleased(env,companyId,id){
  return env.DB.prepare(`UPDATE mission_custody_cases SET status='ready_to_transfer',released_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=? AND status='awaiting_release'`).bind(Number(companyId),Number(id)).run();
}
async function markAwaitingAcceptance(env,companyId,id){
  return env.DB.prepare(`UPDATE mission_custody_cases SET status='awaiting_acceptance',transferred_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=? AND status='ready_to_transfer'`).bind(Number(companyId),Number(id)).run();
}
async function resolveCase(env,companyId,id){
  return env.DB.prepare(`UPDATE mission_custody_cases SET status='resolved',accepted_at=CURRENT_TIMESTAMP,resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=? AND status='awaiting_acceptance'`).bind(Number(companyId),Number(id)).run();
}

async function updateRouting(env,companyId,id,{transferChannel,recipientType=null,recipientId=null,distributionStatus=null,targetType=null,targetId=null}={}){
  return env.DB.prepare(`
    UPDATE mission_custody_cases
    SET transfer_channel=?,recipient_type=?,recipient_id=?,distribution_status=?,target_type=?,target_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=? AND status IN ('awaiting_release','ready_to_transfer')
  `).bind(
    String(transferChannel||"driver"),recipientType||null,recipientId||null,distributionStatus||null,
    targetType||null,targetId||null,Number(companyId),Number(id)
  ).run();
}
async function setDistributionStatus(env,companyId,id,status){
  return env.DB.prepare(`
    UPDATE mission_custody_cases SET distribution_status=?,updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=? AND status IN ('ready_to_transfer','awaiting_acceptance')
  `).bind(status||null,Number(companyId),Number(id)).run();
}
async function bindRecipient(env,companyId,id,{targetType,targetId,distributionStatus=null,awaitAcceptance=false}={}){
  const status=awaitAcceptance?"awaiting_acceptance":"ready_to_transfer";
  return env.DB.prepare(`
    UPDATE mission_custody_cases
    SET target_type=?,target_id=?,distribution_status=?,status=?,
        transferred_at=CASE WHEN ?='awaiting_acceptance' THEN CURRENT_TIMESTAMP ELSE transferred_at END,
        updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=? AND status='ready_to_transfer'
  `).bind(targetType||null,targetId||null,distributionStatus||null,status,status,Number(companyId),Number(id)).run();
}
async function findDistributionCase(env,companyId,missionId){
  return env.DB.prepare(`
    SELECT * FROM mission_custody_cases
    WHERE company_id=? AND mission_id=? AND status IN ('ready_to_transfer','awaiting_acceptance')
      AND transfer_channel IN ('network','foryou')
    ORDER BY id DESC LIMIT 1
  `).bind(Number(companyId),Number(missionId)).first();
}

async function findAwaitingAcceptanceForActor(env,companyId,missionId,{targetType,targetId}={}){
  return env.DB.prepare(`
    SELECT * FROM mission_custody_cases
    WHERE company_id=? AND mission_id=? AND status='awaiting_acceptance' AND target_type=? AND target_id=?
    ORDER BY id DESC LIMIT 1
  `).bind(Number(companyId),Number(missionId),String(targetType||""),Number(targetId)).first();
}
async function cancelCase(env,companyId,id){
  return env.DB.prepare(`
    UPDATE mission_custody_cases
    SET status='cancelled',distribution_status='cancelled',resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=? AND status IN ('awaiting_release','ready_to_transfer','awaiting_acceptance')
  `).bind(Number(companyId),Number(id)).run();
}


const custodyRepo=Object.freeze({findOpenCase,createCase,markReleased,markAwaitingAcceptance,resolveCase,updateRouting,setDistributionStatus,bindRecipient,findDistributionCase,findAwaitingAcceptanceForActor,cancelCase});

async function resolveCurrentCustodyHolder(env,companyId,missionId){
  const [row,shared]=await Promise.all([
    env.DB.prepare(`SELECT id,company_id,status,public_enabled FROM missions WHERE company_id=? AND id=? LIMIT 1`).bind(Number(companyId),Number(missionId)).first(),
    env.DB.prepare(`SELECT access_company_id FROM mission_tenant_access WHERE owner_company_id=? AND mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`).bind(Number(companyId),Number(missionId)).first()
  ]);
  if(!row)return null;
  const assignment=(await env.DB.prepare(`SELECT assignment_type,assignee_type,assignee_id,assignee_company_id FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`).bind(Number(companyId),Number(missionId)).first());
  const assignmentCount=Number((await env.DB.prepare(`SELECT COUNT(*) count FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active'`).bind(Number(companyId),Number(missionId)).first())?.count||0);
  const sharedTenantId=Number(shared?.access_company_id||0)||null;
  if(assignmentCount>1){
    const rows=(await env.DB.prepare(`SELECT assignment_type,assignee_type,assignee_id,assignee_company_id FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC`).bind(Number(companyId),Number(missionId)).all()).results||[];
    return Object.freeze({resolved:false,reason:'conflicting_execution_owners',missionId:Number(missionId),companyId:Number(companyId),status:String(row.status||''),executionOwners:rows.map(x=>({kind:String(x.assignment_type),id:Number(x.assignee_id||0)||null})).filter(x=>x.id),executorCount:rows.filter(x=>String(x.assignment_type)==='executor').length,sharedTenantCount:rows.filter(x=>String(x.assignment_type)==='tenant_driver').length});
  }
  if(assignment?.assignment_type==='owner_driver')return Object.freeze({resolved:true,type:'driver',id:Number(assignment.assignee_id),tenantId:Number(assignment.assignee_company_id||companyId),source:'mission_assignments'});
  if(assignment?.assignment_type==='executor')return Object.freeze({resolved:true,type:'executor',id:Number(assignment.assignee_id),tenantId:Number(assignment.assignee_company_id||companyId),source:'mission_assignments'});
  if(assignment?.assignment_type==='tenant_driver')return Object.freeze({resolved:true,type:'driver',id:Number(assignment.assignee_id),tenantId:Number(assignment.assignee_company_id||0)||null,source:'mission_assignments'});
  if(sharedTenantId)return Object.freeze({resolved:true,type:'tenant',id:sharedTenantId,tenantId:sharedTenantId,source:'mission_tenant_access'});
  return Object.freeze({resolved:false,reason:'no_execution_holder',missionId:Number(missionId),companyId:Number(companyId),status:String(row.status||'')});
}

export function custodyPolicy({flow={},session={},openCase=null,mission=null}={}){
  const status=String(flow.status||"");
  const custodyActive=["PickedUp","InTransit"].includes(status);
  const blocked=flow.readiness?.state==="BLOCKED";
  const reasonCodes=new Set((flow.readiness?.blockers||[]).map(x=>x.code));
  const executionProblem=[...reasonCodes].some(x=>["assigned_driver_unavailable","assigned_executor_unavailable"].includes(x));
  const incomingCustody=Boolean(session.role==="admin"&&mission?.custody_recipient_pending&&Number(mission?.custody_recipient_tenant_id||0)===Number(session.tenantId||0));
  const owner=session.role==="admin"&&Boolean(flow.viewer?.isOwner)&&!incomingCustody;
  const responsibleTenant=session.role==="admin"&&Boolean(flow.viewer?.isExecutingTenant)&&Number(flow.ownership?.sharedTenantId||0)===Number(session.tenantId||0)&&!incomingCustody;
  // The owner may reclaim physical custody from a shared/external executor.
  // The executing tenant may coordinate custody only inside its own driver pool.
  const canCoordinate=Boolean(owner||responsibleTenant);
  const ownerCanUseExternalRoutes=Boolean(owner);

  return Object.freeze({
    custodyActive,
    required:Boolean(custodyActive&&blocked&&executionProblem),
    ownerCanOpen:Boolean(owner&&custodyActive&&!openCase),
    responsibleTenantCanOpen:Boolean(responsibleTenant&&custodyActive&&!openCase),
    ownerCanRoute:Boolean(owner&&custodyActive&&openCase?.status==="ready_to_transfer"),
    responsibleTenantCanRoute:Boolean(responsibleTenant&&custodyActive&&openCase?.status==="ready_to_transfer"),
    ownerCanFinalize:Boolean(owner&&openCase?.status==="ready_to_transfer"),
    responsibleTenantCanFinalize:Boolean(responsibleTenant&&openCase?.status==="ready_to_transfer"),
    canCoordinate,
    ownerCanUseExternalRoutes,
    recipientTenantCanReassign:Boolean((responsibleTenant||incomingCustody)&&openCase?.status==="awaiting_acceptance"&&openCase?.recipient_type==="tenant"&&Number(openCase?.recipient_id||0)===Number(session.tenantId||0)&&openCase?.target_type==="driver"),
    recipientTenantCanAcceptNetwork:Boolean(incomingCustody&&openCase?.status==="ready_to_transfer"&&openCase?.transfer_channel==="network"&&openCase?.recipient_type==="tenant"&&Number(openCase?.recipient_id||0)===Number(session.tenantId||0)),
    custodyRecipientPending:incomingCustody,
    custodyInvitationId:Number(mission?.custody_invitation_id||0)||null,
    currentCase:openCase||null
  });
}



export async function openCustodyTransfer(env,session,missionId,{
  channel="driver",targetDriverId=null,recipientType=null,recipientId=null,note="",recovery=false
}={}){
  await requireWorkTrust(env,session);
  if(session.role!=="admin")throw make("Only a tenant administrator can coordinate custody transfer",403);
  const access=await resolveMissionAccess(env,session,Number(missionId));
  if(!access)throw make("Mission access denied",403);
  const mission=access.mission,status=String(mission.status||"");
  const sharedResponsible=access.accessKind==="shared-tenant" && Number(mission.executing_tenant_id||0)===Number(session.tenantId);
  const ownerCoordinator=access.accessKind?.startsWith("owner");
  if(!ownerCoordinator&&!sharedResponsible)throw make("Only the mission owner or current executing tenant can coordinate custody transfer",403);
  if(!["PickedUp","InTransit"].includes(status))throw make("Custody transfer is only available while physical custody is active",409);

  const holderTruth=await canonicalCurrentCustodyHolder(env,Number(access.tenantId),Number(missionId));
  if(!holderTruth)throw make("Mission custody truth could not be loaded",409);
  if(holderTruth.reason==="conflicting_execution_owners")throw make("Mission has conflicting execution owners. Resolve ownership before transferring custody.",409);

  let holder=holderTruth.resolved?{type:holderTruth.type,id:holderTruth.id}:null;
  if(sharedResponsible && holder && Number(holderTruth.tenantId||0)!==Number(session.tenantId))throw make("Current custody holder is not controlled by this tenant",403);
  if(!holder&&recovery){
    const fallback=holderTruth.fallback||{type:"tenant",id:Number(access.tenantId)};
    holder={type:fallback.type,id:Number(fallback.id)};
  }
  if(!holder){
    if(holderTruth.reason==="shared_tenant_without_driver")throw make("The executing tenant has no physical driver assigned. Use Custodian Unreachable recovery to repair custody safely.",409);
    throw make("No active physical custody holder exists. Use Custodian Unreachable recovery to repair this mission.",409);
  }

  channel=String(channel||"driver").toLowerCase();
  if(!["driver","network","foryou"].includes(channel))throw make("Choose a valid custody handoff route",400);

  let targetType=null,targetId=null,validatedRecipientType=null,validatedRecipientId=null;
  if(sharedResponsible&&channel!=="driver")throw make("The executing tenant can only transfer custody between its own drivers",403);

  if(channel==="driver"){
    const targetTenantId=sharedResponsible?Number(session.tenantId):Number(access.tenantId);
    const target=await driverRepo.findActiveDriver(env,targetTenantId,Number(targetDriverId));
    if(!target)throw make("Choose an active driver for custody transfer",404);
    if(holder.type==="driver"&&Number(holder.id)===Number(targetDriverId))throw make("Choose a different driver",409);
    targetType="driver";targetId=Number(targetDriverId);
    if(sharedResponsible){ validatedRecipientType="tenant"; validatedRecipientId=Number(session.tenantId); }
  }else if(channel==="network"){
    validatedRecipientType=String(recipientType||"");
    validatedRecipientId=Number(recipientId||0);
    if(!["tenant","executor"].includes(validatedRecipientType)||!validatedRecipientId)throw make("Choose a trusted Network partner",400);
    if(validatedRecipientType==="tenant"){
      const trust=await networkRepo.findTenantTrust(env,Number(access.tenantId),validatedRecipientId);
      if(!trust||String(trust.status||"").toLowerCase()!=="trusted"||Number(trust.can_receive_missions||0)!==1)throw make("Trusted Network partner is no longer available",409);
    }else{
      const trust=await networkRepo.hasTrustedExecutor(env,Number(access.tenantId),validatedRecipientId);
      if(!trust)throw make("Trusted executor is no longer available",409);
    }
    targetType=validatedRecipientType;targetId=validatedRecipientId;
  }

  const existing=await custodyRepo.findOpenCase(env,Number(access.tenantId),missionId);
  if(existing){
    if(!["awaiting_release","ready_to_transfer"].includes(String(existing.status||"")))throw make("A custody handoff is already in progress",409);
    if(existing.status==="awaiting_release"&&(!matchesHolder(existing,holder)))throw make("Custody holder changed. Refresh mission truth.",409);

    if(existing.status==="ready_to_transfer"){
      await networkRepo.revokeOpenMissionInvitations(env,Number(access.tenantId),Number(missionId));
      await publicRepo.closePublicMarketplace(env,Number(access.tenantId),Number(missionId));
      await env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
        .bind(Number(missionId),Number(access.tenantId)).run();
    }

    if(existing.status==="awaiting_release"){
      await env.DB.prepare(`UPDATE mission_management_requirements SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND mission_id=? AND code='custody_release' AND status='open'`).bind(Number(access.tenantId),Number(missionId)).run();
    }
    await custodyRepo.updateRouting(env,Number(access.tenantId),existing.id,{
      transferChannel:channel,recipientType:validatedRecipientType,recipientId:validatedRecipientId,
      distributionStatus:null,targetType,targetId
    });
    if(existing.status==="awaiting_release"){
      await createRequirement(env,{companyId:Number(access.tenantId),missionId,code:"custody_release",actorType:holder.type,actorId:holder.id,requestedByRole:session.role,requestedByIdentityId:identityId(session),payload:{caseId:Number(existing.id),channel,targetDriverId:Number(targetDriverId||0)||null,recipientType:validatedRecipientType,recipientId:validatedRecipientId}});
      await notifyCustodyRelease(env,{companyId:Number(access.tenantId),missionId,caseId:Number(existing.id),holder,reference:mission.reference,targetType,targetId,channel});
    }
    await recordTransitionEvent(env,session,{companyId:Number(access.tenantId),missionId,eventType:"custody_handoff_rerouted",fromStatus:status,toStatus:status,reasonCode:"handoff_route_changed",metadata:{caseId:Number(existing.id),channel,targetType,targetId,currentHolderRetained:true}});
    return {caseId:Number(existing.id),status:String(existing.status),channel,rerouted:true,currentHolderRetained:true};
  }

  const caseId=await custodyRepo.createCase(env,{
    companyId:Number(access.tenantId),missionId,currentHolderType:holder.type,currentHolderId:holder.id,
    targetType,targetId,resolutionType:recovery?"return":"transfer",note,openedByIdentityId:identityId(session),
    transferChannel:channel,recipientType:validatedRecipientType,recipientId:validatedRecipientId
  });
  if(recovery){
    await custodyRepo.markReleased(env,Number(access.tenantId),caseId);
  }else{
    await createRequirement(env,{
      companyId:Number(access.tenantId),missionId,code:"custody_release",
      actorType:holder.type,actorId:holder.id,requestedByRole:session.role,requestedByIdentityId:identityId(session),
      payload:{caseId,channel,targetDriverId:Number(targetDriverId||0)||null,recipientType:validatedRecipientType,recipientId:validatedRecipientId}
    });
    await notifyCustodyRelease(env,{companyId:Number(access.tenantId),missionId,caseId,holder,reference:mission.reference,targetType,targetId,channel});
  }
  await messageRepo.insertMessage(env,{tenantId:Number(access.tenantId),missionId,senderRole:"system",message:
    recovery
      ?`${session.companyName||"Owning tenant"} opened custody recovery · current holder reported unreachable · responsibility remains until a verified receiver accepts custody`
      :`${session.companyName||"Owning tenant"} opened custody handoff · current holder must confirm readiness before execution can change`,messageType:"text"});
  await recordTransitionEvent(env,session,{companyId:Number(access.tenantId),missionId,eventType:recovery?"custody_recovery_opened":"custody_transfer_opened",fromStatus:status,toStatus:status,reasonCode:recovery?"custodian_unreachable":"execution_unavailable",metadata:{caseId,holder,holderSource:holderTruth.source||null,holderResolution:holderTruth.reason||"resolved",channel,targetType,targetId,currentHolderRetained:true}});
  await audit(env,{session,action:recovery?"mission.custody.recovery":"mission.custody.open",resourceType:"mission",resourceId:missionId,metadata:{caseId,channel,targetType,targetId}});
  return {caseId,status:recovery?"ready_to_transfer":"awaiting_release",channel,recovery:Boolean(recovery),currentHolderRetained:true};
}

export async function confirmCustodyRelease(env,session,missionId,{requirementId=null}={}){
  await requireWorkTrust(env,session);
  const access=await resolveMissionAccess(env,session,Number(missionId));
  if(!access)throw make("Mission access denied",403);
  const c=await custodyRepo.findOpenCase(env,Number(access.mission.company_id),missionId);
  if(!c||c.status!=="awaiting_release")throw make("No custody release is waiting",409);
  if(!matches(session,c.current_holder_type,c.current_holder_id))throw make("Only the current custody holder can confirm release",403);
  await custodyRepo.markReleased(env,Number(c.company_id),c.id);
  if(requirementId)await resolveRequirement(env,Number(c.company_id),missionId,Number(requirementId),{role:session.role,identityId:identityId(session)});
  await recordTransitionEvent(env,session,{companyId:Number(c.company_id),missionId,eventType:"custody_released",fromStatus:access.mission.status,toStatus:access.mission.status,reasonCode:"physical_handover_ready",metadata:{caseId:c.id,currentHolderRetained:true}});
  return {caseId:Number(c.id),status:"ready_to_transfer",currentHolderRetained:true};
}

export async function finalizeCustodyTransfer(env,session,missionId){
  await requireWorkTrust(env,session);
  if(session.role!=="admin")throw make("Only the responsible tenant can finalize custody transfer",403);
  const access=await resolveMissionAccess(env,session,Number(missionId));
  const sharedResponsible=access?.accessKind==="shared-tenant" && Number(access?.mission?.executing_tenant_id||0)===Number(session.tenantId);
  if(!access || (!access.accessKind?.startsWith("owner") && !sharedResponsible))throw make("Only the responsible tenant can finalize custody transfer",403);
  const c=await custodyRepo.findOpenCase(env,Number(access.tenantId),missionId);
  if(!c||c.status!=="ready_to_transfer")throw make("Custody is not ready to transfer",409);

  const channel=String(c.transfer_channel||"driver");
  if(channel==="driver"){
    if(c.target_type!=="driver"||!c.target_id)throw make("Choose a receiving driver",409);
    const targetTenantId=(String(c.recipient_type)==="tenant"&&Number(c.recipient_id||0))?Number(c.recipient_id):Number(access.tenantId);
    const target=await driverRepo.findActiveDriver(env,targetTenantId,Number(c.target_id));
    if(!target)throw make("Target driver is no longer active",409);

    // IMPORTANT: do not change execution ownership yet. The current holder remains
    // responsible until the receiving driver explicitly accepts physical custody.
    await custodyRepo.markAwaitingAcceptance(env,Number(c.company_id),c.id);
    await createCustodyAcceptanceRequirement(env,session,c,{actorType:"driver",actorId:Number(c.target_id)});
    await notifyCustodyAcceptance(env,{companyId:Number(c.company_id),missionId:Number(missionId),caseId:Number(c.id),recipientTenantId:targetTenantId,recipientDriverId:Number(c.target_id),reference:access.mission.reference});
    await recordTransitionEvent(env,session,{companyId:Number(access.tenantId),missionId,eventType:"custody_receiver_ready",fromStatus:access.mission.status,toStatus:access.mission.status,reasonCode:"new_driver_pending_acceptance",metadata:{caseId:c.id,channel,targetDriverId:Number(c.target_id)}});
    return {caseId:Number(c.id),status:"awaiting_acceptance",channel:"driver",driverId:Number(c.target_id),currentHolderRetained:true};
  }

  if(channel==="network"){
    if(!["tenant","executor"].includes(String(c.recipient_type||""))||!Number(c.recipient_id||0))throw make("Choose a trusted Network partner",409);
    // Keep current execution owner. Only create a pending receiving offer.
    await publicRepo.closePublicMarketplace(env,Number(access.tenantId),Number(missionId));
    await networkRepo.revokeOpenMissionInvitations(env,Number(access.tenantId),Number(missionId));
    const recipientType=String(c.recipient_type),recipientId=Number(c.recipient_id);
    const invitationId=await networkRepo.createMissionInvitation(env,{
      missionId:Number(missionId),ownerCompanyId:Number(access.tenantId),recipientType,
      recipientCompanyId:recipientType==="tenant"?recipientId:null,
      recipientExecutorId:recipientType==="executor"?recipientId:null,
      message:`Custody handoff for ${access.mission.reference||`Mission ${missionId}`}`
    });
    await custodyRepo.setDistributionStatus(env,Number(c.company_id),c.id,"network_pending");
    await messageRepo.insertMessage(env,{tenantId:Number(access.tenantId),missionId,senderRole:"system",message:"Custody handoff offered through Trusted Network · current holder remains responsible until the receiver accepts custody",messageType:"text"});
    await recordTransitionEvent(env,session,{companyId:Number(access.tenantId),missionId,eventType:"custody_distribution_started",fromStatus:access.mission.status,toStatus:access.mission.status,reasonCode:"network_handoff_pending",metadata:{caseId:c.id,invitationId,recipientType,recipientId,currentHolderRetained:true}});
    return {caseId:Number(c.id),status:"ready_to_transfer",channel:"network",distributionStatus:"network_pending",invitationId,currentHolderRetained:true};
  }

  if(channel==="foryou"){
    // Keep current execution owner while ForYou discovers a real receiver.
    await networkRepo.revokeOpenMissionInvitations(env,Number(access.tenantId),Number(missionId));
    await publicRepo.closePublicMarketplace(env,Number(access.tenantId),Number(missionId));
    await env.DB.prepare(`UPDATE missions SET public_enabled=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
      .bind(Number(missionId),Number(access.tenantId)).run();
    await custodyRepo.setDistributionStatus(env,Number(c.company_id),c.id,"foryou_published");
    await messageRepo.insertMessage(env,{tenantId:Number(access.tenantId),missionId,senderRole:"system",message:"Custody handoff published to ForYou · current holder remains responsible until a receiving driver or executor accepts custody",messageType:"text"});
    await recordTransitionEvent(env,session,{companyId:Number(access.tenantId),missionId,eventType:"custody_distribution_started",fromStatus:access.mission.status,toStatus:access.mission.status,reasonCode:"foryou_handoff_pending",metadata:{caseId:c.id,currentHolderRetained:true}});
    return {caseId:Number(c.id),status:"ready_to_transfer",channel:"foryou",distributionStatus:"foryou_published",currentHolderRetained:true};
  }

  throw make("Unsupported custody handoff route",409);
}
export async function activateExternalCustodyRecipient(env,session,missionId,{
  ownerCompanyId=null,recipientType,recipientId,driverId=null
}={}){
  const companyId=Number(ownerCompanyId||0);
  if(!companyId)throw make("Custody owner context is missing",409);
  const c=await custodyRepo.findDistributionCase(env,companyId,missionId);
  if(!c)return null;

  const type=String(recipientType||""),rid=Number(recipientId||0);
  if(!["tenant","executor"].includes(type)||!rid)throw make("Invalid custody recipient",400);

  if(String(c.transfer_channel)==="network"){
    if(String(c.recipient_type)!==type||Number(c.recipient_id)!==rid)throw make("Custody handoff recipient does not match the approved Network route",409);
  }
  if(String(c.transfer_channel)==="foryou"&&String(c.distribution_status)!=="foryou_published")throw make("ForYou custody handoff is not available",409);

  if(type==="executor"){
    await custodyRepo.updateRouting(env,Number(c.company_id),c.id,{
      transferChannel:String(c.transfer_channel||"foryou"),recipientType:"executor",recipientId:rid,
      targetType:"executor",targetId:rid,distributionStatus:String(c.distribution_status||"")
    });
    await custodyRepo.bindRecipient(env,Number(c.company_id),c.id,{targetType:"executor",targetId:rid,distributionStatus:"awaiting_acceptance",awaitAcceptance:true});
    const bound={...c,recipient_type:"executor",recipient_id:rid,target_type:"executor",target_id:rid};
    await createCustodyAcceptanceRequirement(env,session,bound,{actorType:"executor",actorId:rid});
    return {caseId:Number(c.id),recipientType:type,recipientId:rid,status:"awaiting_acceptance",currentHolderRetained:true};
  }

  const receivingDriverId=Number(driverId||0);
  if(!receivingDriverId)throw make("Choose the driver who will receive custody before accepting this handoff",409);
  const driver=await driverRepo.findActiveDriver(env,rid,receivingDriverId);
  if(!driver)throw make("Receiving driver is not active in the selected tenant",409);

  await custodyRepo.updateRouting(env,Number(c.company_id),c.id,{
    transferChannel:String(c.transfer_channel||"foryou"),recipientType:"tenant",recipientId:rid,
    targetType:"driver",targetId:receivingDriverId,distributionStatus:String(c.distribution_status||"")
  });
  await custodyRepo.bindRecipient(env,Number(c.company_id),c.id,{targetType:"driver",targetId:receivingDriverId,distributionStatus:"awaiting_acceptance",awaitAcceptance:true});
  const bound={...c,recipient_type:"tenant",recipient_id:rid,target_type:"driver",target_id:receivingDriverId};
  await createCustodyAcceptanceRequirement(env,session,bound,{actorType:"driver",actorId:receivingDriverId});
  return {caseId:Number(c.id),recipientType:type,recipientId:rid,driverId:receivingDriverId,status:"awaiting_acceptance",currentHolderRetained:true};
}

export async function abortCustodyTransfer(env,session,missionId){
  await requireWorkTrust(env,session);
  if(session.role!=="admin")throw make("Only the responsible tenant can recover a custody handoff",403);
  const access=await resolveMissionAccess(env,session,Number(missionId));
  const sharedResponsible=access?.accessKind==="shared-tenant" && Number(access?.mission?.executing_tenant_id||0)===Number(session.tenantId);
  const incomingRecipient=access?.accessKind==="custody-recipient" && Number(access?.mission?.custody_recipient_tenant_id||0)===Number(session.tenantId);
  if(!access || (!access.accessKind?.startsWith("owner") && !sharedResponsible && !incomingRecipient))throw make("Only an authorized custody tenant can cancel this handoff",403);
  const c=await custodyRepo.findOpenCase(env,Number(access.tenantId),missionId);
  if(!c)throw make("No open custody handoff exists",409);
  if(incomingRecipient && !(String(c.recipient_type)==="tenant" && Number(c.recipient_id)===Number(session.tenantId)))throw make("This custody handoff is not assigned to your receiving tenant",403);

  await networkRepo.revokeOpenMissionInvitations(env,Number(access.tenantId),Number(missionId));
  await publicRepo.closePublicMarketplace(env,Number(access.tenantId),Number(missionId));
  if(!incomingRecipient){
    await env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
      .bind(Number(missionId),Number(access.tenantId)).run();
    await env.DB.prepare(`UPDATE mission_tenant_access SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE owner_company_id=? AND mission_id=? AND status='active'`).bind(Number(access.tenantId),Number(missionId)).run();
    await env.DB.batch(canonicalAssignmentRevokeStatements(env,{companyId:Number(access.tenantId),missionId:Number(missionId),reason:'custody_transfer_aborted'}));
  }
  await custodyRepo.cancelCase(env,Number(c.company_id),c.id);
  await env.DB.prepare(`
    UPDATE mission_management_requirements
    SET status='resolved',resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND mission_id=? AND status='open' AND code IN ('custody_release','custody_acceptance')
  `).bind(Number(access.tenantId),Number(missionId)).run();

  await recordTransitionEvent(env,session,{companyId:Number(access.tenantId),missionId,eventType:"custody_transfer_aborted",fromStatus:access.mission.status,toStatus:access.mission.status,reasonCode:"owner_recovery",metadata:{caseId:Number(c.id),currentHolderRetained:true}});
  await messageRepo.insertMessage(env,{tenantId:Number(access.tenantId),missionId,senderRole:"system",message:"Custody handoff cancelled · current executor remains responsible",messageType:"text"});
  return {caseId:Number(c.id),status:"cancelled",currentHolderRetained:true};
}

export async function markCustodyDistributionRejected(env,companyId,missionId){
  const c=await custodyRepo.findDistributionCase(env,Number(companyId),Number(missionId));
  if(c&&c.status==="ready_to_transfer")await custodyRepo.setDistributionStatus(env,Number(c.company_id),c.id,"rejected");
}

export async function reassignReceivingDriver(env,session,missionId,{targetDriverId=null}={}){
  await requireWorkTrust(env,session);
  if(session.role!=="admin")throw make("Only a tenant admin can change the receiving driver",403);
  const access=await resolveMissionAccess(env,session,Number(missionId));
  if(!access)throw make("Mission access denied",403);
  const recipientTenant=Number(session.tenantId||0);
  const receivingTenantAuthorized=(access.accessKind==="shared-tenant" && Number(access.mission?.executing_tenant_id||0)===recipientTenant)
    || (access.accessKind==="custody-recipient" && Number(access.mission?.custody_recipient_tenant_id||0)===recipientTenant);
  if(!receivingTenantAuthorized){
    throw make("Only the responsible receiving tenant can change its receiving driver",403);
  }
  const c=await custodyRepo.findOpenCase(env,Number(access.tenantId),Number(missionId));
  if(!c || String(c.status)!=="awaiting_acceptance" || String(c.recipient_type)!=="tenant" || Number(c.recipient_id)!==recipientTenant){
    throw make("No active custody receiver can be changed for this tenant",409);
  }
  const newDriverId=Number(targetDriverId||0);
  if(!newDriverId)throw make("Choose an active receiving driver",400);
  if(String(c.target_type)!=="driver")throw make("Custody receiver is not a driver",409);
  if(Number(c.target_id)===newDriverId)throw make("Choose a different receiving driver",409);
  const driver=await driverRepo.findActiveDriver(env,recipientTenant,newDriverId);
  if(!driver)throw make("Receiving driver is no longer active",409);
  const oldRequirement=await findOpenRequirement(env,Number(c.company_id),Number(missionId),"custody_acceptance","driver",Number(c.target_id));
  const payload={caseId:Number(c.id),previousDriverId:Number(c.target_id),targetDriverId:newDriverId,recipientTenantId:recipientTenant};
  const statements=[];
  if(oldRequirement){
    statements.push(env.DB.prepare(`UPDATE mission_management_requirements SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'`).bind(Number(oldRequirement.id)));
  }
  statements.push(env.DB.prepare(`
    UPDATE mission_custody_cases
    SET target_type='driver',target_id=?,distribution_status='awaiting_acceptance',updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND id=? AND status='awaiting_acceptance' AND recipient_type='tenant' AND recipient_id=? AND target_type='driver' AND target_id=?
  `).bind(newDriverId,Number(c.company_id),Number(c.id),recipientTenant,Number(c.target_id)));
  const reqInsert=env.DB.prepare(`
    INSERT INTO mission_management_requirements(
      company_id,mission_id,code,requested_actor_type,requested_actor_id,requested_by_role,requested_by_identity_id,payload_json
    ) VALUES(?,?,?,?,?,?,?,?)
  `).bind(Number(c.company_id),Number(missionId),"custody_acceptance","driver",newDriverId,"admin",identityId(session),JSON.stringify(payload));
  statements.push(reqInsert);
  await env.DB.batch(statements);
  await notificationRepo.insertNotification(env,{
    recipientRole:"driver",recipientTenantId:recipientTenant,recipientDriverId:newDriverId,missionId:Number(missionId),missionOwnerCompanyId:Number(c.company_id),
    type:"custody_acceptance_required",title:"Custody transfer reassigned",
    body:"You were selected as the new receiving driver. Open Custody to review and accept physical custody when it is actually in your possession.",
    link:"/app#work",priority:"high",dedupeKey:`custody-accept:${Number(c.id)}:driver:${newDriverId}`
  });
  await recordTransitionEvent(env,session,{companyId:Number(c.company_id),missionId,eventType:"custody_receiver_reassigned",fromStatus:"awaiting_acceptance",toStatus:"awaiting_acceptance",reasonCode:"responsible_tenant_changed_receiving_driver",metadata:{caseId:Number(c.id),previousDriverId:Number(c.target_id),targetDriverId:newDriverId,recipientTenantId:recipientTenant,currentHolderRetained:true}});
  await audit(env,{session,action:"mission.custody.receiver_reassigned",resourceType:"mission",resourceId:Number(missionId),metadata:{caseId:Number(c.id),previousDriverId:Number(c.target_id),targetDriverId:newDriverId,recipientTenantId:recipientTenant}});
  await messageRepo.insertMessage(env,{tenantId:Number(c.company_id),missionId:Number(missionId),senderRole:"system",message:`Receiving tenant changed the custody receiver · driver #${newDriverId} is now pending physical acceptance`,messageType:"text"});
  return {caseId:Number(c.id),status:"awaiting_acceptance",targetType:"driver",targetId:newDriverId,previousTargetId:Number(c.target_id),currentHolderRetained:true};
}

export async function acceptCustody(env,session,missionId,{requirementId=null}={}){
  await requireWorkTrust(env,session);

  const targetType=session.role==="driver"?"driver":session.role==="executor"?"executor":null;
  const targetId=session.role==="driver"?Number(session.driverId):session.role==="executor"?Number(session.executorId):0;
  if(!targetType||!targetId)throw make("Only the receiving driver or executor can accept custody",403);

  const c=await custodyRepo.findAwaitingAcceptanceForActor(env,missionId,{targetType,targetId});
  if(!c)throw make("No custody acceptance is waiting",409);

  if(targetType==="driver"){
    const expectedTenant=String(c.recipient_type||"")==="tenant"?Number(c.recipient_id):Number(c.company_id);
    if(Number(session.tenantId||0)!==expectedTenant)throw make("Custody acceptance does not belong to this driver tenant",403);
  }

  const holderTruth=await canonicalCurrentCustodyHolder(env,Number(c.company_id),Number(missionId));
  if(holderTruth?.resolved){
    if(String(holderTruth.type)!==String(c.current_holder_type)||Number(holderTruth.id)!==Number(c.current_holder_id)){
      throw make("Current custody responsibility changed. Refresh the mission before accepting this handoff.",409);
    }
  }else if(holderTruth?.reason==="conflicting_execution_owners"){
    throw make("Mission execution ownership is conflicted. Owner recovery is required before custody can be accepted.",409);
  }

  const mission=await missionRepo.findMission(env,Number(c.company_id),Number(missionId));
  if(!mission)throw make("Mission no longer exists",404);
  if(!["PickedUp","InTransit"].includes(String(mission.status||"")))throw make("Mission is no longer in an active custody state",409);

  const statements=[
    ...canonicalAssignmentRevokeStatements(env,{companyId:Number(c.company_id),missionId:Number(missionId),reason:'custody_acceptance'}),
    env.DB.prepare(`UPDATE mission_tenant_access SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE owner_company_id=? AND mission_id=? AND status='active'`)
      .bind(Number(c.company_id),Number(missionId)),
    env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(Number(missionId),Number(c.company_id))
  ];

  if(String(c.transfer_channel)==="driver"&&!c.recipient_type){
    statements.push(
      ...canonicalAssignmentStatements(env,{companyId:Number(c.company_id),missionId:Number(missionId),assignmentType:'owner_driver',assigneeType:'driver',assigneeId:Number(c.target_id),assigneeCompanyId:Number(c.company_id),sourceType:'custody_acceptance',sourceId:String(c.id)}),
      env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(Number(missionId),Number(c.company_id))
    );
  }else if(String(c.recipient_type)==="executor"){
    statements.push(
      ...canonicalAssignmentStatements(env,{companyId:Number(c.company_id),missionId:Number(missionId),assignmentType:'executor',assigneeType:'executor',assigneeId:Number(c.recipient_id),assigneeCompanyId:Number(c.company_id),sourceType:'custody_acceptance',sourceId:String(c.id)}),
    );
  }else if(String(c.recipient_type)==="tenant"){
    statements.push(
      ...canonicalAssignmentStatements(env,{companyId:Number(c.company_id),missionId:Number(missionId),assignmentType:'tenant_driver',assigneeType:'driver',assigneeId:Number(c.target_id),assigneeCompanyId:Number(c.recipient_id),sourceType:'custody_acceptance',sourceId:String(c.id)}),
      env.DB.prepare(`
        INSERT INTO mission_tenant_access(mission_id,owner_company_id,access_company_id,request_id,status,approved_at,created_at,updated_at)
        VALUES(?,?,?,NULL,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(mission_id,access_company_id) DO UPDATE SET
          status='active',approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      `).bind(Number(missionId),Number(c.company_id),Number(c.recipient_id)),
    );
  }else{
    throw make("Custody recipient is incomplete",409);
  }

  statements.push(
    env.DB.prepare(`
      UPDATE mission_custody_cases
      SET status='resolved',accepted_at=CURRENT_TIMESTAMP,resolved_at=CURRENT_TIMESTAMP,
          distribution_status='completed',updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND id=? AND status='awaiting_acceptance'
    `).bind(Number(c.company_id),Number(c.id)),
    env.DB.prepare(`
      UPDATE mission_management_requirements
      SET status='resolved',resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE company_id=? AND mission_id=? AND status='open' AND code IN ('custody_release','custody_acceptance')
    `).bind(Number(c.company_id),Number(missionId))
  );

  // D1 batch is the execution/custody commit boundary: the previous responsibility
  // is removed in the same database transaction that activates the new receiver.
  await env.DB.batch(statements);

  try{await publicRepo.closePublicMarketplace(env,Number(c.company_id),Number(missionId));}catch(error){throw authorityUnavailable('mission_marketplace_projection',error);}
  try{await networkRepo.revokeOpenMissionInvitations(env,Number(c.company_id),Number(missionId));}catch(error){throw authorityUnavailable('mission_network_projection',error);}

  if(requirementId){try{await resolveRequirement(env,Number(c.company_id),missionId,Number(requirementId),{role:session.role,identityId:identityId(session)});}catch(error){throw authorityUnavailable('mission_requirement_resolution',error);}}
  await recordTransitionEvent(env,session,{companyId:Number(c.company_id),missionId,eventType:"custody_accepted",fromStatus:mission.status,toStatus:mission.status,reasonCode:"handover_complete",metadata:{caseId:c.id,targetType:c.target_type,targetId:Number(c.target_id),recipientType:c.recipient_type,recipientId:c.recipient_id,atomicExecutionSwitch:true}});
  await messageRepo.insertMessage(env,{tenantId:Number(c.company_id),missionId,senderRole:"system",driverId:targetType==="driver"?targetId:null,message:
    `${session.driverName||session.displayName||"Receiving executor"} accepted custody · execution responsibility transferred`,messageType:"text"});
  return {caseId:Number(c.id),status:"resolved",executionTransferred:true};
}
async function createCustodyAcceptanceRequirement(env,session,c,{actorType,actorId}){
  await createRequirement(env,{
    companyId:Number(c.company_id),missionId:Number(c.mission_id),code:"custody_acceptance",actorType,actorId:Number(actorId),
    requestedByRole:session.role,requestedByIdentityId:identityId(session),payload:{caseId:Number(c.id)}
  });
  await notificationRepo.insertNotification(env,{
    recipientRole:actorType,
    recipientTenantId:actorType==="driver"?Number(c.recipient_type==="tenant"?c.recipient_id:c.company_id):null,
    recipientDriverId:actorType==="driver"?Number(actorId):null,
    recipientExecutorId:actorType==="executor"?Number(actorId):null,
    missionId:Number(c.mission_id),missionOwnerCompanyId:Number(c.company_id),
    type:"custody_acceptance_required",title:"Accept custody",
    body:"You were selected to physically receive this mission. Accept custody only after the freight is actually in your possession.",
    link:operationalMissionHref(c.mission_id,{role:actorType,view:"situation",context:"custody"}),priority:"high",
    dedupeKey:`custody-accept:${Number(c.id)}:${actorType}:${Number(actorId)}`
  });
}

async function notifyCustodyAcceptance(env,{companyId,missionId,caseId,recipientTenantId,recipientDriverId,reference}){
  const tenantId=Number(recipientTenantId||0)||null, driverId=Number(recipientDriverId||0)||null;
  if(!tenantId||!driverId)return;
  await notificationRepo.insertNotification(env,{
    recipientRole:"driver",recipientTenantId:tenantId,recipientDriverId:driverId,
    missionId:Number(missionId),missionOwnerCompanyId:Number(companyId),type:"custody_acceptance_required",
    title:"Custody transfer ready",
    body:`${reference||`Mission ${missionId}`} is ready for you to receive. Open your Custody Transfer workspace and accept physical custody when the freight is in your possession.`,
    link:"/app#work",priority:"high",
    dedupeKey:`custody-accept-ready:${Number(caseId)}:driver:${driverId}`
  });
}

async function notifyCustodyRelease(env,{companyId,missionId,caseId,holder,reference,targetType,targetId,channel}){
  if(!holder?.type||!holder?.id)return;
  const holderType=String(holder.type);
  if(holderType==="driver"){
    let tenantId=Number(holder.tenantId||0)||null;
    if(!tenantId){
      const row=await env.DB.prepare(`
        SELECT COALESCE(
          (SELECT assignee_company_id FROM mission_assignments WHERE company_id=? AND mission_id=? AND assignment_type='tenant_driver' AND assignee_type='driver' AND assignee_id=? AND status='active' ORDER BY id DESC LIMIT 1),
          (SELECT company_id FROM drivers WHERE id=? LIMIT 1),
          ?
        ) AS tenant_id
      `).bind(Number(companyId),Number(missionId),Number(holder.id),Number(holder.id),Number(companyId)).first();
      tenantId=Number(row?.tenant_id||0)||Number(companyId);
    }
    await notificationRepo.insertNotification(env,{
      recipientRole:"driver",recipientTenantId:tenantId,recipientDriverId:Number(holder.id),
      missionId:Number(missionId),missionOwnerCompanyId:Number(companyId),type:"custody_release_required",
      title:"Transfer custody requested",
      body:`${reference||`Mission ${missionId}`} custody transfer requested. Confirm that the freight is physically ready to be handed over.`,
      link:operationalMissionHref(missionId,{role:"driver"}),priority:"high",
      dedupeKey:`custody-release:${Number(caseId)}:driver:${Number(holder.id)}`
    });
    return;
  }
  if(holderType==="executor"){
    await notificationRepo.insertNotification(env,{
      recipientRole:"executor",recipientExecutorId:Number(holder.id),
      missionId:Number(missionId),missionOwnerCompanyId:Number(companyId),type:"custody_release_required",
      title:"Transfer custody requested",
      body:`${reference||`Mission ${missionId}`} custody transfer requested. Confirm that the freight is physically ready to be handed over.`,
      link:operationalMissionHref(missionId,{role:"executor"}),priority:"high",
      dedupeKey:`custody-release:${Number(caseId)}:executor:${Number(holder.id)}`
    });
  }
}

function matches(s,type,id){return (type==="driver"&&s.role==="driver"&&Number(s.driverId)===Number(id))||(type==="executor"&&s.role==="executor"&&Number(s.executorId)===Number(id));}
function matchesHolder(c,h){return String(c.current_holder_type)===String(h.type)&&Number(c.current_holder_id)===Number(h.id);}
function identityId(s){return Number(s.authIdentityId||s.userId||s.driverId||s.executorId||s.tenantId||0)||null;}




export async function assignExecutorToMission(env,{companyId,missionId,executorId,requestId}){
  await assertSingleExecutionOwner(env,companyId,missionId);
  return env.DB.batch([
    ...canonicalAssignmentStatements(env,{companyId,missionId,assignmentType:'executor',assigneeType:'executor',assigneeId:executorId,assigneeCompanyId:companyId,requestId,sourceType:'executor_assignment'}),
    env.DB.prepare(`UPDATE missions SET public_enabled=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(Number(missionId),Number(companyId))
  ]);
}
export async function assignTrustedExecutorToMission(env,{companyId,missionId,executorId,invitationId}){
  return env.DB.batch([
    ...canonicalAssignmentStatements(env,{companyId,missionId,assignmentType:'executor',assigneeType:'executor',assigneeId:executorId,assigneeCompanyId:companyId,sourceType:'trusted_executor',sourceId:String(invitationId||'')}),
    env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(Number(missionId),Number(companyId))
  ]);
}
export async function revokeMissionExecutorAssignment(env,companyId,missionId,executorId=null){
  return env.DB.batch(canonicalAssignmentRevokeStatements(env,{companyId,missionId,assignmentType:'executor',assigneeId:executorId,reason:'executor_revoked'}));
}
export async function removeMissionExecutorAssignment(env,companyId,missionId){
  return env.DB.batch(canonicalAssignmentRevokeStatements(env,{companyId,missionId,assignmentType:'executor',reason:'executor_removed'}));
}
export async function assignTenantDriver(env,{missionId,ownerCompanyId,accessCompanyId,driverId}){
  return env.DB.batch([
    ...canonicalAssignmentStatements(env,{companyId:ownerCompanyId,missionId,assignmentType:'tenant_driver',assigneeType:'driver',assigneeId:driverId,assigneeCompanyId:accessCompanyId,sourceType:'tenant_driver_assignment'}),
    env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(Number(missionId),Number(ownerCompanyId))
  ]);
}
export async function updateMissionAssignment(env,tenantId,missionId,{driverId=null,publicEnabled=false,publicDescription=""}={},mutationFence=null){
  return missionRepo.updateMissionAssignment(env,Number(tenantId),Number(missionId),{driverId:driverId==null?null:Number(driverId),publicEnabled:Boolean(publicEnabled),publicDescription:String(publicDescription||"")},mutationFence?.lockToken);
}
export async function withdrawForYouDistribution(env,session,missionId,mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  await requireWorkTrust(env,session); const tenantId=Number(session.tenantId);
  const mission=await missionRepo.findMission(env,tenantId,Number(missionId)); if(!mission)throw make("Mission not found",404);
  if(["Completed","Cancelled","Canceled"].includes(String(mission.status||"")))throw make("Closed missions cannot change distribution",409);
  const ownership=await assertSingleExecutionOwner(env,tenantId,Number(missionId)); if(ownership.ownerCount>0)throw make("Execution is already owned. Use Take Back Execution instead of withdrawing ForYou.",409);
  const activeCode=await canonicalFirst(env,`SELECT id FROM mission_access_codes WHERE mission_id=? AND owner_company_id=? AND status='active' LIMIT 1`,[Number(missionId),tenantId],'mission_access_code_authority');
  if(Number(mission.public_enabled||0)!==1&&!activeCode)return {missionId:Number(missionId),status:"already_withdrawn",alreadyApplied:true};
  await publicRepo.closePublicMarketplace(env,tenantId,Number(missionId));
  await revokeMissionAccessCode(env,{missionId:Number(missionId),ownerCompanyId:tenantId});
  await updateMissionAssignment(env,tenantId,Number(missionId),{driverId:null,publicEnabled:false,publicDescription:""},mutationFence);
  await recordTransitionEvent(env,session,{companyId:tenantId,missionId:Number(missionId),eventType:"foryou_withdrawn",fromStatus:mission.status,toStatus:mission.status,reasonCode:"owner_withdrew_distribution"});
  await audit(env,{session,action:"mission.foryou.withdraw",resourceType:"mission",resourceId:Number(missionId)});
  return {missionId:Number(missionId),status:"withdrawn",missionStatus:String(mission.status||"Pending"),assigned:false};
}

export async function assignmentState(env,session,missionId){
  ensureAdmin(session);
  const access=await resolveMissionAccess(env,session,missionId);
  if(!access || !["owner","shared-tenant","custody-recipient"].includes(access.accessKind))throw make("Mission not found or assignment not permitted",404);
  const state=buildAssignmentState(access.mission,{accessKind:access.accessKind});
  return {...state,missionId:Number(missionId),reference:access.mission.reference,ownerCompanyId:Number(access.tenantId),accessKind:access.accessKind};
}

export async function assignmentQueue(env,session,{limit=30}={}){
  ensureAdmin(session);
  const [owned,shared]=await Promise.all([
    missionRepo.listMissions(env,Number(session.tenantId),{activeOnly:true}),
    sharedRepo.listSharedMissionsForTenant(env,Number(session.tenantId),{activeOnly:true})
  ]);
  const items=[
    ...owned.map(m=>queueItem(m,"owner")),
    ...shared.map(m=>queueItem(m,"shared-tenant"))
  ].filter(x=>x.assignment.requiresAction)
   .sort((a,b)=>deadlineValue(a.mission)-deadlineValue(b.mission)||Number(b.mission.id)-Number(a.mission.id))
   .slice(0,Math.min(Math.max(Number(limit)||30,1),100));
  return {items,count:items.length};
}

export async function assignDriver(env,session,missionId,driverId,mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  await requireWorkTrust(env,session);ensureAdmin(session);
  const access=await resolveAdminAccess(env,session,missionId);
  if(["Completed","Cancelled","Canceled"].includes(String(access.mission.status||"")))throw make("Closed missions must be reactivated before assignment",409);
  const driver=await driverRepo.findActiveDriver(env,Number(session.tenantId),Number(driverId));
  if(!driver)throw make("Driver not found or inactive",404);
  const profile=await driverWorkspaceRepo.ensureProfile(env,Number(session.tenantId),Number(driverId));
  const eligibility=driverAssignmentEligibility({...driver,...profile},access.mission.status);
  if(!eligibility.allowed)throw make(eligibility.reason,409);

  if(access.accessKind==="shared-tenant"){
    await assignTenantDriver(env,{missionId:Number(missionId),ownerCompanyId:Number(access.tenantId),accessCompanyId:Number(session.tenantId),driverId:Number(driver.id)});
    await messageRepo.insertMessage(env,{tenantId:Number(access.tenantId),missionId:Number(missionId),senderRole:"system",message:`${session.companyName||"Approved logistics tenant"} assigned driver ${driver.name}`,messageType:"text"});
    await audit(env,{session,action:"assignment.driver.shared",resourceType:"mission",resourceId:Number(missionId),metadata:{driverId:Number(driver.id),ownerCompanyId:Number(access.tenantId)}});
  }else{
    const ownership=await assertSingleExecutionOwner(env,Number(access.tenantId),Number(missionId));
    if(ownership.executorId||ownership.sharedTenantId)throw make("Another execution owner is active. Take execution responsibility back before assigning a local driver.",409);
    await prepareExecutionTransition(env,session,access.mission,{reason:"assign_owner_driver",mutationFence});
    await closeInactiveDistributionSources(env,{ownerCompanyId:Number(access.tenantId),missionId:Number(missionId)});
    await removeMissionExecutorAssignment(env,Number(access.tenantId),Number(missionId));
    await missionRepo.updateMissionAssignment(env,Number(access.tenantId),Number(missionId),{driverId:Number(driver.id),publicEnabled:false,publicDescription:access.mission.public_description||""},mutationFence?.lockToken);
    await messageRepo.insertMessage(env,{tenantId:Number(access.tenantId),missionId:Number(missionId),senderRole:"system",message:`Admin assigned mission to ${driver.name}`,messageType:"text"});
    await audit(env,{session,action:"assignment.driver.owner",resourceType:"mission",resourceId:Number(missionId),metadata:{driverId:Number(driver.id)}});
  }

  const updated=await resolveAdminAccess(env,session,missionId);
  const ownerMission=await missionRepo.findMission(env,Number(updated.tenantId),Number(missionId));
  if(ownerMission)await notifyMissionAssigned(env,ownerMission);
  return {mission:updated.mission,assignment:buildAssignmentState(updated.mission,{accessKind:updated.accessKind})};
}


export async function reclaimExecution(env,session,missionId,{reason="tenant_driver_requested"}={},mutationFence=null){
  await requireWorkTrust(env,session);ensureAdmin(session);
  const access=await resolveAdminAccess(env,session,missionId);
  if(access.accessKind!=="owner")throw make("Only the owning tenant can reclaim execution responsibility",403);

  const mission=access.mission;
  const status=String(mission.status||"Pending");
  if(["Completed","Cancelled","Canceled"].includes(status))throw make("Closed missions cannot change execution responsibility",409);

  // Delivered is post-custody: the physical handover has already happened.
  // The owner may reclaim administrative completion responsibility without
  // rewinding the mission or inventing a custody transfer.
  if(status==="Delivered"){
    const ownership=await assertSingleExecutionOwner(env,Number(access.tenantId),Number(missionId));
    const from=ownership.executorId?"executor":ownership.sharedTenantId?"shared_tenant":null;
    const previousId=ownership.executorId||ownership.sharedTenantId||null;
    if(!from)throw make("This mission has no external execution owner to reclaim from",409);
    await closeExternalExecutionForOwner(env,{ownerCompanyId:Number(access.tenantId),missionId:Number(missionId)});
    const postOwnership=await assertSingleExecutionOwner(env,Number(access.tenantId),Number(missionId));
    if(postOwnership.ownerCount!==0)throw make("Execution reclaim did not return completion responsibility to the owner",409);
    await recordTransitionEvent(env,session,{
      companyId:Number(access.tenantId),missionId:Number(missionId),eventType:"execution_reclaimed",
      fromStatus:"Delivered",toStatus:"Delivered",reasonCode:reason,
      metadata:{from,previousId,to:"owner_completion",physicalCustodyChanged:false}
    });
    await messageRepo.insertMessage(env,{tenantId:Number(access.tenantId),missionId:Number(missionId),senderRole:"system",message:`${session.companyName||"Owning tenant"} took back completion responsibility after delivery`,messageType:"text"});
    await audit(env,{session,action:"assignment.execution.reclaimed_after_delivery",resourceType:"mission",resourceId:Number(missionId),metadata:{from,previousId,reason,status}});
    const updated=await resolveAdminAccess(env,session,missionId);
    return {mission:updated.mission,assignment:buildAssignmentState(updated.mission,{accessKind:updated.accessKind}),transition:{from,to:"owner_completion",previousId,reason,previousStatus:"Delivered",status:"Delivered",assigned:false,physicalCustodyChanged:false}};
  }

  await prepareExecutionTransition(env,session,mission,{reason:"reclaim_execution",mutationFence});
  const ownership=await assertSingleExecutionOwner(env,Number(access.tenantId),Number(missionId));
  const from=ownership.executorId?"executor":ownership.sharedTenantId?"shared_tenant":null;
  const previousId=ownership.executorId||ownership.sharedTenantId||null;
  if(!from)throw make("This mission has no external execution owner to reclaim from",409);

  // Once physical pickup occurred, execution ownership represents custody too.
  // A dedicated custody-transfer procedure is required after this point.
  if(["PickedUp","InTransit"].includes(status)){
    throw make("Execution cannot be reclaimed while physical custody is active. Resolve custody first.",409);
  }

  await closeExternalExecutionForOwner(env,{ownerCompanyId:Number(access.tenantId),missionId:Number(missionId)});
  await ensureOwnerUnassignedPending(env,{companyId:Number(access.tenantId),missionId:Number(missionId)});

  const postOwnership=await assertSingleExecutionOwner(env,Number(access.tenantId),Number(missionId));
  if(postOwnership.ownerCount!==0){
    throw make("Execution reclaim did not return the mission to an unassigned owner state",409);
  }

  await recordTransitionEvent(env,session,{
    companyId:Number(access.tenantId),missionId:Number(missionId),
    eventType:"execution_reclaimed",fromStatus:status,toStatus:"Pending",
    reasonCode:reason,metadata:{from,previousId,to:"owner_unassigned"}
  });

  const fromLabel=from==="executor"?"independent executor":"executing tenant";
  await messageRepo.insertMessage(env,{
    tenantId:Number(access.tenantId),missionId:Number(missionId),senderRole:"system",
    message:`${session.companyName||"Owning tenant"} reclaimed execution responsibility from the ${fromLabel}`,
    messageType:"text"
  });
  await audit(env,{
    session,action:"assignment.execution.reclaimed",resourceType:"mission",resourceId:Number(missionId),
    metadata:{from,previousId,reason,status}
  });

  const updated=await resolveAdminAccess(env,session,missionId);
  return {
    mission:updated.mission,
    assignment:buildAssignmentState(updated.mission,{accessKind:updated.accessKind}),
    transition:{
      from,to:"owner_unassigned",previousId,reason,
      previousStatus:status,status:"Pending",assigned:false
    }
  };
}

export async function publishToForYou(env,session,missionId,publicDescription="",mutationFence=null){
  if(mutationFence)await mutationFence.assert();
  await requireWorkTrust(env,session);
  await requireUserSituationAction(env,session,"share_foryou");ensureAdmin(session);
  const access=await resolveAdminAccess(env,session,missionId);
  if(access.accessKind!=="owner")throw make("Shared missions cannot be republished by the receiving tenant",403);
  if(["Completed","Cancelled","Canceled"].includes(String(access.mission.status||"")))throw make("Closed missions must be reactivated before publishing to ForYou",409);
  const ownership=await assertSingleExecutionOwner(env,Number(access.tenantId),Number(missionId));
  if(ownership.executorId||ownership.sharedTenantId)throw make("Take execution responsibility back before publishing this mission to ForYou",409);
  await prepareExecutionTransition(env,session,access.mission,{reason:"publish_foryou",mutationFence});
  await closeExternalExecutionForOwner(env,{ownerCompanyId:Number(access.tenantId),missionId:Number(missionId)});
  await closeInactiveDistributionSources(env,{ownerCompanyId:Number(access.tenantId),missionId:Number(missionId)});
  await missionRepo.updateMissionAssignment(env,Number(access.tenantId),Number(missionId),{driverId:null,publicEnabled:false,publicDescription:publicDescription||access.mission.public_description||"Private ForYou mission"},mutationFence?.lockToken);
  const accessCode=await issueMissionAccessCode(env,{missionId:Number(missionId),ownerCompanyId:Number(access.tenantId),identityId:session.identityId});
  await messageRepo.insertMessage(env,{tenantId:Number(access.tenantId),missionId:Number(missionId),senderRole:"system",message:"Mission is privately shared through a ForYou access code",messageType:"text"});
  await audit(env,{session,action:"assignment.foryou.private_share",resourceType:"mission",resourceId:Number(missionId),metadata:{codeVersion:accessCode.version,private:true}});
  const updated=await resolveAdminAccess(env,session,missionId);
  return {mission:updated.mission,assignment:buildAssignmentState(updated.mission,{accessKind:updated.accessKind}),forYou:{private:true,accessCode:accessCode.code,version:accessCode.version,expiresAt:accessCode.expiresAt||null}};
}

async function resolveAdminAccess(env,session,missionId){
  ensureAdmin(session);
  const access=await resolveMissionAccess(env,session,Number(missionId));
  if(!access||!["owner","shared-tenant"].includes(access.accessKind))throw make("Mission not found or assignment not permitted",404);
  return access;
}
function queueItem(mission,accessKind){return {mission,assignment:buildAssignmentState(mission,{accessKind}),accessKind};}
function deadlineValue(x){const n=Date.parse(x?.deadline_at_utc||"");return Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER;}
function ensureAdmin(session){if(session?.role!=="admin")throw make("FORBIDDEN",403);}



export async function executionOwnershipSnapshot(env,ownerCompanyId,missionId){
  const [mission,shared,assignments]=await Promise.all([
    missionRepo.findMission(env,Number(ownerCompanyId),Number(missionId)),
    activeTenantAccess(env,Number(ownerCompanyId),Number(missionId)),
    env.DB.prepare(`SELECT assignment_type,assignee_type,assignee_id,assignee_company_id FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC`).bind(Number(ownerCompanyId),Number(missionId)).all()
  ]);
  if(!mission)return null;

  const rows=assignments?.results||[];
  const ownerDriver=rows.find(x=>String(x.assignment_type)==='owner_driver');
  const executor=rows.find(x=>String(x.assignment_type)==='executor');
  const tenantDriver=rows.find(x=>String(x.assignment_type)==='tenant_driver');
  const localDriverId=Number(ownerDriver?.assignee_id||0)||null;
  const sharedTenantId=Number(shared?.access_company_id||tenantDriver?.assignee_company_id||0)||null;
  const executorId=Number(executor?.assignee_id||0)||null;
  const owners=[
    localDriverId&&{type:"owner_driver",id:localDriverId},
    sharedTenantId&&{type:"shared_tenant",id:sharedTenantId},
    executorId&&{type:"executor",id:executorId}
  ].filter(Boolean);

  return Object.freeze({
    mission,
    localDriverId,sharedTenantId,executorId,
    activeOwners:Object.freeze(owners),
    ownerCount:owners.length,
    marketplace:Boolean(Number(mission.public_enabled||0)===1)
  });
}

export async function assertSingleExecutionOwner(env,ownerCompanyId,missionId){
  const snap=await executionOwnershipSnapshot(env,ownerCompanyId,missionId);
  if(!snap)throw make("Mission not found",404);
  if(snap.ownerCount>1)throw make("Mission has conflicting execution owners and requires ownership repair",409);
  return snap;
}

export async function closeExternalExecutionForOwner(env,{ownerCompanyId,missionId}){
  const snap=await assertSingleExecutionOwner(env,ownerCompanyId,missionId);
  if(snap.executorId)await revokeMissionExecutorAssignment(env,ownerCompanyId,missionId,snap.executorId);
  if(snap.sharedTenantId)await revokeTenantAccess(env,{missionId,ownerCompanyId,accessCompanyId:snap.sharedTenantId});
  await publicRepo.revokeApprovedMissionRequests(env,ownerCompanyId,missionId);
  await networkRepo.revokeAcceptedMissionInvitation(env,ownerCompanyId,missionId);
  return snap;
}

export async function closeInactiveDistributionSources(env,{ownerCompanyId,missionId}){
  await publicRepo.closePublicMarketplace(env,ownerCompanyId,missionId);
  await networkRepo.revokeOpenMissionInvitations(env,ownerCompanyId,missionId);
}

export async function closeMarketplaceAfterApproval(env,{ownerCompanyId,missionId,approvedRequestId}){
  await missionRepo.updateMissionAssignment(env,Number(ownerCompanyId),Number(missionId),{
    driverId:null,publicEnabled:false,publicDescription:""
  });
  await publicRepo.closeOtherPendingRequests(env,ownerCompanyId,missionId,approvedRequestId);
}

export async function assertMarketplaceAvailableForApproval(env,ownerCompanyId,missionId){
  const snap=await assertSingleExecutionOwner(env,ownerCompanyId,missionId);
  if(!snap.marketplace)throw make("Mission is no longer available on ForYou",409);
  if(snap.ownerCount>0)throw make("Mission already has an active execution owner",409);
  if(String(snap.mission.status||"")!=="Pending")throw make("Mission is no longer available for assignment",409);
  return snap;
}

function make(message,status){const e=new Error(message);e.status=status;return e;}

async function activeTenantAccess(env,ownerCompanyId,missionId){
  return env.DB.prepare(`
    SELECT * FROM mission_tenant_access
    WHERE owner_company_id=? AND mission_id=? AND status='active'
    ORDER BY id DESC LIMIT 1
  `).bind(Number(ownerCompanyId),Number(missionId)).first();
}

async function revokeTenantAccess(env,{missionId,ownerCompanyId,accessCompanyId}){
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE mission_tenant_access
      SET status='revoked',updated_at=CURRENT_TIMESTAMP
      WHERE mission_id=? AND owner_company_id=? AND access_company_id=? AND status='active'
    `).bind(Number(missionId),Number(ownerCompanyId),Number(accessCompanyId)),
    ...canonicalAssignmentRevokeStatements(env,{companyId:Number(ownerCompanyId),missionId:Number(missionId),assignmentType:'tenant_driver',reason:'tenant_access_revoked'})
  ]);
}


export async function canonicalCurrentCustodyHolder(env,companyId,missionId){
  return resolveCurrentCustodyHolder(env,companyId,missionId);
}

export async function buildCanonicalCustodyResponsibility(env,ownerCompanyId,missionId){
  const snap=await executionOwnershipSnapshot(env,ownerCompanyId,missionId);
  if(!snap)return null;
  const custody=await canonicalCurrentCustodyHolder(env,ownerCompanyId,missionId);
  const activeResponsibility=snap.ownerCount===1 ? snap.activeOwners[0] : null;
  return Object.freeze({version:CANONICAL_CUSTODY_RESPONSIBILITY_VERSION,missionId:Number(missionId),ownerCompanyId:Number(ownerCompanyId),
    responsibility:Object.freeze({single:Boolean(activeResponsibility),actor:activeResponsibility||null,owners:Object.freeze(snap.activeOwners)}),
    custody:Object.freeze(custody||{resolved:false,reason:"no_execution_holder"}),
    conflict:Boolean(snap.ownerCount>1 || custody?.reason==="conflicting_execution_owners"),
    safety:Object.freeze({authoritative:true,changesResponsibility:true,changesCustody:true,requiresAuthorization:true,requiresCanonicalTransition:true})});
}

export function validateCanonicalCustodyResponsibility(c){
  const p=[];
  if(!c?.missionId)p.push("mission_id_missing");
  if(c?.conflict)p.push("conflicting_responsibility_or_custody");
  if(c?.safety?.authoritative!==true)p.push("authority_boundary_violation");
  if(c?.safety?.requiresAuthorization!==true)p.push("authorization_boundary_violation");
  return [...new Set(p)];
}


