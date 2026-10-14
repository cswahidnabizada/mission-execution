import {cleanText,json,numberParam,readJson,publicErrorMessage} from "../../core/http.js";
import {getSession,requireAdmin,requireSession} from "../../core/auth-session.js";
import {approve,assignSharedDriver,cancelRequest,decline,listPublic,listRequests,requestMission} from "./public.service.js";
import {limitAction} from "../../security/action-limit.js";
import {guardedMissionMutation} from "../transitions/transition-route.helper.js";
import {getForSession} from "../missions/missions.service.js";
import {executeCanonicalAction} from "../../application/actions/canonical-action.application.service.js";

export function registerPublicRoutes(router){
  router.post("/api/public/access-code/resolve",async({request,env})=>{try{
    const s=await requireSession(request,env);
    await limitAction(env,s,"foryou-access-code-resolve",{limit:12,windowSeconds:300});
    const body=await readJson(request),code=cleanText(body.accessCode,32);
    const {resolveMissionByAccessCode}=await import("../../repositories/mission-access-code.repository.js");
    const resolved=await resolveMissionByAccessCode(env,code);
    if(!resolved)return json({success:false,error:"Invalid or expired ForYou access code"},404);
    const m=resolved.mission;
    if(s.role==="admin"&&Number(s.tenantId)===Number(m.company_id))return json({success:false,error:"The mission owner cannot use its own access code to request access"},403);
    return json({success:true,mission:{id:Number(m.id),reference:m.reference,ownerCompanyName:m.owner_company_name,status:m.status,missionDate:m.mission_date,publicDescription:m.public_description||"",stateToken:`v:${Number(m.state_version||0)}`}});
  }catch(e){return fail(e);}});

  router.get("/api/public/missions",async({request,env})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"public-mission-list",{limit:60,windowSeconds:60});
      return json({success:true,missions:await listPublic(env,session),sessionRole:session.role});
    }catch(e){return fail(e);}
  });

  router.post(/^\/api\/public\/missions\/(?<missionId>\d+)\/request$/,async({request,env,params})=>{try{
    const session=await requireSession(request,env);
    await limitAction(env,session,"public-mission-request",{limit:12,windowSeconds:300});
    const body=await readJson(request),missionId=Number(params.missionId);
    const result=await executeCanonicalAction(env,request,router,session,{missionId,body:{...body,missionId,actionCode:"request_foryou_mission"}});
    return json(result.body,result.status);
  }catch(e){return fail(e);}});

  // Canonical Action Service Map target. This endpoint is not a client-facing
  // authority; it is the secured domain application boundary for private ForYou.
  router.post(/^\/api\/public\/private-missions\/(?<missionId>\d+)\/request-application$/,async({request,env,params})=>{try{
    const session=await requireSession(request,env);
    const body=await readJson(request),missionId=Number(params.missionId);
    const m=await env.DB.prepare(`SELECT id,company_id,updated_at FROM mission_canonical_projection WHERE id=? LIMIT 1`).bind(missionId).first();
    if(!m)return json({success:false,error:"Mission not found"},404);
    const result=await guardedMissionMutation({env,session,request,body,companyId:Number(m.company_id),missionId,actionCode:"foryou_request",requireStateToken:true,reconciliationHint:{requesterType:session.role==="executor"?"executor":"tenant",requesterId:session.role==="executor"?Number(session.executorId||0):Number(session.tenantId||0)},run:(_,fence)=>requestMission(env,missionId,session,cleanText(body.message,1500),{driverId:Number(body.driverId||0)||null,accessCode:cleanText(body.accessCode,32)},fence)});
    return json({success:true,missionId,stateToken:result.stateToken,requestId:result.id,alreadyPending:!!result.alreadyPending,alreadyApproved:!!result.alreadyApproved,queueBusy:!!result.queueBusy},result.alreadyPending||result.alreadyApproved||result.queueBusy?200:201);
  }catch(e){return fail(e);}});

  router.post(/^\/api\/public\/requests\/(?<requestId>\d+)\/cancel$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"public-request-cancel",{limit:10,windowSeconds:60});
      const body=await readJson(request),requestId=Number(params.requestId);
      const req=await env.DB.prepare(`SELECT id,mission_id,company_id,updated_at FROM public_mission_requests WHERE id=? AND requester_type='tenant' AND requester_company_id=? LIMIT 1`).bind(requestId,Number(session.tenantId)).first();
      if(!req)return json({success:false,error:"Request not found"},404);
      const result=await guardedMissionMutation({env,session,request,body,companyId:Number(req.company_id),missionId:Number(req.mission_id),actionCode:"foryou_cancel",requireStateToken:true,reconciliationHint:{requestId},run:(_,fence)=>cancelRequest(env,session,requestId,fence)});
      return json({success:true,requestId,status:"Cancelled",alreadyApplied:!!result.alreadyApplied,stateToken:result.stateToken});
    }catch(e){return fail(e);}
  });

  router.get("/api/public/requests/count",async({request,env})=>{try{
    const s=await requireAdmin(request,env);
    await limitAction(env,s,"public-request-count",{limit:30,windowSeconds:60});
    const row=await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM public_mission_requests WHERE company_id=?) +
      (SELECT COUNT(*) FROM network_mission_invitations WHERE recipient_type='tenant' AND recipient_company_id=? AND status='Pending') AS total,
      (SELECT COUNT(*) FROM public_mission_requests WHERE company_id=? AND status='Pending') +
      (SELECT COUNT(*) FROM network_mission_invitations WHERE recipient_type='tenant' AND recipient_company_id=? AND status='Pending') AS pending`).bind(Number(s.tenantId),Number(s.tenantId),Number(s.tenantId),Number(s.tenantId)).first();
    return json({success:true,total:Number(row?.total||0),pending:Number(row?.pending||0)});
  }catch(e){return fail(e);}});

  router.get("/api/public/requests",async({request,env,url})=>{
    try{
      const s=await requireAdmin(request,env);
      await limitAction(env,s,"public-request-list",{limit:30,windowSeconds:60});
      const limit=Math.min(Math.max(Number(url.searchParams.get("limit"))||100,1),200);
      const offset=Math.min(Math.max(Number(url.searchParams.get("offset"))||0,0),50000);
      const requests=await listRequests(env,s,{limit:limit+1,offset});
      const hasMore=requests.length>limit;
      return json({success:true,requests:requests.slice(0,limit),hasMore,nextOffset:hasMore?offset+limit:null});
    }catch(e){return fail(e);}
  });

  router.post(/^\/api\/public\/requests\/(?<requestId>\d+)\/approve$/,async({request,env,params})=>{
    try{
      const s=await requireAdmin(request,env);
      await limitAction(env,s,"public-request-review",{limit:20,windowSeconds:60});
      const body=await readJson(request),requestId=Number(params.requestId);
      const req=await env.DB.prepare(`SELECT r.mission_id,m.company_id,m.updated_at FROM public_mission_requests r JOIN mission_canonical_projection m ON m.id=r.mission_id AND m.company_id=r.company_id WHERE r.id=? AND r.company_id=? LIMIT 1`).bind(requestId,Number(s.tenantId)).first();
      if(!req)return json({success:false,error:"Request not found"},404);
      const result=await guardedMissionMutation({env,session:s,request,body,companyId:Number(req.company_id),missionId:Number(req.mission_id),actionCode:"foryou_approve",requireStateToken:true,reconciliationHint:{requestId},run:(_,fence)=>approve(env,s,requestId,fence)});
      return json({success:true,...result});
    }catch(e){return fail(e);}
  });

  router.post(/^\/api\/public\/requests\/(?<requestId>\d+)\/decline$/,async({request,env,params})=>{
    try{
      const s=await requireAdmin(request,env);
      await limitAction(env,s,"public-request-review",{limit:20,windowSeconds:60});
      const body=await readJson(request),requestId=Number(params.requestId);
      const req=await env.DB.prepare(`SELECT r.mission_id,m.company_id,m.updated_at FROM public_mission_requests r JOIN mission_canonical_projection m ON m.id=r.mission_id AND m.company_id=r.company_id WHERE r.id=? AND r.company_id=? LIMIT 1`).bind(requestId,Number(s.tenantId)).first();
      if(!req)return json({success:false,error:"Request not found"},404);
      const result=await guardedMissionMutation({env,session:s,request,body,companyId:Number(req.company_id),missionId:Number(req.mission_id),actionCode:"foryou_decline",requireStateToken:true,reconciliationHint:{requestId},run:(_,fence)=>decline(env,s,requestId,fence)});
      return json({success:true,...(result||{})});
    }catch(e){return fail(e);}
  });

  router.patch(/^\/api\/shared\/missions\/(?<missionId>\d+)\/driver$/,async({request,env,params})=>{
    try{
      const s=await requireAdmin(request,env);
      await limitAction(env,s,"shared-driver-assignment",{limit:15,windowSeconds:60});
      const body=await readJson(request),missionId=Number(params.missionId);
      const driverId=numberParam(body.driverId);
      if(!driverId)return json({success:false,error:"Choose a driver"},400);
      const mission=await getForSession(env,s,missionId);
      if(!mission)return json({success:false,error:"Mission not found"},404);
      const result=await guardedMissionMutation({env,session:s,request,body,companyId:Number(mission.company_id),missionId,actionCode:"shared_driver_assignment",requireStateToken:true,run:(_,fence)=>assignSharedDriver(env,s,missionId,driverId,fence)});
      return json({success:true,...result});
    }catch(e){return fail(e);}
  });
}

function fail(e){
  const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:e?.message==="FORBIDDEN"?403:500);
  const fallback=e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message==="TOO_MANY_ATTEMPTS"?"Too many requests. Please wait briefly and try again.":"Public mission operation failed";
  return json({success:false,error:publicErrorMessage(e,fallback),details:e?.details||null},status);
}
