import {json,readJson,cleanText,numberParam,publicErrorMessage} from "../../core/http.js";
import {requireAdmin,requireRole,requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import * as service from "./network.service.js";
import {getForSession} from "../missions/missions.service.js";
import {guardedMissionMutation} from "../transitions/transition-route.helper.js";

export function registerNetworkRoutes(router){
  router.get("/api/network/summary",admin(async({env,s})=>({success:true,summary:await service.getSummary(env,s)}),"network-summary",30));
  router.get("/api/network/tenants",admin(async({env,s,url})=>({success:true,tenants:await service.searchTenants(env,s,cleanText(url.searchParams.get("q"),120))}),"network-tenant-search",30));
  router.get("/api/network/tenant-trust",admin(async({env,s,url})=>{const limit=Math.min(Math.max(Number(url.searchParams.get("limit"))||100,1),200),offset=Math.min(Math.max(Number(url.searchParams.get("offset"))||0,0),50000);return {success:true,relationships:await service.tenantRelationships(env,s,{limit,offset})};},"network-trust-list",30));
  router.post(/^\/api\/network\/tenants\/(?<id>\d+)\/trust$/,admin(async({env,s,params})=>({success:true,trust:await service.sendTenantTrustRequest(env,s,Number(params.id))}),"network-trust-write",10));
  router.post(/^\/api\/network\/tenant-trust\/(?<id>\d+)\/(?<action>accept|reject|suspend)$/,admin(async({env,s,params})=>({success:true,...await service.respondTenantTrust(env,s,Number(params.id),params.action)}),"network-trust-write",10));

  router.get("/api/network/executors",admin(async({env,s,url})=>({success:true,executors:await service.searchExecutors(env,s,cleanText(url.searchParams.get("q"),120))}),"network-executor-search",30));
  router.get("/api/network/trusted-executors",admin(async({env,s,url})=>{const limit=Math.min(Math.max(Number(url.searchParams.get("limit"))||100,1),200),offset=Math.min(Math.max(Number(url.searchParams.get("offset"))||0,0),50000);const executors=await service.trustedExecutors(env,s,{limit:limit+1,offset});const hasMore=executors.length>limit;return {success:true,executors:executors.slice(0,limit),hasMore,nextOffset:hasMore?offset+limit:null};},"network-executor-list",30));
  router.get("/api/network/execution-partners",admin(async({env,s})=>({success:true,partners:await service.executionPartners(env,s)}),"network-execution-partners",30));
  router.get("/api/network/for-you-partners",admin(async({env,s})=>({success:true,partners:await service.discoverForYouPartners(env,s)}),"network-for-you-partners",30));
  router.post(/^\/api\/network\/executors\/(?<id>\d+)\/trust$/,admin(async({env,s,params})=>({success:true,...await service.setExecutorTrust(env,s,Number(params.id),"trusted")}),"network-executor-write",10));
  router.post(/^\/api\/network\/executors\/(?<id>\d+)\/(?<action>suspend|block)$/,admin(async({env,s,params})=>({success:true,...await service.setExecutorTrust(env,s,Number(params.id),params.action==="block"?"blocked":"suspended")}),"network-executor-write",10));

  router.get("/api/network/customers",admin(async({env,s,url})=>{const limit=Math.min(Math.max(Number(url.searchParams.get("limit"))||100,1),200),offset=Math.min(Math.max(Number(url.searchParams.get("offset"))||0,0),50000),all=url.searchParams.get("all")==="1";if(url.searchParams.get("q")!==null)return {success:true,customers:await service.searchCustomers(env,s,cleanText(url.searchParams.get("q"),120),all)};const customers=await service.customers(env,s,all,{limit:limit+1,offset});const hasMore=customers.length>limit;return {success:true,customers:customers.slice(0,limit),hasMore,nextOffset:hasMore?offset+limit:null};},"network-customer-list",30));
  router.get(/^\/api\/network\/customers\/(?<id>\d+)\/locations$/,admin(async({env,s,params})=>({success:true,locations:await service.customerLocations(env,s,Number(params.id))}),"network-customer-location-list",30));
  router.post(/^\/api\/network\/customers\/(?<id>\d+)\/locations$/,admin(async({env,s,request,params})=>{const b=await readJson(request);return {success:true,...await service.createCustomerLocation(env,s,Number(params.id),{label:cleanText(b.label,120),companyName:cleanText(b.companyName,200),address:cleanText(b.address,500),accessFrom:cleanText(b.accessFrom,8),accessTo:cleanText(b.accessTo,8)})};},"network-customer-location-write",15,201));
  router.post("/api/network/customers",admin(async({env,s,request})=>{const b=await readJson(request);return {success:true,...await service.createCustomer(env,s,{companyName:cleanText(b.companyName,200),contactName:cleanText(b.contactName,200),email:cleanText(b.email,250),phone:cleanText(b.phone,80),address:cleanText(b.address,500),customerReference:cleanText(b.customerReference,120),notes:cleanText(b.notes,1000)})};},"network-customer-write",15,201));
  router.patch(/^\/api\/network\/customers\/(?<id>\d+)$/,admin(async({env,s,request,params})=>{const b=await readJson(request);return {success:true,...await service.updateCustomer(env,s,Number(params.id),{companyName:cleanText(b.companyName,200),contactName:cleanText(b.contactName,200),email:cleanText(b.email,250),phone:cleanText(b.phone,80),address:cleanText(b.address,500),customerReference:cleanText(b.customerReference,120),notes:cleanText(b.notes,1000)})};},"network-customer-write",15));
  router.delete(/^\/api\/network\/customers\/(?<id>\d+)$/,admin(async({env,s,request,params})=>{const b=await readJson(request);if(String(b.confirmation||"")==="DELETE"||String(b.mode||"")==="delete")return {success:true,...await service.deleteCustomer(env,s,Number(params.id),cleanText(b.confirmation,200))};await service.archiveCustomer(env,s,Number(params.id));return {success:true,status:"archived"};},"network-customer-write",15));

  router.get("/api/network/invitations",async({request,env,url})=>{try{
    const s=await requireRole(request,env,["admin","executor"]);
    await limitAction(env,s,"network-invitation-list",{limit:30,windowSeconds:60});
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit"))||100,1),200);
    const offset=Math.min(Math.max(Number(url.searchParams.get("offset"))||0,0),50000);
    const invitations=await service.incomingInvitations(env,s,{limit:limit+1,offset});
    const hasMore=invitations.length>limit;
    return json({success:true,invitations:invitations.slice(0,limit),hasMore,nextOffset:hasMore?offset+limit:null});
  }catch(e){return fail(e);}});

  router.post(/^\/api\/network\/missions\/(?<id>\d+)\/invite$/,admin(async({env,s,request,params})=>{
    const missionId=Number(params.id),b=await readJson(request),mission=await getForSession(env,s,missionId);
    if(!mission||Number(mission.company_id)!==Number(s.tenantId)){const e=new Error("Mission not found or invitation not permitted");e.status=404;throw e;}
    const result=await guardedMissionMutation({
      env,session:s,request,body:b,companyId:Number(mission.company_id),missionId,actionCode:"network_invite",requireStateToken:true,
      run:(_,fence)=>service.inviteMission(env,s,missionId,cleanText(b.recipientType,20),numberParam(b.recipientId),cleanText(b.message,500),fence)
    });
    return {success:true,...result};
  },"network-mission-invite",10));

  router.post(/^\/api\/network\/invitations\/(?<id>\d+)\/(?<action>accept|reject)$/,async({request,env,params})=>{try{
    const s=await requireRole(request,env,["admin","executor"]);
    await limitAction(env,s,"network-invitation-response",{limit:15,windowSeconds:60});
    const b=await readJson(request),ctx=await service.invitationMutationContext(env,s,Number(params.id));
    const result=await guardedMissionMutation({
      env,session:s,request,body:{...b,invitationId:Number(params.id)},companyId:ctx.ownerCompanyId,missionId:ctx.missionId,
      actionCode:`network_invitation:${params.action}`,requireStateToken:true,
      run:(_,fence)=>service.respondMissionInvitation(env,s,Number(params.id),params.action,{driverId:Number(b.driverId||0)||null},fence)
    });
    return json({success:true,...result});
  }catch(e){return fail(e);}});

  router.get("/api/network/missions",admin(async({env,s})=>({success:true,missions:await service.networkMissions(env,s)}),"network-mission-list",30));
}

function admin(fn,key,limit=30,status=200){
  return async ctx=>{try{
    const s=await requireAdmin(ctx.request,ctx.env);
    await limitAction(ctx.env,s,key,{limit,windowSeconds:60});
    return json(await fn({...ctx,s}),status);
  }catch(e){return fail(e);}};
}
function fail(e){const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:500);const fallback=e?.message==="TOO_MANY_ATTEMPTS"?"Too many network actions. Please wait briefly.":"Network operation failed";return json({success:false,error:publicErrorMessage(e,fallback),details:e?.details||null},status);}
