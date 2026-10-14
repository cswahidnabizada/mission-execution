import * as missionRepo from "../../repositories/mission.repository.js";
import {initializeMissionLifecycle} from "../transitions/mission-transition.service.js";
import * as driverRepo from "../../repositories/driver.repository.js";
import * as messageRepo from "../../repositories/message.repository.js";
import * as fileRepo from "../../repositories/file.repository.js";
import * as publicRepo from "../../repositories/public.repository.js";
import { canViewMission } from "../../security/permissions.js";
import { audit } from "../../security/audit.js";
import * as executorRepo from "../../repositories/executor.repository.js";
import * as sharedRepo from "../../repositories/shared-mission.repository.js";
import * as driverWorkspaceRepo from "../../repositories/driver-workspace.repository.js";
import * as executorOperationalRepo from "../../repositories/executor-operational.repository.js";
import { resolveMissionAccess } from "../../security/mission-access.js";
import { requireWorkTrust } from "../verification/verification.service.js";
import {notifyMissionAssigned,notifyMissionUpdated,notifyTenantMissionStatus} from "../notifications/notifications.service.js";
import * as networkService from "../network/network.service.js";
import {assignDriver as engineAssignDriver,publishToForYou} from "../../extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {completionGate} from "../../extensions/completion-gate/completion-gate.service.js";
import {assertLifecycleTransition} from "../../security/sector-lifecycle.service.js";
import {assertStatusAuthority} from "./status-authority.js";
import {transitionMissionStatus} from "../transitions/mission-transition.service.js";
// Historical guard vocabulary: requireSubscriptionCapacity(env,session,"mission") and requireSubscriptionCapacity(env,session,"publicMission") are now enforced by requireUserSituationCapacity.
import {requireUserSituationCapacity,requireUserSituationAction} from "../../security/user-situation.service.js";
import {canonicalAll} from "../../core/canonical-db.js";
import {bindIdempotencyReference} from "../../security/idempotency.js";

export async function listForSession(env, session, filters = {}) {
  const tenantId = Number(session.tenantId);

  if (session.role === "admin") {
    const sourceLimit=Math.min(Math.max(Number(filters.limit)||20,1)+Math.min(Math.max(Number(filters.offset)||0,0),5000),501);
    const sourceFilters={...filters,activeOnly:Boolean(filters.activeOnly),offset:0,limit:sourceLimit};
    const [owned,shared,custodyPending]=await Promise.all([
      missionRepo.listMissions(env,tenantId,sourceFilters),
      sharedRepo.listSharedMissionsForTenant(env,tenantId,sourceFilters),
      canonicalAll(env,`SELECT m.*,cc.id AS custody_case_id,1 AS custody_pending,cc.target_type AS custody_target_type,cc.target_id AS custody_target_id,cc.recipient_type,cc.recipient_id FROM mission_custody_cases cc JOIN mission_canonical_projection m ON m.id=cc.mission_id AND m.company_id=cc.company_id WHERE cc.status='awaiting_acceptance' AND cc.recipient_type='tenant' AND cc.recipient_id=? ORDER BY cc.id DESC`,[tenantId],'mission.list.custody_tenant')
    ]);
    const byId=new Map();for(const row of [...owned,...shared])byId.set(Number(row.id),row);for(const row of custodyPending||[]){const id=Number(row.id);if(id&&!byId.has(id))byId.set(id,{...row,accessKind:"custody-recipient",source:"custody"});}let rows=[...byId.values()].sort((a,b)=>Date.parse(b.updated_at||b.created_at||0)-Date.parse(a.updated_at||a.created_at||0));
    if(filters.activeOnly)rows=rows.filter(isOperationalMission);
    if(filters.view==="foryou")rows=rows.filter(m=>Number(m.public_enabled||0)===1||Number(m.shared_access||0)===1);
    const start=Number(filters.offset||0);
    return filters.limit?rows.slice(start,start+filters.limit):rows.slice(start);
  }

  if (session.role === "executor") {
    const executorId=Number(session.executorId);
    const [assigned,incomingNetwork,publicOpportunities,custodyPending]=await Promise.all([
      executorRepo.listAssignedMissions(env,executorId,filters),
      networkService.incomingInvitations(env,session),
      publicRepo.listAvailablePublicMissions(env,session),
      canonicalAll(env,`SELECT m.*,cc.id AS custody_case_id,1 AS custody_pending,cc.target_type AS custody_target_type,cc.target_id AS custody_target_id FROM mission_custody_cases cc JOIN mission_canonical_projection m ON m.id=cc.mission_id AND m.company_id=cc.company_id WHERE cc.status='awaiting_acceptance' AND cc.target_type='executor' AND cc.target_id=? ORDER BY cc.id DESC`,[executorId],'mission.list.custody_executor')
    ]);

    // One mission must have one dashboard entry. Authoritative access precedence
    // is: active execution > pending Network > pending ForYou > public discovery.
    const byId=new Map();
    for(const row of assigned||[])byId.set(Number(row.id),{...row,accessKind:"executor",source:"assigned"});
    for(const row of custodyPending||[]){const id=Number(row.id||row.mission_id);if(!id||byId.has(id))continue;byId.set(id,{...row,id,accessKind:"custody-recipient",source:"custody",updated_at:row.updated_at||row.created_at});}
    for(const row of incomingNetwork||[]){
      const id=Number(row.mission_id||row.id);
      if(!id||byId.has(id))continue;
      byId.set(id,{...row,id,company_id:Number(row.owner_company_id||row.company_id||0),status:row.mission_status||row.status,updated_at:row.mission_updated_at||row.updated_at,state_version:row.mission_state_version||row.state_version,network_invitation_id:Number(row.id||0)||null,network_invitation_pending:1,accessKind:"pending-network",source:"network"});
    }
    for(const row of publicOpportunities||[]){
      const id=Number(row.id);
      if(!id||byId.has(id))continue;
      const pending=Number(row.executor_request_pending||0)===1;
      const active=Number(row.executor_access_active||0)===1;
      byId.set(id,{...row,accessKind:active?"executor":pending?"pending-foryou":"foryou-discovery",source:pending?"foryou-pending":"foryou"});
    }
    let rows=[...byId.values()].sort((a,b)=>Date.parse(b.updated_at||b.created_at||0)-Date.parse(a.updated_at||a.created_at||0));
    if(filters.activeOnly)rows=rows.filter(isOperationalMission);
    const start=Number(filters.offset||0);
    return filters.limit?rows.slice(start,start+filters.limit):rows.slice(start);
  }

  if (session.role === "driver") {
    const sourceLimit=Math.min(Math.max(Number(filters.limit)||20,1)+Math.min(Math.max(Number(filters.offset)||0,0),5000),501);
    const driverFilters={
      ...filters,
      driverId:Number(session.driverId),
      missionId:session.missionId?Number(session.missionId):(filters.missionId||0)
    };
    const sourceDriverFilters={...driverFilters,activeOnly:Boolean(filters.activeOnly),offset:0,limit:sourceLimit};
    const sourceSharedFilters={...filters,activeOnly:Boolean(filters.activeOnly),offset:0,limit:sourceLimit};
    const [owned,shared,custodyPending]=await Promise.all([
      missionRepo.listMissions(env,tenantId,sourceDriverFilters),
      sharedRepo.listSharedMissionsForDriver(env,tenantId,Number(session.driverId),sourceSharedFilters),
      canonicalAll(env,`SELECT m.*,cc.id AS custody_case_id,1 AS custody_pending,cc.target_type AS custody_target_type,cc.target_id AS custody_target_id FROM mission_custody_cases cc JOIN mission_canonical_projection m ON m.id=cc.mission_id AND m.company_id=cc.company_id WHERE cc.status='awaiting_acceptance' AND cc.target_type='driver' AND cc.target_id=? AND (cc.recipient_type IS NULL OR (cc.recipient_type='tenant' AND cc.recipient_id=?)) ORDER BY cc.id DESC`,[Number(session.driverId),tenantId],'mission.list.custody_driver')
    ]);
    let rows=[...owned,...shared].sort((a,b)=>Date.parse(b.updated_at||b.created_at||0)-Date.parse(a.updated_at||a.created_at||0));
    if(filters.activeOnly)rows=rows.filter(isOperationalMission);
    const start=Number(filters.offset||0);
    return filters.limit?rows.slice(start,start+filters.limit):rows.slice(start);
  }

  return [];
}

export async function getForSession(env, session, missionId) {
  const access=await resolveMissionAccess(env,session,missionId);
  return access?.mission||null;
}

export async function executionLocationForSession(env,session,missionId,{mission=null}={}){
  if(session.role!=="admin")return null;
  // Hot-path optimization: callers that already passed through getForSession can
  // provide the authoritative mission row and avoid a duplicate access lookup.
  const m=mission||((await resolveMissionAccess(env,session,missionId))?.mission);
  if(!m)return null;
  if(Number(m.assigned_executor_id||0)){
    const p=await executorOperationalRepo.getProfile(env,Number(m.assigned_executor_id));
    return p?{type:"executor",name:m.executor_name||"Executor",currentLocation:p.current_location||null,locationUpdatedAt:p.location_updated_at||null,situation:p.situation||"Available"}:null;
  }
  const shared=Number(m.shared_access||0)===1;
  const driverId=shared?Number(m.shared_driver_id||0):Number(m.owner_driver_id||0);
  const companyId=shared?Number(session.tenantId):Number(m.company_id||session.tenantId);
  if(!driverId)return null;
  const p=await driverWorkspaceRepo.getProfile(env,companyId,driverId);
  return p?{type:"driver",name:(shared?m.shared_driver_name:m.driver_name)||"Driver",currentLocation:p.current_location||null,locationUpdatedAt:p.location_updated_at||null,situation:p.situation||"Available"}:null;
}

export async function nextReference(env, session) {
  return missionRepo.peekNextMissionReference(env, Number(session.tenantId));
}

export async function createMission(env, session, data, idempotencyContext=null) {
  await requireWorkTrust(env,session);
  await requireUserSituationAction(env,session,"create_mission");
  await requireUserSituationCapacity(env,session,"mission");
  const tenantId = Number(session.tenantId);
  const reference = await missionRepo.allocateMissionReference(env, tenantId);
  if(idempotencyContext?.key){
    await bindIdempotencyReference(env,{...idempotencyContext,resourceReference:reference});
  }

  if(data.customerId){const customer=await networkService.customerForMission(env,session,data.customerId);if(!customer)throw bad("Customer not found in your tenant");}

  let driverId = null;
  let publicEnabled = false;

  if (data.missionType === "private") {
    // Intake creates the mission record first. Executor/driver assignment is the
    // next operational step and is intentionally handled by the secured
    // assignment service. This prevents intake from becoming coupled to
    // execution and allows Operations to hand the user into the next workspace.
    if (data.driverId) {
      const driver = await driverRepo.findActiveDriver(env, tenantId, data.driverId);
      if (!driver) throw bad("Driver not found or inactive");
      driverId = driver.id;
    }
  } else if (data.missionType === "public") {
    // Compatibility input only: 10.35.5 no longer exposes public discovery.
    // The mission remains private until the owner explicitly shares an access code.
    publicEnabled = false;
  } else if (data.missionType === "network") {
    if(!data.networkRecipientType||!data.networkRecipientId)throw bad("Choose a trusted network partner");
    await networkService.assertTrustedRecipient(env,session,data.networkRecipientType,data.networkRecipientId);
    publicEnabled = false;
  } else {
    throw bad("Invalid mission type");
  }

  let missionId;
  try {
    missionId = await missionRepo.insertMission(env, tenantId, {
      ...data, reference, driverId, publicEnabled
    });
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error?.message || ""))) {
      throw conflict("Mission reference collision. Please try again.");
    }
    throw error;
  }

  if(data.missionType==="network"){
    try{
      await networkService.inviteMission(env,session,missionId,data.networkRecipientType,data.networkRecipientId,data.networkMessage||"");
    }catch(error){
      try{await missionRepo.deleteMissionRow(env,tenantId,missionId);}catch{}
      throw error;
    }
  }

  await initializeMissionLifecycle(env,{companyId:tenantId,missionId,status:"Pending"});

  if (data.adminMessage) {
    await messageRepo.insertMessage(env, {
      tenantId, missionId, senderRole: "admin",
      message: data.adminMessage, messageType: "text"
    });
  }

  await audit(env, {
    session, action: "mission.create", resourceType: "mission",
    resourceId: missionId, metadata: { type: data.missionType, reference }
  });

  const created=await missionRepo.findMission(env, tenantId, missionId);
  if(created&&data.missionType==="private")await notifyMissionAssigned(env,created);
  return created;
}

export async function editMission(env, session, missionId, data, mutationFence=null) {
  await requireWorkTrust(env,session);
  const tenantId = Number(session.tenantId);
  const mission = await missionRepo.findMission(env, tenantId, missionId);
  if (!mission) throw notFound("Mission not found");
  if(["Completed","Cancelled","Canceled"].includes(String(mission.status||""))){
    throw conflict("Closed mission details cannot be edited. Reactivate a cancelled mission before editing it.");
  }
  if(data.customerId){const customer=await networkService.customerForMission(env,session,data.customerId);if(!customer)throw bad("Customer not found in your tenant");}

  await missionRepo.updateMissionDetails(env, tenantId, missionId, data, mutationFence?.lockToken);
  await messageRepo.insertMessage(env, {
    tenantId, missionId, senderRole: "system",
    message: "Admin updated mission details", messageType: "text"
  });
  await audit(env, {
    session, action: "mission.update", resourceType: "mission", resourceId: missionId
  });
  const updated=await missionRepo.findMission(env, tenantId, missionId);
  await notifyMissionUpdated(env,updated);
  return updated;
}

export async function changeAssignment(env,session,missionId,data,mutationFence=null){
  if(data.missionType==="private"){
    if(!data.driverId)throw bad("Private mission requires a driver");
    return (await engineAssignDriver(env,session,missionId,data.driverId,mutationFence)).mission;
  }
  if(data.missionType==="public"){
    return (await publishToForYou(env,session,missionId,data.publicDescription||"",mutationFence)).mission;
  }
  throw bad("Invalid mission type");
}

export async function getStatusHistory(env,session,missionId){
  const m=await getForSession(env,session,missionId);
  if(!m)return [];
  return missionRepo.listStatusHistory(env,missionId);
}

export async function changeStatus(env, session, missionId, status, mutationFence=null) {
  await requireWorkTrust(env,session);
  if(!["admin","driver","executor"].includes(session.role))throw forbidden("Not authorized for status updates");

  const access=await resolveMissionAccess(env,session,missionId);
  if(!access)throw forbidden("Not authorized for this mission");
  if(session.role==="admin"&&access.accessKind!=="owner")throw forbidden("Only the owning tenant can update mission status");

  const tenantId=Number(access.tenantId);
  const current=String(access.mission?.status||"Pending");

  assertStatusAuthority({session,access,nextStatus:status});

  // Safe replay: an already-applied status request is a no-op. Do not duplicate
  // status history, messages, notifications or audit effects.
  if(current===status){
    return {missionId:Number(missionId),status:current,message:"Mission status is already current",idempotent:true};
  }

  const custody=await env.DB.prepare(`
    SELECT id,status FROM mission_custody_cases
    WHERE company_id=? AND mission_id=? AND status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance')
    ORDER BY id DESC LIMIT 1
  `).bind(tenantId,Number(missionId)).first();
  if(custody)throw conflict("CUSTODY_RESOLUTION_REQUIRED");
  const lifecycleCheck=await assertLifecycleTransition(env,access.mission,current,status);
  if(status==="Delivered"&&Number(access.mission?.delivery_proof_required??1)===1){
    const proof=await fileRepo.findDeliveryProof(env,tenantId,missionId);
    if(!proof)throw conflict("DELIVERY_PROOF_REQUIRED");
  }
  if(status==="Completed"){
    const gate=await completionGate(env,{...access.mission,lifecycleDefinitionId:access.mission?.lifecycle_definition_id,sector_code:access.mission?.sector_code,targetStatus:status});
    if(!gate.allowed){
      const e=conflict("COMPLETION_GATE_BLOCKED");
      e.details={blockers:gate.blockers};
      throw e;
    }
  }
  let changed;
  try {
    changed=await transitionMissionStatus(env,{companyId:tenantId,missionId,expectedStatus:current,nextStatus:status,statements:[],lockToken:mutationFence?.lockToken});
  } catch (error) {
    if(Number(error?.status||0)===409) throw conflict("MISSION_CHANGED");
    throw error;
  }
  if(!changed.changed) throw conflict("MISSION_CHANGED");
  if(status==="Completed"){
    await messageRepo.resolveAttentionMessages(env,tenantId,missionId);
  }

  const labels={Pending:"Pending",Arrived:"Arrived",PickedUp:"Picked Up",InTransit:"In Transit",Delivered:"Delivered",Completed:"Completed"};
  const actor=session.role==="admin"?(session.displayName||"Tenant admin"):session.role==="executor"?(session.displayName||"Executor"):(session.driverName||"Driver");
  const text=`${actor} updated status to ${labels[status]||status}`;

  await messageRepo.insertMessage(env,{
    tenantId,missionId,senderRole:"system",
    driverId:session.role==="driver"?Number(session.driverId):null,
    message:text,messageType:"text"
  });

  await audit(env,{
    session:{...session,tenantId},
    action:"mission.status",resourceType:"mission",resourceId:missionId,metadata:{status,accessKind:access.accessKind}
  });
  const updated=await missionRepo.findMission(env,tenantId,missionId);
  if(updated&&session.role!=="admin")await notifyTenantMissionStatus(env,updated,status);

  return {missionId,status,message:text};
}

// Derived semantic memory is governed data: mission archival preserves it only under the canonical retention policy; physical disposition must remove its semantic projection/vector.
export async function deleteMission(env, session, missionId, mutationFence=null) {
  await requireWorkTrust(env,session);
  const tenantId=Number(session.tenantId);
  const mission=await missionRepo.findMission(env,tenantId,missionId);
  if(!mission)throw notFound("Mission not found");
  const files=await fileRepo.listMissionFileKeys(env,tenantId,missionId);
  const current=String(mission.status||"Pending");
  if(current==='Completed' || current==='Cancelled' || current==='Canceled'){
    throw conflict("Mission is already terminal. Use governed retention/data-control processes for disposition.");
  }
  if(files.length){
    const e=new Error("MISSION_ARCHIVE_FILE_REVIEW_REQUIRED");
    e.status=409;
    e.details={missionId,fileCount:files.length,policy:"canonical_file_governance"};
    throw e;
  }
  const lockToken=mutationFence?.lockToken||null;
  const transition=await transitionMissionStatus(env,{companyId:tenantId,missionId:Number(missionId),expectedStatus:current,nextStatus:'Cancelled',lockToken});
  if(!transition.changed)throw conflict("Mission changed before archival could be committed.");
  const result=await env.DB.prepare(`UPDATE missions SET archived_at=CURRENT_TIMESTAMP,archived_by_identity_id=?,archive_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='Cancelled'`).bind(Number(session.identityId||0)||null,'owner_archived',Number(missionId),tenantId).run();
  if(Number(result?.meta?.changes||0)!==1)throw conflict("Mission archival metadata could not be committed.");
  await env.DB.prepare(`INSERT INTO mission_lifecycle_events(company_id,mission_id,event_type,reason_code,note,actor_role,actor_identity_id,actor_name,previous_status,next_status) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(tenantId,Number(missionId),'cancelled','owner_archived','Mission archived through governed lifecycle disposition.',session.role,Number(session.identityId||0)||null,session.displayName||null,current,'Cancelled').run();
  await audit(env,{session,action:"mission.archive",resourceType:"mission",resourceId:missionId,metadata:{reference:mission.reference,files:files.length,policy:"governed_archive"}});
  return {missionId:Number(missionId),reference:mission.reference,archived:true,deleted:false,retention:"governed"};
}


function make(message, status) { const e = new Error(message); e.status = status; return e; }
const bad = m => make(m, 400);
const conflict = m => make(m, 409);
const notFound = m => make(m, 404);
const forbidden = m => make(m, 403);

function isOperationalMission(m){return !["Completed","Cancelled","Canceled"].includes(String(m?.status||""));}
