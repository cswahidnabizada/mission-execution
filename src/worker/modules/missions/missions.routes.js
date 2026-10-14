import {MISSION_PRE_CUSTODY_STATUSES, MISSION_TERMINAL_STATUSES} from "../../domains/logistics/logistics-lifecycle.contract.js";
import { cleanText, json, numberParam, readJson } from "../../core/http.js";
import { requireSession } from "../../core/auth-session.js";
import { requireOrganizationAction } from "../../security/organization-action-access.service.js";
import { assertStatus } from "../../security/validation.js";
import {limitAction,sessionScope} from "../../security/action-limit.js";
import {claimIdempotency,finalizeIdempotency,releaseIdempotency} from "../../security/idempotency.js";
import {
  changeAssignment, changeStatus, createMission, deleteMission, editMission,
  executionLocationForSession, getForSession, getStatusHistory, listForSession, nextReference
} from "./missions.service.js";
import { resolveMissionAccess } from "../../security/mission-access.js";
import {guardedMissionMutation} from "../transitions/transition-route.helper.js";
import {listMissionExceptions} from "../attention/attention.service.js";
import {listChat} from "../chat/chat.service.js";
import {listFiles,getDeliveryProof} from "../files/files.service.js";
import * as missionRepo from "../../repositories/mission.repository.js";
import {listCommittedMutationEvents} from "../transitions/transition-safety.service.js";
import {buildOperationalHistoryContract,validateOperationalHistoryContract} from "./operational-history.contract.js";
import {payloadByteLength,projectPayload,projectionName} from "../../core/response-projection.js";

export function registerMissionRoutes(router) {
  router.get("/api/missions", async ({ request, env, url }) => {
    try {
      const session = await requireSession(request, env);
      const isSearch=Boolean(url.searchParams.get("search")||url.searchParams.get("date")||url.searchParams.get("status"));
      await limitAction(env,session,isSearch?"mission-search":"mission-list",{limit:isSearch?30:60,windowSeconds:60});
      const filters = {
        missionId: numberParam(url.searchParams.get("missionId")),
        status: cleanText(url.searchParams.get("status"), 32),
        activeOnly: url.searchParams.get("active")==="1",
        date: cleanText(url.searchParams.get("date"), 32),
        search: cleanText(url.searchParams.get("search"), 200),
        view: cleanText(url.searchParams.get("view"), 20).toLowerCase(),
        limit: Math.min(Math.max(numberParam(url.searchParams.get("limit"))||20,1),50),
        offset: Math.min(Math.max(numberParam(url.searchParams.get("offset"))||0,0),5000)
      };
      const requestedLimit=filters.limit;
      filters.limit=requestedLimit+1;
      const rows = await listForSession(env, session, filters);
      const hasMore=rows.length>requestedLimit;
      const missions=rows.slice(0,requestedLimit);
      const projection=projectionName(url.searchParams.get("projection"));
      const responsePayload=projectPayload({ success: true, count: missions.length, missions, hasMore, nextOffset: hasMore ? filters.offset+requestedLimit : null },projection);
      const headers=projection!=="full"?{"X-ONM-Projection":projection,"X-ONM-Payload-Bytes":String(payloadByteLength(responsePayload))}:{};
      return json(responsePayload,200,headers);
    } catch (e) { return fail(e); }
  });

  router.get("/api/missions/metrics", async ({ request, env, url }) => {
    try {
      const session=await requireSession(request,env);
      await limitAction(env,session,"mission-metrics",{limit:30,windowSeconds:60});
      const filters={date:cleanText(url.searchParams.get("date"),32),status:cleanText(url.searchParams.get("status"),32)};
      const rows=await listForSession(env,session,filters);
      const completed=rows.filter(m=>m.status==="Completed").length;
      const cancelled=rows.filter(m=>MISSION_TERMINAL_STATUSES.includes(m.status)).length;
      const active=rows.filter(m=>!["Completed","Cancelled","Canceled"].includes(m.status)).length;
      const messageCount=rows.reduce((sum,m)=>sum+Number(m.message_count||0),0);
      return json({success:true,metrics:{assigned:rows.length,active,completed,cancelled,messages:messageCount}});
    } catch(e){return fail(e);}
  });

  router.get("/api/missions/next-reference", async ({ request, env }) => {
    try {
      const session = await requireOrganizationAction(request, env,"create_mission");
      await limitAction(env,session,"mission-reference",{limit:30,windowSeconds:60});
      return json({ success: true, reference: await nextReference(env, session) });
    } catch (e) { return fail(e); }
  });

  router.get(/^\/api\/missions\/(?<missionId>\d+)\/details$/, async ({ request, env, params, url }) => {
    try {
      const session = await requireSession(request, env);
      await limitAction(env,session,"mission-details",{limit:120,windowSeconds:60});
      const mission = await getForSession(env, session, Number(params.missionId));
      if (!mission) return json({ success: false, error: "Mission not found or access denied" }, 404);
      const includeHistory=url.searchParams.get("history")==="1";
      const statusHistory=includeHistory ? await getStatusHistory(env, session, Number(params.missionId)) : [];
      const eventHistory=includeHistory ? await listCommittedMutationEvents(env,{companyId:Number(mission.company_id),missionId:Number(params.missionId),limit:120}) : [];
      let history=null;
      if(includeHistory){
        const [exceptions,messages,files,proof]=await Promise.all([
          listMissionExceptions(env,session,Number(params.missionId)),
          listChat(env,session,Number(params.missionId),{limit:201,offset:0}),
          listFiles(env,session,Number(params.missionId),{limit:201,offset:0}),
          getDeliveryProof(env,session,Number(params.missionId))
        ]);
        history=buildOperationalHistoryContract({mission,statusHistory,eventHistory,exceptions,messages,files,proof:proof?.proof||null});
      }
      if(history){
        const problems=validateOperationalHistoryContract(history);
        if(problems.length) return json({success:false,error:"Historical record contract invalid",problems},500);
      }
      const accessResult=await resolveMissionAccess(env,session,Number(params.missionId));
      return json({
        success: true,
        stateToken:Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:null,
        mission,
        executionLocation: await executionLocationForSession(env,session,Number(params.missionId),{mission}),
        statusHistory,
        eventHistory,
        history,
        permissions: {
          canView: true,
          canEdit: session.role === "admin" && Number(mission.shared_access||0)!==1 && Number(session.tenantId)===Number(mission.company_id),
          canViewAssignment: session.role === "admin",
          canReassign: session.role === "admin" && MISSION_PRE_CUSTODY_STATUSES.includes(String(mission.status||"")) &&
            (Number(session.tenantId)===Number(mission.company_id) || Number(mission.shared_access||0)===1),
          canAssignSharedDriver: session.role === "admin" && Number(mission.shared_access||0)===1 && MISSION_PRE_CUSTODY_STATUSES.includes(String(mission.status||"")),
          canUpdateStatus: (session.role === "driver" || session.role === "executor") &&
            Number(mission.custody_pending||0)!==1 &&
            !MISSION_TERMINAL_STATUSES.includes(String(mission.status||"")),
          role: session.role,
          accessKind: accessResult?.accessKind||null
        }
      });
    } catch (e) { return fail(e); }
  });

  router.post("/api/missions", async ({ request, env }) => {
    try {
      const session = await requireOrganizationAction(request, env,"create_mission");
      await limitAction(env,session,"mission-create",{limit:10,windowSeconds:60});
      const body=await readJson(request);
      const idempotencyKey=cleanText(body.idempotencyKey,100);
      const scopeKey=sessionScope(session);
      let claim={claimed:true,resourceId:null};
      if(idempotencyKey){
        claim=await claimIdempotency(env,{scopeKey,actionKey:"mission-create",key:idempotencyKey,ttlSeconds:900});
        if(!claim.claimed){
          if(claim.resourceId){
            const existing=await getForSession(env,session,claim.resourceId);
            if(existing)return json({success:true,missionId:existing.id,mission:existing,idempotent:true});
          }
          if(claim.resourceReference){
            const existing=await missionRepo.findMissionByReference(env,Number(session.tenantId),claim.resourceReference);
            if(existing?.id){
              const mission=await getForSession(env,session,Number(existing.id));
              if(mission){
                await finalizeIdempotency(env,{scopeKey,actionKey:"mission-create",key:idempotencyKey,resourceId:Number(existing.id)});
                return json({success:true,missionId:mission.id,mission,idempotent:true,reconciled:true});
              }
            }
          }
          return json({success:false,error:"This mission creation request is already processing"},409);
        }
      }
      try{
        const data = normalizeMission(body);
        validateMission(data);
        const mission = await createMission(env, session, data,{scopeKey,actionKey:"mission-create",key:idempotencyKey});
        if(idempotencyKey)await finalizeIdempotency(env,{scopeKey,actionKey:"mission-create",key:idempotencyKey,resourceId:mission.id});
        return json({ success: true, missionId: mission.id, mission }, 201);
      }catch(error){
        if(idempotencyKey)await releaseIdempotency(env,{scopeKey,actionKey:"mission-create",key:idempotencyKey});
        throw error;
      }
    } catch (e) { return fail(e); }
  });

  router.patch(/^\/api\/missions\/(?<missionId>\d+)$/, async ({ request, env, params }) => {
    try {
      const session = await requireOrganizationAction(request, env,"edit_mission");
      await limitAction(env,session,"mission-update",{limit:15,windowSeconds:60});
      await limitAction(env,session,`mission-update:${Number(params.missionId)}`,{limit:3,windowSeconds:10});
      const body=await readJson(request);
      const missionId=Number(params.missionId);
      const existing=await getForSession(env,session,missionId);
      if(!existing)return json({success:false,error:"Mission not found or access denied"},404);
      const data = normalizeMission({...missionUpdateInput(existing),...body});
      validateMission(data, false);
      const result=await guardedMissionMutation({
        env,session,request,body,companyId:Number(session.tenantId),missionId,actionCode:"edit_mission",requireStateToken:true,
        run:(_,fence)=>editMission(env,session,missionId,data,fence)
      });
      return json({ success: true, message: "Mission updated successfully", missionId, stateToken:result.stateToken, mission:result });
    } catch (e) { return fail(e); }
  });

  router.patch(/^\/api\/missions\/(?<missionId>\d+)\/assignment$/, async ({ request, env, params }) => {
    try {
      const session = await requireOrganizationAction(request, env,"assign_driver");
      await limitAction(env,session,"mission-assignment",{limit:15,windowSeconds:60});
      await limitAction(env,session,`mission-assignment:${Number(params.missionId)}`,{limit:3,windowSeconds:10});
      const body = await readJson(request);
      const data = {
        missionType: cleanText(body.missionType, 16).toLowerCase(),
        driverId: numberParam(body.driverId),
        publicDescription: cleanText(body.publicDescription, 2000)
      };
      const missionId=Number(params.missionId);
      const result=await guardedMissionMutation({
        env,session,request,body,companyId:Number(session.tenantId),missionId,actionCode:"change_assignment",requireStateToken:true,
        run:(_,fence)=>changeAssignment(env,session,missionId,data,fence)
      });
      return json({ success: true, missionId, stateToken:result.stateToken, mission:result });
    } catch (e) { return fail(e); }
  });

  router.post("/api/missions/status", async ({ request, env }) => {
    try {
      const session = await requireSession(request, env);
      await limitAction(env,session,"mission-status",{limit:20,windowSeconds:60});
      if (!["admin","driver","executor"].includes(session.role)) return json({ success: false, error: "Mission status permission required" }, 403);
      const body = await readJson(request);
      const missionId = numberParam(body.missionId);
      const status = cleanText(body.status, 32);
      if (!missionId) return json({ success: false, error: "Missing mission" }, 400);
      await limitAction(env,session,`mission-status:${missionId}`,{limit:3,windowSeconds:5});
      assertStatus(status);
      const mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      const result=await guardedMissionMutation({
        env,session,request,body,companyId:Number(mission.company_id),missionId,actionCode:`status:${status}`,requireStateToken:true,
        run:(_,fence)=>changeStatus(env,session,missionId,status,fence)
      });
      return json({ success: true, ...result });
    } catch (e) { return fail(e); }
  });

  router.delete(/^\/api\/missions\/(?<missionId>\d+)$/, async ({ request, env, params }) => {
    try {
      const session = await requireOrganizationAction(request, env,"delete_mission");
      await limitAction(env,session,"mission-delete",{limit:5,windowSeconds:300});
      const body=await readJson(request);
      const missionId=Number(params.missionId);
      await limitAction(env,session,`mission-delete:${missionId}`,{limit:1,windowSeconds:5});
      const mission=await getForSession(env,session,missionId);
      if(!mission||Number(mission.company_id)!==Number(session.tenantId)||Number(mission.shared_access||0)===1){
        return json({success:false,error:"Mission not found or deletion not permitted"},404);
      }
      const confirmation=cleanText(body.confirmation,200);
      if(confirmation!=="DELETE"&&confirmation!==String(mission.reference)){
        return json({success:false,error:"Type DELETE or the exact mission reference to confirm"},400);
      }
      const result = await guardedMissionMutation({
        env,session,request,body,companyId:Number(mission.company_id),missionId,actionCode:"delete_mission",requireStateToken:true,
        run:(_,fence)=>deleteMission(env,session,missionId,fence)
      });
      return json({ success: true, message: result.deleted ? "Mission deleted successfully" : "Mission archived successfully. It remains retained under governed data policy.", ...result });
    } catch (e) { return fail(e); }
  });
}

function missionUpdateInput(m){
  let missionContext={}; try{missionContext=JSON.parse(String(m.mission_context_json||"{}"))||{}}catch{}
  return {missionType:m.mission_type||m.missionType||"private",capabilityCode:m.capability_code||"logistics",objective:m.objective||"",responsibilityMode:m.responsibility_mode||"assigned",countryCode:m.country_code||"",sectorCode:m.sector_code||"general",productDefinitionId:numberParam(m.product_definition_id),lifecycleDefinitionId:numberParam(m.lifecycle_definition_id),missionContext,driverId:numberParam(m.owner_driver_id),pickupCompany:m.pickup_company,pickupAddress:m.pickup_address,pickupStreet:m.pickup_street,pickupZipCode:m.pickup_zip_code,pickupCity:m.pickup_city,deliveryCompany:m.delivery_company,deliveryAddress:m.delivery_address,deliveryStreet:m.delivery_street,deliveryZipCode:m.delivery_zip_code,deliveryCity:m.delivery_city,missionDate:m.mission_date,pickupTime:m.pickup_time,deliveryTime:m.delivery_time,deadlineAt:m.deadline_at, pickupAtUtc:m.pickup_at_utc,deliveryAtUtc:m.delivery_at_utc,deadlineAtUtc:m.deadline_at_utc,scheduleTimezone:m.schedule_timezone,missionEndTime:m.mission_end_time,publicDescription:m.public_description,customerId:numberParam(m.customer_id),pickupAccessFrom:m.pickup_access_from,pickupAccessTo:m.pickup_access_to,deliveryAccessFrom:m.delivery_access_from,deliveryAccessTo:m.delivery_access_to,adminMessage:m.admin_message};
}

function normalizeMission(body) {
  return {
    missionType: cleanText(body.missionType || "private", 16).toLowerCase(),
    capabilityCode: cleanText(body.capabilityCode || "logistics", 80), objective: cleanText(body.objective, 1000), responsibilityMode: cleanText(body.responsibilityMode || "assigned", 40), countryCode: cleanText(body.countryCode, 8).toUpperCase(), sectorCode: cleanText(body.sectorCode || (body.capabilityCode === "logistics" ? "logistics" : "general"), 80).toLowerCase(), productDefinitionId: numberParam(body.productDefinitionId), lifecycleDefinitionId: numberParam(body.lifecycleDefinitionId), missionContext: body.missionContext && typeof body.missionContext === "object" && !Array.isArray(body.missionContext) ? body.missionContext : {},
    driverId: numberParam(body.driverId),
    pickupCompany: cleanText(body.pickupCompany, 200),
    pickupAddress: composeAddress(body.pickupAddress, body.pickupStreet, body.pickupZipCode, body.pickupCity),
    pickupStreet: cleanText(body.pickupStreet, 200), pickupZipCode: cleanText(body.pickupZipCode, 5), pickupCity: cleanText(body.pickupCity, 120),
    deliveryCompany: cleanText(body.deliveryCompany, 200),
    deliveryAddress: composeAddress(body.deliveryAddress, body.deliveryStreet, body.deliveryZipCode, body.deliveryCity),
    deliveryStreet: cleanText(body.deliveryStreet, 200), deliveryZipCode: cleanText(body.deliveryZipCode, 5), deliveryCity: cleanText(body.deliveryCity, 120),
    pickupLatitude: numericCoordinate(body.pickupLatitude), pickupLongitude: numericCoordinate(body.pickupLongitude), deliveryLatitude: numericCoordinate(body.deliveryLatitude), deliveryLongitude: numericCoordinate(body.deliveryLongitude),
    objectType: cleanText(body.objectType, 120), objectDescription: cleanText(body.objectDescription, 1000), weightKg: positiveNumber(body.weightKg), volumeM3: positiveNumber(body.volumeM3), palletCount: positiveInteger(body.palletCount), vehicleRequirement: cleanText(body.vehicleRequirement, 120), loadingType: cleanText(body.loadingType, 80), unloadingType: cleanText(body.unloadingType, 80), matchingNotes: cleanText(body.matchingNotes, 1000),
    missionDate: cleanText(body.missionDate, 32),
    pickupTime: cleanText(body.pickupTime, 8),
    deliveryTime: cleanText(body.deliveryTime, 8),
    deadlineAt: cleanText(body.deadlineAt, 32),
    pickupAtUtc: cleanText(body.pickupAtUtc, 40),
    deliveryAtUtc: cleanText(body.deliveryAtUtc, 40),
    deadlineAtUtc: cleanText(body.deadlineAtUtc, 40),
    scheduleTimezone: cleanText(body.scheduleTimezone, 80),
    missionEndTime: cleanText(body.missionEndTime || deadlineTime(body.deadlineAt), 8),
    adminMessage: cleanText(body.adminMessage, 2000),
    publicDescription: cleanText(body.publicDescription, 2000),
    customerId: numberParam(body.customerId),
    pickupAccessFrom: cleanText(body.pickupAccessFrom,8), pickupAccessTo: cleanText(body.pickupAccessTo,8),
    deliveryAccessFrom: cleanText(body.deliveryAccessFrom,8), deliveryAccessTo: cleanText(body.deliveryAccessTo,8),
    networkRecipientType: cleanText(body.networkRecipientType, 20).toLowerCase(),
    networkRecipientId: numberParam(body.networkRecipientId),
    networkMessage: cleanText(body.networkMessage, 500)
  };
}

function composeAddress(legacy, street, zip, city){
  const fallback=cleanText(legacy,500);
  const s=cleanText(street,200), z=cleanText(zip,5), c=cleanText(city,120);
  if(s||z||c) return [s,[z,c].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return fallback;
}
function numericCoordinate(value){
  if(value===null||value===undefined||value==='') return null;
  const n=Number(value); return Number.isFinite(n)?n:null;
}
function positiveNumber(value){
  if(value===null||value===undefined||value==='') return null;
  const n=Number(value); return Number.isFinite(n)&&n>=0?n:null;
}
function positiveInteger(value){
  if(value===null||value===undefined||value==='') return null;
  const n=Number(value); return Number.isInteger(n)&&n>=0?n:null;
}

function validateMission(d, requireType = true) {
  const universalSector=String(d.sectorCode||"general").toLowerCase();
  const isLogistics=universalSector==="logistics" || String(d.capabilityCode||"").toLowerCase()==="logistics";
  if(!isLogistics){
    if(!d.objective){const e=new Error("Mission objective is required for non-logistics missions");e.status=400;throw e;}
    if(!d.countryCode || !d.sectorCode){const e=new Error("Country and sector are required for a universal mission");e.status=400;throw e;}
    return;
  }
  if (!d.pickupCompany || !d.pickupAddress || !d.deliveryCompany || !d.deliveryAddress || !d.missionDate || !d.pickupTime || !d.deliveryTime || !d.deadlineAt || !d.pickupAtUtc || !d.deliveryAtUtc || !d.deadlineAtUtc) {
    const e = new Error("Missing required mission information");
    e.status = 400;
    throw e;
  }
  for (const [label,street,zip,city] of [["Pickup",d.pickupStreet,d.pickupZipCode,d.pickupCity],["Delivery",d.deliveryStreet,d.deliveryZipCode,d.deliveryCity]]) {
    const any=Boolean(street||zip||city), all=Boolean(street&&zip&&city);
    if(any&&!all){const e=new Error(`${label} address requires street name and number, ZIP code, and city`);e.status=400;throw e;}
  }
  for (const zip of [d.pickupZipCode,d.deliveryZipCode]) { if(zip && !/^\d{5}$/.test(zip)){const e=new Error("ZIP code must contain exactly 5 digits");e.status=400;throw e;} }
  for (const pair of [[d.pickupAccessFrom,d.pickupAccessTo],[d.deliveryAccessFrom,d.deliveryAccessTo]]) {
    if((pair[0]&&!pair[1])||(!pair[0]&&pair[1])){const e=new Error("Site Access Window needs both start and end times");e.status=400;throw e;}
    if(pair[0]&&(!/^\d{2}:\d{2}$/.test(pair[0])||!/^\d{2}:\d{2}$/.test(pair[1]))){const e=new Error("Site Access Window must use HH:MM");e.status=400;throw e;}
  }
  for (const value of [d.pickupTime,d.deliveryTime,d.missionEndTime]) {
    if (value && !/^\d{2}:\d{2}$/.test(value)) {
      const e = new Error("Mission times must use HH:MM");
      e.status = 400;
      throw e;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.deadlineAt)) {
    const e = new Error("Deadline must be a valid date and time");
    e.status = 400;
    throw e;
  }
  for (const [lat,lon] of [[d.pickupLatitude,d.pickupLongitude],[d.deliveryLatitude,d.deliveryLongitude]]) { if((lat===null)!==(lon===null)){const e=new Error("Both latitude and longitude are required together");e.status=400;throw e;} if(lat!==null && (lat < -90 || lat > 90 || lon < -180 || lon > 180)){const e=new Error("Mission coordinates are invalid");e.status=400;throw e;} }
  for (const value of [d.pickupAtUtc,d.deliveryAtUtc,d.deadlineAtUtc]) {
    if (!isUtcInstant(value)) {
      const e = new Error("Mission UTC timestamps are invalid");
      e.status = 400;
      throw e;
    }
  }
  const pickupMs=Date.parse(d.pickupAtUtc),deliveryMs=Date.parse(d.deliveryAtUtc),deadlineMs=Date.parse(d.deadlineAtUtc);
  if (deliveryMs < pickupMs) {
    const e = new Error("Delivery time cannot be before pickup time");
    e.status = 400;
    throw e;
  }
  if (deadlineMs < deliveryMs) {
    const e = new Error("Deadline cannot be before delivery time");
    e.status = 400;
    throw e;
  }
  if (requireType && !["private", "public", "network"].includes(d.missionType)) {
    const e = new Error("Invalid mission type");
    e.status = 400;
    throw e;
  }
}

function isUtcInstant(value){
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(String(value||"")) && Number.isFinite(Date.parse(value));
}

function deadlineTime(value){
  const m=String(value||"").match(/T(\d{2}:\d{2})$/);
  return m?m[1]:"";
}

function fail(e) {
  const status = e?.status || (e.message === "AUTH_REQUIRED" ? 401 : e.message === "FORBIDDEN" ? 403 : 500);
  const map={DELIVERY_PROOF_REQUIRED:"A delivery proof photo is required before this mission can be marked Delivered or Completed."};
  const message = e.message === "AUTH_REQUIRED" ? "Authentication required" : e.message === "FORBIDDEN" ? "Permission denied" : e.message==="TOO_MANY_ATTEMPTS" ? "Too many requests. Please wait briefly and try again." : (map[e.message]||e.message);
  return json({ success: false, error: message || "Mission operation failed", details:e?.details||null }, status);
}
