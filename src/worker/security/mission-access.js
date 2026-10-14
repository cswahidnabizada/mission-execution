import * as missionRepo from "../repositories/mission.repository.js";
import * as executorRepo from "../repositories/executor.repository.js";
import * as sharedRepo from "../repositories/shared-mission.repository.js";
import { canViewMission } from "./permissions.js";

export async function resolveMissionAccess(env,session,missionId){
  if(!session)return null;

  if(session.role==="executor"){
    const mission=await executorRepo.findAssignedMission(env,Number(session.executorId),missionId);
    if(mission)return {mission,tenantId:Number(mission.company_id),accessKind:"executor"};
    const pendingNetwork=await env.DB.prepare(`
      SELECT m.*,c.name AS owner_company_name,ni.id AS network_invitation_id,
        ni.recipient_type,ni.recipient_executor_id,ni.status AS network_invitation_status,
        1 AS network_invitation_pending
      FROM network_mission_invitations ni
      JOIN mission_canonical_projection m ON m.id=ni.mission_id AND m.company_id=ni.owner_company_id
      JOIN companies c ON c.id=m.company_id
      WHERE ni.mission_id=? AND ni.recipient_type='executor'
        AND ni.recipient_executor_id=? AND ni.status='Pending'
      ORDER BY ni.id DESC LIMIT 1
    `).bind(Number(missionId),Number(session.executorId)).first();
    if(pendingNetwork)return {mission:pendingNetwork,tenantId:Number(pendingNetwork.company_id),accessKind:"pending-network"};
    const pendingForYou=await env.DB.prepare(`
      SELECT m.*,c.name AS owner_company_name,r.id AS foryou_request_id,
        r.status AS foryou_request_status,r.requester_type,r.executor_id,
        1 AS foryou_request_pending
      FROM public_mission_requests r
      JOIN mission_canonical_projection m ON m.id=r.mission_id AND m.company_id=r.company_id
      JOIN companies c ON c.id=m.company_id
      WHERE r.mission_id=? AND r.requester_type='executor'
        AND r.executor_id=? AND r.status='Pending'
      ORDER BY r.id DESC LIMIT 1
    `).bind(Number(missionId),Number(session.executorId)).first();
    if(pendingForYou)return {mission:pendingForYou,tenantId:Number(pendingForYou.company_id),accessKind:"pending-foryou"};
    const pending=await pendingCustodyMission(env,missionId,"executor",Number(session.executorId),null);
    if(pending)return {mission:pending,tenantId:Number(pending.company_id),accessKind:"custody-recipient"};

    return null;
  }

  const sessionTenant=Number(session.tenantId);

  if(session.role==="admin"){
    const owned=await missionRepo.findMission(env,sessionTenant,missionId);
    if(owned&&canViewMission(session,owned)){
      return {mission:owned,tenantId:sessionTenant,accessKind:"owner"};
    }
    const incomingCustody=await env.DB.prepare(`
      SELECT m.*, c.name AS owner_company_name,
        ni.id AS custody_invitation_id,
        ni.recipient_company_id AS custody_recipient_tenant_id,
        cc.id AS custody_case_id,
        1 AS shared_access,
        1 AS custody_recipient_pending
      FROM mission_custody_cases cc
      JOIN mission_canonical_projection m ON m.id=cc.mission_id AND m.company_id=cc.company_id
      JOIN network_mission_invitations ni
        ON ni.mission_id=cc.mission_id
       AND ni.owner_company_id=cc.company_id
       AND ni.recipient_type='tenant'
       AND ni.recipient_company_id=cc.recipient_id
       AND ni.status IN ('Pending','Accepted')
      JOIN companies c ON c.id=m.company_id
      WHERE cc.mission_id=?
        AND cc.status IN ('ready_to_transfer','awaiting_acceptance')
        AND cc.transfer_channel='network'
        AND cc.distribution_status='network_pending'
        AND cc.recipient_type='tenant'
        AND cc.recipient_id=?
        AND EXISTS (
          SELECT 1 FROM network_tenant_trust nt
          WHERE nt.status='trusted'
            AND ((nt.company_a_id=m.company_id AND nt.company_b_id=?)
              OR (nt.company_b_id=m.company_id AND nt.company_a_id=?))
        )
      ORDER BY cc.id DESC, ni.id DESC LIMIT 1
    `).bind(Number(missionId),sessionTenant,sessionTenant,sessionTenant).first();
    if(incomingCustody){
      // The receiving tenant gets a tightly scoped read/selection window while the
      // Network custody offer is pending. This is not execution ownership and does
      // not grant owner-level mission authority.
      const ownerId=Number(incomingCustody.company_id);
      return {mission:incomingCustody,tenantId:ownerId,accessKind:"custody-recipient"};
    }
    const shared=await sharedRepo.findSharedMissionForTenant(env,sessionTenant,missionId);
    if(shared)return {mission:shared,tenantId:Number(shared.company_id),accessKind:"shared-tenant"};
    const recovered=await env.DB.prepare(`
      SELECT m.*, c.name AS owner_company_name,
        ni.id AS accepted_invitation_id, ni.recipient_company_id AS executing_tenant_id,
        (SELECT ec.name FROM companies ec WHERE ec.id=ni.recipient_company_id) AS executing_tenant_name,
        sd.assignee_id AS shared_driver_id, d.name AS shared_driver_name,
        sd.assignee_id AS executing_tenant_driver_id, d.name AS executing_tenant_driver_name,
        1 AS shared_access
      FROM network_mission_invitations ni
      JOIN mission_canonical_projection m ON m.id=ni.mission_id AND m.company_id=ni.owner_company_id
      JOIN companies c ON c.id=m.company_id
      LEFT JOIN mission_active_assignment_projection sd
        ON sd.mission_id=m.id AND sd.company_id=m.company_id AND sd.assignee_company_id=ni.recipient_company_id AND sd.assignment_type='tenant_driver' AND sd.assignee_type='driver'
      LEFT JOIN drivers d ON d.id=sd.assignee_id AND d.company_id=sd.assignee_company_id
      WHERE ni.mission_id=? AND ni.recipient_type='tenant'
        AND ni.recipient_company_id=? AND ni.status='Accepted'
        AND EXISTS (
          SELECT 1 FROM network_tenant_trust nt
          WHERE nt.status='trusted'
            AND ((nt.company_a_id=m.company_id AND nt.company_b_id=ni.recipient_company_id)
              OR (nt.company_b_id=m.company_id AND nt.company_a_id=ni.recipient_company_id))
        )
      ORDER BY ni.id DESC LIMIT 1
    `).bind(Number(missionId),sessionTenant).first();
    if(recovered)return {mission:recovered,tenantId:Number(recovered.company_id),accessKind:"shared-tenant"};

    // Pending Network invitations are intentionally visible before acceptance so the
    // recipient can inspect the mission and make the invitation decision in the
    // Canonical Mission Workspace. This grants no owner/execution authority.
    const pendingNetwork=await env.DB.prepare(`
      SELECT m.*, c.name AS owner_company_name,
        ni.id AS network_invitation_id, ni.recipient_type, ni.recipient_company_id,
        ni.recipient_executor_id, ni.status AS network_invitation_status,
        1 AS network_invitation_pending
      FROM network_mission_invitations ni
      JOIN mission_canonical_projection m ON m.id=ni.mission_id AND m.company_id=ni.owner_company_id
      JOIN companies c ON c.id=m.company_id
      WHERE ni.mission_id=? AND ni.recipient_type='tenant'
        AND ni.recipient_company_id=? AND ni.status='Pending'
        AND EXISTS (
          SELECT 1 FROM network_tenant_trust nt
          WHERE nt.status='trusted'
            AND ((nt.company_a_id=m.company_id AND nt.company_b_id=ni.recipient_company_id)
              OR (nt.company_b_id=m.company_id AND nt.company_a_id=ni.recipient_company_id))
        )
      ORDER BY ni.id DESC LIMIT 1
    `).bind(Number(missionId),sessionTenant).first();
    if(pendingNetwork)return {mission:pendingNetwork,tenantId:Number(pendingNetwork.company_id),accessKind:"pending-network"};

    // Pending ForYou requests are also a legitimate mission context for the
    // requester. The requester may review/withdraw/continue through its own
    // request semantics, but never inherits owner authority.
    const pendingForYou=await env.DB.prepare(`
      SELECT m.*, c.name AS owner_company_name,
        r.id AS foryou_request_id, r.status AS foryou_request_status,
        r.requester_type, r.requester_company_id, r.executor_id,
        1 AS foryou_request_pending
      FROM public_mission_requests r
      JOIN mission_canonical_projection m ON m.id=r.mission_id AND m.company_id=r.company_id
      JOIN companies c ON c.id=m.company_id
      WHERE r.mission_id=? AND r.requester_type='tenant'
        AND r.requester_company_id=? AND r.status='Pending'
      ORDER BY r.id DESC LIMIT 1
    `).bind(Number(missionId),sessionTenant).first();
    if(pendingForYou)return {mission:pendingForYou,tenantId:Number(pendingForYou.company_id),accessKind:"pending-foryou"};

    // Public ForYou missions are intentionally open as a restricted discovery
    // context so an eligible requester can review the mission and initiate the
    // canonical request action. This is not execution access and never grants
    // owner/shared authority.
    const publicDiscovery=await env.DB.prepare(`
      SELECT m.*, c.name AS owner_company_name,
        NULL AS foryou_request_id, NULL AS foryou_request_status,
        NULL AS requester_type, NULL AS requester_company_id, NULL AS executor_id,
        0 AS foryou_request_pending,
        CASE WHEN EXISTS(SELECT 1 FROM mission_custody_cases cc WHERE cc.company_id=m.company_id AND cc.mission_id=m.id AND cc.transfer_channel='foryou' AND cc.status='ready_to_transfer' AND cc.distribution_status='foryou_published') THEN 1 ELSE 0 END AS custody_handoff
      FROM mission_canonical_projection m JOIN companies c ON c.id=m.company_id
      WHERE m.id=? AND m.public_enabled=1
        AND m.status NOT IN ('Completed','Cancelled','Canceled','Closed')
        AND m.status='Pending'
      LIMIT 1
    `).bind(Number(missionId)).first();
    if(publicDiscovery)return {mission:publicDiscovery,tenantId:Number(publicDiscovery.company_id),accessKind:"foryou-discovery"};

    return null;
  }

  if(session.role==="driver"){
    const owned=await missionRepo.findMission(env,sessionTenant,missionId);
    if(owned&&canViewMission(session,owned)){
      return {mission:owned,tenantId:sessionTenant,accessKind:"owner-driver"};
    }
    const shared=await sharedRepo.findSharedMissionForDriver(
      env,sessionTenant,Number(session.driverId),missionId
    );
    if(shared)return {mission:shared,tenantId:Number(shared.company_id),accessKind:"shared-driver"};

    const pending=await pendingCustodyMission(env,missionId,"driver",Number(session.driverId),sessionTenant);
    return pending?{mission:pending,tenantId:Number(pending.company_id),accessKind:"custody-recipient"}:null;
  }

  return null;
}

async function pendingCustodyMission(env,missionId,targetType,targetId,sessionTenant=null){
  return env.DB.prepare(`
    SELECT m.*,cc.id AS custody_case_id,1 AS custody_pending,
      cc.target_type AS custody_target_type,cc.target_id AS custody_target_id,
      cc.recipient_type AS custody_recipient_type,cc.recipient_id AS custody_recipient_id
    FROM mission_custody_cases cc
    JOIN mission_canonical_projection m ON m.id=cc.mission_id AND m.company_id=cc.company_id
    WHERE cc.mission_id=? AND cc.status='awaiting_acceptance'
      AND cc.target_type=? AND cc.target_id=?
      AND (
        ? IS NULL
        OR (cc.recipient_type='tenant' AND cc.recipient_id=?)
        OR (cc.recipient_type IS NULL AND cc.company_id=?)
      )
    ORDER BY cc.id DESC LIMIT 1
  `).bind(
    Number(missionId),String(targetType),Number(targetId),
    sessionTenant===null?null:Number(sessionTenant),
    sessionTenant===null?null:Number(sessionTenant),
    sessionTenant===null?null:Number(sessionTenant)
  ).first();
}
