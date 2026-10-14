import {NETWORK_INVITATION_STATUS,assertNetworkInvitationStatus} from "../modules/network/network-status.contract.js";
import {canonicalAssignmentRevokeStatements} from "../security/mission-assignment-authority.service.js";
export async function summary(env,companyId){
  const [customers,tenants,executors,incoming,outgoing]=await Promise.all([
    count(env,`SELECT COUNT(*) c FROM network_customers WHERE company_id=? AND status='active'`,companyId),
    count(env,`SELECT COUNT(*) c FROM network_tenant_trust WHERE status='trusted' AND (company_a_id=? OR company_b_id=?)`,companyId,companyId),
    count(env,`SELECT COUNT(*) c FROM network_executor_trust WHERE company_id=? AND status='trusted'`,companyId),
    count(env,`SELECT COUNT(*) c FROM network_tenant_trust WHERE status='pending' AND requested_by_company_id!=? AND (company_a_id=? OR company_b_id=?)`,companyId,companyId,companyId),
    count(env,`SELECT COUNT(*) c FROM network_mission_invitations WHERE owner_company_id=? AND status='Pending'`,companyId)
  ]);
  return {customers,tenants,executors,incomingTrustRequests:incoming,outgoingMissionInvites:outgoing};
}
async function count(env,sql,...binds){const r=await env.DB.prepare(sql).bind(...binds).first();return Number(r?.c||0);}

export async function searchTenants(env,companyId,q=""){
  const like=`%${String(q||"").toLowerCase()}%`;
  const r=await env.DB.prepare(`
    SELECT c.id,c.name,
      nt.id AS trust_id,nt.status AS trust_status,nt.requested_by_company_id
    FROM companies c
    LEFT JOIN network_tenant_trust nt
      ON nt.company_a_id=MIN(c.id,?) AND nt.company_b_id=MAX(c.id,?)
    WHERE c.id!=? AND LOWER(c.name) LIKE ?
    ORDER BY CASE nt.status WHEN 'trusted' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,c.name ASC
    LIMIT 40
  `).bind(companyId,companyId,companyId,like).all();
  return r.results||[];
}

export async function findTenantTrust(env,companyId,partnerId){
  const a=Math.min(Number(companyId),Number(partnerId)),b=Math.max(Number(companyId),Number(partnerId));
  return env.DB.prepare(`SELECT * FROM network_tenant_trust WHERE company_a_id=? AND company_b_id=? LIMIT 1`).bind(a,b).first();
}

export async function requestTenantTrust(env,companyId,partnerId){
  const a=Math.min(Number(companyId),Number(partnerId)),b=Math.max(Number(companyId),Number(partnerId));
  await env.DB.prepare(`
    INSERT INTO network_tenant_trust(company_a_id,company_b_id,requested_by_company_id,status,created_at,updated_at)
    VALUES (?,?,?,'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(company_a_id,company_b_id) DO UPDATE SET
      requested_by_company_id=excluded.requested_by_company_id,status='pending',responded_at=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE network_tenant_trust.status IN ('rejected','suspended')
  `).bind(a,b,Number(companyId)).run();
  return findTenantTrust(env,companyId,partnerId);
}

export async function listTenantTrust(env,companyId,filters={}){
  const limit=Math.min(Math.max(Number(filters.limit)||200,1),200),offset=Math.min(Math.max(Number(filters.offset)||0,0),50000);
  const r=await env.DB.prepare(`
    SELECT nt.*,
      CASE WHEN nt.company_a_id=? THEN nt.company_b_id ELSE nt.company_a_id END AS partner_company_id,
      c.name AS partner_company_name
    FROM network_tenant_trust nt
    JOIN companies c ON c.id=CASE WHEN nt.company_a_id=? THEN nt.company_b_id ELSE nt.company_a_id END
    WHERE nt.company_a_id=? OR nt.company_b_id=?
    ORDER BY CASE nt.status WHEN 'pending' THEN 0 WHEN 'trusted' THEN 1 ELSE 2 END,nt.updated_at DESC
    LIMIT ? OFFSET ?
  `).bind(companyId,companyId,companyId,companyId,limit,offset).all();
  return r.results||[];
}

export async function updateTenantTrust(env,companyId,trustId,status){
  const row=await env.DB.prepare(`
    SELECT * FROM network_tenant_trust WHERE id=? AND (company_a_id=? OR company_b_id=?) LIMIT 1
  `).bind(trustId,companyId,companyId).first();
  if(!row)return null;
  await env.DB.prepare(`
    UPDATE network_tenant_trust SET status=?,responded_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).bind(status,trustId).run();
  return {...row,status};
}

export async function searchExecutors(env,companyId,q=""){
  const like=`%${String(q||"").toLowerCase()}%`;
  const r=await env.DB.prepare(`
    SELECT pei.id AS executor_id,pei.display_name,
      CASE WHEN net.status='trusted' THEN pei.email ELSE NULL END AS email,
      pep.registered_company_name,pep.company_category,pep.working_cities,pep.working_zip_codes,pep.vehicle_types,
      net.status AS trust_status
    FROM public_executor_identities pei
    JOIN public_executor_profiles pep ON pep.executor_id=pei.id
    LEFT JOIN network_executor_trust net ON net.company_id=? AND net.executor_id=pei.id
    WHERE pei.active=1 AND (
      LOWER(pei.display_name) LIKE ? OR LOWER(pei.email) LIKE ? OR
      LOWER(pep.registered_company_name) LIKE ? OR LOWER(pep.company_category) LIKE ?
    )
    ORDER BY CASE net.status WHEN 'trusted' THEN 0 ELSE 1 END,pep.registered_company_name ASC,pei.display_name ASC
    LIMIT 40
  `).bind(companyId,like,like,like,like).all();
  return r.results||[];
}

export async function trustExecutor(env,companyId,executorId,status="trusted"){
  await env.DB.prepare(`
    INSERT INTO network_executor_trust(company_id,executor_id,status,created_at,updated_at)
    VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id,executor_id) DO UPDATE SET status=excluded.status,updated_at=CURRENT_TIMESTAMP
  `).bind(companyId,executorId,status).run();
}

export async function listTrustedExecutors(env,companyId,filters={}){
  const limit=Math.min(Math.max(Number(filters.limit)||100,1),200),offset=Math.min(Math.max(Number(filters.offset)||0,0),50000);
  const r=await env.DB.prepare(`
    SELECT net.status,pei.id AS executor_id,pei.display_name,pei.email,
      pep.registered_company_name,pep.company_category,pep.working_cities,pep.working_zip_codes,pep.vehicle_types
    FROM network_executor_trust net
    JOIN public_executor_identities pei ON pei.id=net.executor_id AND pei.active=1
    JOIN public_executor_profiles pep ON pep.executor_id=pei.id
    WHERE net.company_id=? AND net.status='trusted'
    ORDER BY net.updated_at DESC
    LIMIT ? OFFSET ?
  `).bind(companyId,limit,offset).all();
  return r.results||[];
}

export async function createCustomer(env,companyId,d){
  const r=await env.DB.prepare(`
    INSERT INTO network_customers(company_id,company_name,contact_name,email,phone,address,customer_reference,notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(companyId,d.companyName,d.contactName||"",d.email||"",d.phone||"",d.address||"",d.customerReference||"",d.notes||"").run();
  return Number(r.meta.last_row_id);
}
export async function listCustomers(env,companyId,includeAll=false,filters={}){
  const limit=Math.min(Math.max(Number(filters.limit)||100,1),200),offset=Math.min(Math.max(Number(filters.offset)||0,0),50000);
  const sql=includeAll?`SELECT * FROM network_customers WHERE company_id=? ORDER BY company_name ASC,id DESC LIMIT ? OFFSET ?`:`SELECT * FROM network_customers WHERE company_id=? AND status='active' ORDER BY company_name ASC,id DESC LIMIT ? OFFSET ?`;
  const r=await env.DB.prepare(sql).bind(companyId,limit,offset).all();
  return r.results||[];
}
export async function updateCustomer(env,companyId,id,d){
  return env.DB.prepare(`UPDATE network_customers SET company_name=?,contact_name=?,email=?,phone=?,address=?,customer_reference=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='active'`).bind(d.companyName,d.contactName||"",d.email||"",d.phone||"",d.address||"",d.customerReference||"",d.notes||"",Number(id),Number(companyId)).run();
}
export async function deleteCustomer(env,companyId,id){
  const locations=await env.DB.prepare(`DELETE FROM network_customer_locations WHERE company_id=? AND customer_id=?`).bind(Number(companyId),Number(id)).run();
  const result=await env.DB.prepare(`DELETE FROM network_customers WHERE id=? AND company_id=? AND status='active'`).bind(Number(id),Number(companyId)).run();
  return {result,locations};
}
export async function archiveCustomer(env,companyId,id){
  return env.DB.prepare(`UPDATE network_customers SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(id,companyId).run();
}

export async function createMissionInvitation(env,d){
  const r=await env.DB.prepare(`
    INSERT INTO network_mission_invitations(
      mission_id,owner_company_id,recipient_type,recipient_company_id,recipient_executor_id,message,status,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,'Pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(d.missionId,d.ownerCompanyId,d.recipientType,d.recipientCompanyId||null,d.recipientExecutorId||null,d.message||"").run();
  return Number(r.meta.last_row_id);
}


export async function createMissionInvitationReplacingOwnerDriver(env,d){
  const revoke=canonicalAssignmentRevokeStatements(env,{companyId:d.ownerCompanyId,missionId:d.missionId,assignmentType:'owner_driver',assigneeId:d.previousDriverId,reason:'network_invitation'});
  const update=env.DB.prepare(`UPDATE missions SET public_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='Pending'`).bind(d.missionId,d.ownerCompanyId);
  const invitation=env.DB.prepare(`
    INSERT INTO network_mission_invitations(
      mission_id,owner_company_id,recipient_type,recipient_company_id,recipient_executor_id,message,status,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,'Pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(d.missionId,d.ownerCompanyId,d.recipientType,d.recipientCompanyId||null,d.recipientExecutorId||null,d.message||"");
  const result=await env.DB.batch([...revoke,update,invitation]);
  if(Number(result?.[revoke.length]?.meta?.changes||0)!==1)throw Object.assign(new Error("Mission assignment changed before Network sharing could begin"),{status:409});
  return Number(result?.[revoke.length+1]?.meta?.last_row_id||0);
}

export async function findMissionInvitation(env,id){
  return env.DB.prepare(`
    SELECT ni.*,m.reference,m.status AS mission_status,m.updated_at AS mission_updated_at,m.state_version AS mission_state_version,ca.assignee_id AS owner_driver_id,m.public_enabled,
      c.name AS owner_company_name,
      rc.name AS recipient_company_name,
      pei.display_name AS recipient_executor_name
    FROM network_mission_invitations ni
    JOIN mission_canonical_projection m ON m.id=ni.mission_id AND m.company_id=ni.owner_company_id
    LEFT JOIN mission_active_assignment_projection ca ON ca.mission_id=m.id AND ca.company_id=m.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.status='active'
    JOIN companies c ON c.id=ni.owner_company_id
    LEFT JOIN companies rc ON rc.id=ni.recipient_company_id
    LEFT JOIN public_executor_identities pei ON pei.id=ni.recipient_executor_id
    WHERE ni.id=? LIMIT 1
  `).bind(id).first();
}

export async function listIncomingInvitations(env,session,filters = {}){
  let where="",bind;
  if(session.role==="admin"){where="ni.recipient_type='tenant' AND ni.recipient_company_id=?";bind=Number(session.tenantId);}
  else if(session.role==="executor"){where="ni.recipient_type='executor' AND ni.recipient_executor_id=?";bind=Number(session.executorId);}
  else return [];
  const r=await env.DB.prepare(`
    SELECT ni.*,m.reference,m.pickup_company,m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_company,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,m.mission_date,
      m.pickup_time,m.delivery_time,m.deadline_at_utc,m.status AS mission_status,m.updated_at AS mission_updated_at,m.state_version AS mission_state_version,m.public_description,c.name AS owner_company_name,
      cc.id AS custody_case_id,cc.status AS custody_status,cc.transfer_channel AS custody_transfer_channel,
      cc.current_holder_type AS custody_current_holder_type,cc.current_holder_id AS custody_current_holder_id
    FROM network_mission_invitations ni
    JOIN mission_canonical_projection m ON m.id=ni.mission_id AND m.company_id=ni.owner_company_id
    LEFT JOIN mission_active_assignment_projection ca ON ca.mission_id=m.id AND ca.company_id=m.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.status='active'
    JOIN companies c ON c.id=ni.owner_company_id
    LEFT JOIN mission_custody_cases cc
      ON cc.company_id=ni.owner_company_id AND cc.mission_id=ni.mission_id
      AND cc.transfer_channel='network' AND cc.status='ready_to_transfer'
      AND cc.distribution_status='network_pending'
    WHERE ${where} AND ni.status='Pending' AND m.status NOT IN ('Completed','Cancelled','Canceled')
    ORDER BY ni.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(bind, Math.min(Math.max(Number(filters.limit)||100,1),201), Math.min(Math.max(Number(filters.offset)||0,0),50000)).all();
  return r.results||[];
}

export async function listNetworkMissions(env,companyId){
  const r=await env.DB.prepare(`
    SELECT m.*,c.name AS owner_company_name,'shared' AS network_role,
      a.status AS network_access_status
    FROM mission_tenant_access a
    JOIN mission_canonical_projection m ON m.id=a.mission_id AND m.company_id=a.owner_company_id
    JOIN companies c ON c.id=m.company_id
    WHERE a.access_company_id=? AND a.status='active'
      AND m.status NOT IN ('Completed','Cancelled','Canceled')
    UNION ALL
    SELECT m.*,c.name AS owner_company_name,'owned-invited' AS network_role,
      ni.status AS network_invitation_status
    FROM network_mission_invitations ni
    JOIN mission_canonical_projection m ON m.id=ni.mission_id AND m.company_id=ni.owner_company_id
    LEFT JOIN mission_active_assignment_projection ca ON ca.mission_id=m.id AND ca.company_id=m.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.status='active'
    JOIN companies c ON c.id=ni.owner_company_id
    WHERE ni.owner_company_id=? AND ni.status IN ('Pending','Accepted')
      AND m.status NOT IN ('Completed','Cancelled','Canceled')
    ORDER BY updated_at DESC
    LIMIT 60
  `).bind(companyId,companyId).all();
  return r.results||[];
}

export async function respondInvitation(env,id,status){
  const next=assertNetworkInvitationStatus(status);
  if(![NETWORK_INVITATION_STATUS.ACCEPTED,NETWORK_INVITATION_STATUS.REJECTED].includes(next)){
    const e=new Error(`Invitation response cannot transition Pending → ${next}`);
    e.status=409;
    throw e;
  }
  return env.DB.prepare(`
    UPDATE network_mission_invitations SET status=?,responded_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='Pending'
  `).bind(next,id).run();
}

export async function hasTrustedExecutor(env,companyId,executorId){
  return env.DB.prepare(`SELECT * FROM network_executor_trust WHERE company_id=? AND executor_id=? AND status='trusted' AND can_receive_missions=1 LIMIT 1`).bind(companyId,executorId).first();
}


export async function findActiveMissionInvitation(env,ownerCompanyId,missionId){
  return env.DB.prepare(`
    SELECT id,status,recipient_type,recipient_company_id,recipient_executor_id
    FROM network_mission_invitations
    WHERE owner_company_id=? AND mission_id=? AND status IN ('Pending','Accepted')
    ORDER BY id DESC LIMIT 1
  `).bind(Number(ownerCompanyId),Number(missionId)).first();
}


export async function searchCustomers(env,companyId,q="",includeAll=false){
  const like=`%${String(q||"").toLowerCase()}%`;
  const r=await env.DB.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM missions m WHERE m.company_id=c.company_id AND m.customer_id=c.id) AS mission_count,
      (SELECT MAX(m.mission_date) FROM missions m WHERE m.company_id=c.company_id AND m.customer_id=c.id) AS last_mission_date
    FROM network_customers c
    WHERE c.company_id=? AND (?=1 OR c.status='active') AND (
      LOWER(c.company_name) LIKE ? OR LOWER(COALESCE(c.contact_name,'')) LIKE ? OR
      LOWER(COALESCE(c.customer_reference,'')) LIKE ? OR LOWER(COALESCE(c.address,'')) LIKE ?
    )
    ORDER BY c.company_name ASC LIMIT 30
  `).bind(companyId,includeAll?1:0,like,like,like,like).all();
  return r.results||[];
}
export async function findCustomer(env,companyId,id){
  return env.DB.prepare(`SELECT * FROM network_customers WHERE company_id=? AND id=? AND status='active' LIMIT 1`).bind(companyId,id).first();
}
export async function findCustomerAny(env,companyId,id){
  return env.DB.prepare(`SELECT * FROM network_customers WHERE company_id=? AND id=? LIMIT 1`).bind(companyId,id).first();
}
export async function listCustomerLocations(env,companyId,customerId){
  const r=await env.DB.prepare(`SELECT * FROM network_customer_locations WHERE company_id=? AND customer_id=? AND active=1 ORDER BY label ASC,id DESC`).bind(companyId,customerId).all();
  return r.results||[];
}
export async function createCustomerLocation(env,companyId,customerId,d){
  const r=await env.DB.prepare(`INSERT INTO network_customer_locations(company_id,customer_id,label,company_name,address,access_from,access_to) VALUES(?,?,?,?,?,?,?)`).bind(companyId,customerId,d.label,d.companyName,d.address,d.accessFrom||null,d.accessTo||null).run();
  return Number(r.meta.last_row_id);
}

export async function revokeAcceptedMissionInvitation(env,ownerCompanyId,missionId){
  return env.DB.prepare(`
    UPDATE network_mission_invitations
    SET status='Cancelled',responded_at=COALESCE(responded_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
    WHERE owner_company_id=? AND mission_id=? AND status='Accepted'
  `).bind(Number(ownerCompanyId),Number(missionId)).run();
}

export async function revokeOpenMissionInvitations(env,ownerCompanyId,missionId){
  return env.DB.prepare(`
    UPDATE network_mission_invitations
    SET status='Cancelled',responded_at=COALESCE(responded_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
    WHERE owner_company_id=? AND mission_id=? AND status IN ('Pending','Accepted')
  `).bind(Number(ownerCompanyId),Number(missionId)).run();
}

export async function findPendingMissionInvitation(env,ownerCompanyId,missionId){
  return env.DB.prepare(`
    SELECT * FROM network_mission_invitations
    WHERE owner_company_id=? AND mission_id=? AND status='Pending'
    ORDER BY id DESC LIMIT 1
  `).bind(Number(ownerCompanyId),Number(missionId)).first();
}
export async function cancelPendingMissionInvitation(env,ownerCompanyId,missionId){
  return env.DB.prepare(`
    UPDATE network_mission_invitations
    SET status='Cancelled',responded_at=COALESCE(responded_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
    WHERE owner_company_id=? AND mission_id=? AND status='Pending'
  `).bind(Number(ownerCompanyId),Number(missionId)).run();
}
