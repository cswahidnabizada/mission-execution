import { json } from "../core/http.js";
import { requireAdmin, requireSession } from "../core/auth-session.js";
import { limitAction } from "../security/action-limit.js";

/* V2.3: read-only tenant custody workspace. Mutation remains exclusively in
 * mission-management/custody and therefore keeps the existing guarded flow. */
export function registerTenantCustodyRoutes(router){
  router.get("/api/custody/workspace", async ({request,env})=>{
    try{
      const session=await requireSession(request,env);
      if(!["admin","driver","executor"].includes(String(session.role||""))) return json({success:false,error:"Custody workspace is not available for this account"},403);
      await limitAction(env,session,"custody-workspace-read",{limit:60,windowSeconds:60});
      const tenantId=Number(session.tenantId||0);
      const role=String(session.role||"");
      const actorId=role==="driver"?Number(session.driverId||0):role==="executor"?Number(session.executorId||0):0;
      const rows=await env.DB.prepare(`
        SELECT c.id AS case_id,c.company_id AS owner_company_id,c.mission_id,c.status,c.current_holder_type,c.current_holder_id,
               c.target_type,c.target_id,c.transfer_channel,c.recipient_type,c.recipient_id,
               c.distribution_status,c.created_at,c.updated_at,m.reference,m.status AS mission_status,m.state_version,
               m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,
               (SELECT mta.access_company_id FROM mission_tenant_access mta WHERE mta.mission_id=m.id AND mta.owner_company_id=m.company_id AND mta.status='active' ORDER BY COALESCE(mta.approved_at,mta.updated_at,mta.created_at) DESC,mta.id DESC LIMIT 1) AS executing_tenant_id,
               CASE WHEN c.recipient_type='tenant' AND c.recipient_id=? THEN 1 ELSE 0 END AS is_recipient_tenant,
               CASE WHEN c.current_holder_type=? AND c.current_holder_id=? THEN 1 ELSE 0 END AS is_current_holder,
               CASE WHEN c.target_type=? AND c.target_id=? THEN 1 ELSE 0 END AS is_target_actor
        FROM mission_custody_cases c
        JOIN mission_canonical_projection m ON m.id=c.mission_id AND m.company_id=c.company_id
        WHERE c.status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance')
          AND (
            (?='admin' AND (c.company_id=? OR (c.recipient_type='tenant' AND c.recipient_id=?)))
            OR (?='driver' AND ((c.current_holder_type='driver' AND c.current_holder_id=?) OR (c.target_type='driver' AND c.target_id=?)))
            OR (?='executor' AND ((c.current_holder_type='executor' AND c.current_holder_id=?) OR (c.target_type='executor' AND c.target_id=?)))
          )
        ORDER BY CASE c.status WHEN 'awaiting_release' THEN 1 WHEN 'ready_to_transfer' THEN 2 WHEN 'awaiting_acceptance' THEN 3 ELSE 4 END,
                 datetime(COALESCE(c.updated_at,c.created_at)) DESC,c.id DESC
        LIMIT 100
      `).bind(
        tenantId,
        role,actorId,
        role,actorId,
        role,tenantId,tenantId,
        role,actorId,actorId,
        role,actorId,actorId
      ).all();
      const list=(rows?.results||[]).map(r=>({
        caseId:Number(r.case_id),ownerTenantId:Number(r.owner_company_id||0),missionId:Number(r.mission_id),reference:String(r.reference||`Mission ${r.mission_id}`),
        status:String(r.status||""),missionStatus:String(r.mission_status||""),stateToken:Number(r.state_version||0)>0?`v:${Number(r.state_version)}`:null,
        currentHolderType:String(r.current_holder_type||""),currentHolderId:Number(r.current_holder_id||0)||null,
        targetType:String(r.target_type||""),targetId:Number(r.target_id||0)||null,
        channel:String(r.transfer_channel||""),recipientType:r.recipient_type?String(r.recipient_type):null,recipientId:Number(r.recipient_id||0)||null,
        distributionStatus:r.distribution_status?String(r.distribution_status):null,
        isOwnerTenant:Number(r.owner_company_id||0)===tenantId,isRecipientTenant:Number(r.is_recipient_tenant)===1,isCurrentHolder:Number(r.is_current_holder)===1,isTargetActor:Number(r.is_target_actor)===1,
        executingTenantId:Number(r.executing_tenant_id||0)||null,pickupAddress:String(r.pickup_address||""),deliveryAddress:String(r.delivery_address||""),updatedAt:r.updated_at||r.created_at||null
      }));
      let drivers=[];
      if(role==="admin"){
        const d=await env.DB.prepare(`SELECT id,name,active FROM drivers WHERE company_id=? AND active=1 ORDER BY name COLLATE NOCASE ASC LIMIT 100`).bind(tenantId).all();
        drivers=(d.results||[]).map(x=>({id:Number(x.id),name:String(x.name||`Driver ${x.id}`),active:Number(x.active)===1}));
      }
      return json({success:true,version:"2.4",role,tenantId,cases:list,count:list.length,drivers});
    }catch(e){
      const status=Number(e?.status)||500;
      return json({success:false,error:status===500?"Custody workspace unavailable":e?.message||"Custody workspace unavailable"},status);
    }
  });
  router.get("/api/tenant/custody", async ({request,env})=>{
    try{
      const session=await requireAdmin(request,env);
      await limitAction(env,session,"tenant-custody-read",{limit:60,windowSeconds:60});
      const tenantId=Number(session.tenantId);
      const rows=await env.DB.prepare(`
        SELECT c.id AS case_id,c.mission_id,c.status,c.current_holder_type,c.current_holder_id,
               c.target_type,c.target_id,c.transfer_channel,c.recipient_type,c.recipient_id,
               c.distribution_status,c.created_at,c.updated_at,m.reference,m.status AS mission_status,
               m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,
               CASE WHEN c.recipient_type='tenant' AND c.recipient_id=? THEN 1 ELSE 0 END AS is_recipient_tenant
        FROM mission_custody_cases c
        JOIN mission_canonical_projection m ON m.id=c.mission_id AND m.company_id=c.company_id
        WHERE c.status IN ('awaiting_release','ready_to_transfer','awaiting_acceptance')
          AND (c.company_id=? OR (c.recipient_type='tenant' AND c.recipient_id=?))
        ORDER BY datetime(COALESCE(c.updated_at,c.created_at)) DESC,c.id DESC
        LIMIT 50
      `).bind(tenantId,tenantId,tenantId).all();
      const list=(rows?.results||[]).map(r=>({
        caseId:Number(r.case_id),missionId:Number(r.mission_id),reference:String(r.reference||`Mission ${r.mission_id}`),
        status:String(r.status||""),missionStatus:String(r.mission_status||""),currentHolderType:String(r.current_holder_type||""),
        currentHolderId:Number(r.current_holder_id||0)||null,targetType:String(r.target_type||""),targetId:Number(r.target_id||0)||null,
        channel:String(r.transfer_channel||""),recipientType:r.recipient_type?String(r.recipient_type):null,recipientId:Number(r.recipient_id||0)||null,
        distributionStatus:r.distribution_status?String(r.distribution_status):null,isRecipientTenant:Number(r.is_recipient_tenant)===1,
        pickupAddress:String(r.pickup_address||""),deliveryAddress:String(r.delivery_address||""),updatedAt:r.updated_at||r.created_at||null
      }));
      return json({success:true,version:"2.3",cases:list,count:list.length});
    }catch(e){
      const status=Number(e?.status)||500;
      return json({success:false,error:status===500?"Custody workspace unavailable":e?.message||"Custody workspace unavailable"},status);
    }
  });
}
