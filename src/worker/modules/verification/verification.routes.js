import {cleanText,json,numberParam,readJson} from "../../core/http.js";
import {requireRole,requireSession,createSession,destroySession} from "../../core/auth-session.js";
import {consumeRateLimit,requestIp} from "../../security/rate-limit.js";
import {requirePlatformSuperAdministrator} from "../../security/platform-super-administrator.js";
import {audit} from "../../security/audit.js";
import {searchActivationUsers,createActivationReviewRequest,platformActivationProfile} from "../../security/activation-review.service.js";
import {listCountries,createCountry,listCountryPolicies,getCountry} from "../../security/country-policy.service.js";
import {
  activateTrustKey,confirmEmailCode,getVerification,listPendingReviews,
  platformApproveVerification,platformRejectVerification,platformSetVerificationCheck,platformTrustStatus,platformVerificationProfileForRoute,
  sendEmailCode,submitVerification,submitCountryVerification,updateVerificationProfile,listVerificationCompanies
} from "./verification.service.js";

export function registerVerificationRoutes(router){
  router.get("/api/verification",async({request,env})=>{
    try{
      const s=await requireRole(request,env,["admin","driver","executor"]);
      return json({success:true,verification:await getVerification(env,s)});
    }catch(e){return fail(e);}
  });

  router.get("/api/verification/companies",async({request,env})=>{try{const s=await requireRole(request,env,["driver"]);return json({success:true,companies:await listVerificationCompanies(env,s)});}catch(e){return fail(e);}});

  router.patch("/api/verification/profile",async({request,env})=>{
    try{
      const s=await requireRole(request,env,["admin","driver","executor"]);
      const body=await readJson(request);
      return json({success:true,verification:await updateVerificationProfile(env,s,{personName:cleanText(body.personName,160),email:cleanText(body.email,200),phone:cleanText(body.phone,60)})});
    }catch(e){return fail(e);}
  });

  router.post("/api/verification/email/send",async({request,env})=>{
    try{
      const s=await requireRole(request,env,["admin","driver","executor"]);
      await consumeRateLimit(env,`verification-email-send:${requestIp(request)}:${s.role}:${s.identityId||s.executorId||s.tenantId}`,{limit:5,windowSeconds:3600});
      return json({success:true,...await sendEmailCode(env,s)});
    }catch(e){return fail(e);}
  });

  router.post("/api/verification/email/confirm",async({request,env})=>{
    try{
      const s=await requireRole(request,env,["admin","driver","executor"]);
      await consumeRateLimit(env,`verification-email-confirm:${requestIp(request)}:${s.role}:${s.identityId||s.executorId||s.tenantId}`,{limit:10,windowSeconds:900});
      const body=await readJson(request);
      return json({success:true,verification:await confirmEmailCode(env,s,cleanText(body.code,12))});
    }catch(e){return fail(e);}
  });

  router.post("/api/verification/country/submit",async({request,env})=>{
    try{
      const s=await requireRole(request,env,["admin","driver","executor"]);
      const body=await readJson(request);
      return json({success:true,verification:await submitCountryVerification(env,s,{countryCode:cleanText(body.countryCode,2).toUpperCase(),addressLine1:cleanText(body.addressLine1,240),addressLine2:cleanText(body.addressLine2,240),postalCode:cleanText(body.postalCode,40),city:cleanText(body.city,120),region:cleanText(body.region,120)})});
    }catch(e){return fail(e);}
  });

  router.post("/api/verification/submit",async({request,env})=>{
    try{
      const s=await requireRole(request,env,["admin","driver","executor"]);
      return json({success:true,verification:await submitVerification(env,s)});
    }catch(e){return fail(e);}
  });

  router.post("/api/verification/trust-key/activate",async({request,env})=>{
    try{
      const s=await requireRole(request,env,["admin","driver","executor"]);
      await consumeRateLimit(env,`trust-key-activate:${requestIp(request)}:${s.role}:${s.identityId||s.executorId||s.tenantId}`,{limit:8,windowSeconds:900});
      const body=await readJson(request);
      return json({success:true,verification:await activateTrustKey(env,s,cleanText(body.trustKey,100))});
    }catch(e){return fail(e);}
  });

  // Platform administration endpoints. Super Admin authority is required.
  router.get("/api/platform/activation/users",async({request,env})=>{try{const administrator=await requirePlatformSuperAdministrator(request,env);const q=new URL(request.url).searchParams.get("q")||"";const users=await searchActivationUsers(env,q);await audit(env,{session:administrator,action:"platform.activation.user_search",resourceType:"activation_user_search",metadata:{queryLength:String(q).length,resultCount:users.length}});return json({success:true,users});}catch(e){return fail(e);}});
  router.get(/^\/api\/platform\/activation\/users\/(?<identityType>tenant|driver|executor)\/(?<identityId>\d+)$/,async({request,env,params})=>{try{await requirePlatformSuperAdministrator(request,env);return json({success:true,...await platformActivationProfile(env,params.identityType,Number(params.identityId))});}catch(e){return fail(e);}});
  router.post("/api/platform/activation/review-requests",async({request,env})=>{try{const administrator=await requirePlatformSuperAdministrator(request,env);const body=await readJson(request);const result=await createActivationReviewRequest(env,administrator,{identityType:cleanText(body.identityType,20),identityId:Number(body.identityId||0),tenantId:Number(body.tenantId||0)||null,fields:body.fields,message:cleanText(body.message,1200)});return json({success:true,...result},201);}catch(e){return fail(e);}});

  router.get("/api/platform/verifications/pending",async({request,env})=>{
    try{
      const administrator=await requirePlatformSuperAdministrator(request,env);
      return json({success:true,reviews:await listPendingReviews(env)});
    }catch(e){return fail(e);}
  });

  router.get(/^\/api\/platform\/verifications\/(?<profileId>\d+)\/review$/,async({request,env,params})=>{
    try{await requirePlatformSuperAdministrator(request,env);return json({success:true,...await platformVerificationProfileForRoute(env,Number(params.profileId))});}catch(e){return fail(e);}
  });

  router.patch(/^\/api\/platform\/verifications\/(?<profileId>\d+)\/check$/,async({request,env,params})=>{
    try{
      const administrator=await requirePlatformSuperAdministrator(request,env);
      const body=await readJson(request);
      const result=await platformSetVerificationCheck(env,Number(params.profileId),{
        checkType:cleanText(body.checkType,40),status:cleanText(body.status,24),note:cleanText(body.note,500),countryCode:cleanText(body.countryCode,2).toUpperCase()
      });
      await audit(env,{session:administrator,action:"platform.verification.check",resourceType:"verification_profile",resourceId:Number(params.profileId)});
      return json({success:true,...result});
    }catch(e){return fail(e);}
  });

  router.post(/^\/api\/platform\/verifications\/(?<profileId>\d+)\/approve$/,async({request,env,params})=>{
    try{
      const administrator=await requirePlatformSuperAdministrator(request,env);
      const body=await readJson(request);
      const result=await platformApproveVerification(env,Number(params.profileId),{
        note:cleanText(body.note,1000),expiresAt:cleanText(body.expiresAt,40)
      });
      await audit(env,{session:administrator,action:"platform.verification.approve",resourceType:"verification_profile",resourceId:Number(params.profileId)});
      return json({success:true,...result});
    }catch(e){return fail(e);}
  });

  router.post(/^\/api\/platform\/verifications\/(?<profileId>\d+)\/reject$/,async({request,env,params})=>{
    try{
      const administrator=await requirePlatformSuperAdministrator(request,env);
      const body=await readJson(request);
      const result=await platformRejectVerification(env,Number(params.profileId),{note:cleanText(body.note,1000)});
      await audit(env,{session:administrator,action:"platform.verification.reject",resourceType:"verification_profile",resourceId:Number(params.profileId)});
      return json({success:true,...result});
    }catch(e){return fail(e);}
  });

  router.post(/^\/api\/platform\/verifications\/(?<profileId>\d+)\/trust-status$/,async({request,env,params})=>{
    try{
      const administrator=await requirePlatformSuperAdministrator(request,env);
      const body=await readJson(request);
      const result=await platformTrustStatus(env,Number(params.profileId),{
        status:cleanText(body.status,24),note:cleanText(body.note,500)
      });
      await audit(env,{session:administrator,action:"platform.verification.trust_status",resourceType:"verification_profile",resourceId:Number(params.profileId)});
      return json({success:true,...result});
    }catch(e){return fail(e);}
  });
  router.get("/api/platform/policy/countries",async({request,env})=>{try{await requirePlatformSuperAdministrator(request,env);const url=new URL(request.url);const q=url.searchParams.get("q")||"";const limit=Math.min(25,Math.max(1,Number(url.searchParams.get("limit")||8)));return json({success:true,query:q,limit,countries:await listCountries(env,{query:q,limit})});}catch(e){return fail(e);}});
  router.get(/^\/api\/platform\/policy\/countries\/(?<countryCode>[A-Za-z]{2})\/rules$/,async({request,env,params})=>{try{await requirePlatformSuperAdministrator(request,env);return json({success:true,country:await getCountry(env,params.countryCode),policies:await listCountryPolicies(env,params.countryCode)});}catch(e){return fail(e);}});
  router.post("/api/platform/policy/countries",async({request,env})=>{try{const administrator=await requirePlatformSuperAdministrator(request,env);const body=await readJson(request);const result=await createCountry(env,{code:body.code,name:body.name,defaultSubscriptionClass:body.defaultSubscriptionClass,requiresReview:body.requiresReview,rules:body.rules});await audit(env,{session:administrator,action:"platform.policy.country.create",resourceType:"country_policy",resourceId:String(body.code||"").trim().toUpperCase()});return json({success:true,...result});}catch(e){return fail(e);}});

}


function fail(e){
  const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:500);
  const error=e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message||"Verification operation failed";
  return json({success:false,error},status);
}
