import {cleanText,json,readJson} from "../../core/http.js";
import {requireAdmin,requireSession} from "../../core/auth-session.js";
import {audit} from "../../security/audit.js";
import {currentSubscription,openPortal,startCheckout,redeemSubscriptionGift,reconcileStripeSubscription,availablePlans,updateBillingIdentity} from "./subscription.service.js";
import {processStripeEvent,verifyStripeWebhook} from "./stripe.webhook.js";
import {consumeRateLimit,requestIp} from "../../security/rate-limit.js";
import {resolveUserSituation} from "../../security/user-situation.service.js";
import {publicErrorMessage} from "../../core/http.js";
// Historical contract marker: policy:await resolveSubscriptionContext(env,s) is now represented by the canonical /api/user/situation resolver.
export function registerSubscriptionRoutes(router){
  router.get("/api/user/situation",async({request,env})=>{try{const s=await requireSession(request,env);return json({success:true,situation:await resolveUserSituation(env,s)});}catch(e){return fail(e);}});
  router.get("/api/subscriptions/plans",async({request,env})=>{try{const s=await requireSession(request,env);return json({success:true,plans:await availablePlans(env,s)});}catch(e){return fail(e);}});
  router.get("/api/subscriptions/current",async({request,env})=>{try{const s=await requireAdmin(request,env);return json({success:true,...await currentSubscription(env,s)});}catch(e){return fail(e);}});
  router.patch("/api/subscriptions/billing-identity",async({request,env})=>{try{const s=await requireAdmin(request,env),b=await readJson(request);return json({success:true,billingIdentity:await updateBillingIdentity(env,s,{legalName:cleanText(b.legalName,240),billingEmail:cleanText(b.billingEmail,240),address:b.address||{},taxRegistrationStatus:cleanText(b.taxRegistrationStatus,40)})});}catch(e){return fail(e);}});
  router.post("/api/subscriptions/checkout",async({request,env})=>{try{const s=await requireAdmin(request,env),b=await readJson(request),plan=cleanText(b.plan,32).toLowerCase(),c=await startCheckout(env,s,plan);await audit(env,{session:s,action:"subscription.checkout_started",resourceType:"subscription",metadata:{plan}});return json({success:true,url:c.url});}catch(e){return fail(e);}});
  router.post("/api/subscriptions/reconcile",async({request,env})=>{try{const s=await requireAdmin(request,env);await consumeRateLimit(env,`provider-reconcile:${requestIp(request)}:${Number(s.tenantId)||0}`,{limit:5,windowSeconds:900});const result=await reconcileStripeSubscription(env,s);return json({success:true,...result});}catch(e){return fail(e);}});
  router.post("/api/subscriptions/portal",async({request,env})=>{try{const s=await requireAdmin(request,env),p=await openPortal(env,s);return json({success:true,url:p.url});}catch(e){return fail(e);}});
  router.post("/api/subscriptions/gift/redeem",async({request,env})=>{try{const s=await requireAdmin(request,env),b=await readJson(request),result=await redeemSubscriptionGift(env,s,b.code);await audit(env,{session:s,action:"subscription.gift.redeemed",resourceType:"subscription_grant",resourceId:result.grantId,metadata:{planCode:result.planCode,endsAt:result.endsAt}});return json({success:true,...result});}catch(e){return fail(e);}});
  router.get("/api/subscriptions/policy",async({request,env})=>{try{const s=await requireSession(request,env);return json({success:true,situation:await resolveUserSituation(env,s)});}catch(e){return fail(e);}});
  router.get("/api/subscriptions/eligibility",async({request,env})=>{try{const s=await requireSession(request,env);return json({success:true,situation:await resolveUserSituation(env,s)});}catch(e){return fail(e);}});
  router.post("/api/stripe/webhook",async({request,env})=>{try{const event=await verifyStripeWebhook(request,env);await processStripeEvent(env,event);return json({received:true});}catch(e){console.error("STRIPE_WEBHOOK_ERROR",e);return json({received:false,error:publicErrorMessage(e,"Payment service webhook could not be processed")},e.status||400);}});
}

function fail(e){const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:e?.message==="FORBIDDEN"?403:500);const fallback=e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message==="TOO_MANY_ATTEMPTS"?"Too many requests. Please wait briefly and try again.":"Subscription operation failed";return json({success:false,error:publicErrorMessage(e,fallback)},status);}
