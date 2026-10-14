import {resolveUserSituation} from "./user-situation.service.js";
// Historical contract marker: resolveSubscriptionContext is now consumed only inside the canonical User Situation.


export async function getEntitlements(env,companyId){
  const row=await env.DB.prepare(`SELECT ai.role,ai.company_id,cvs.country_code,cvs.status AS verification_status FROM auth_identities ai LEFT JOIN company_verification_status cvs ON cvs.company_id=ai.company_id WHERE ai.company_id=? AND ai.role='admin' LIMIT 1`).bind(companyId).first();
  const countryCode=String(row?.country_code||"").trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(countryCode)||countryCode==="ZZ"){const e=new Error("TENANT_COUNTRY_UNRESOLVED");e.status=409;throw e;}
  const situation=await resolveUserSituation(env,{role:"admin",tenantId:companyId,companyVerified:row?.verification_status==="verified",countryCode});
  const active=situation.accessState==="active"||situation.accessState==="grace";
  return {subscribed:active,status:situation.subscription?.status||situation.accessState,subscriptionClass:situation.subscriptionClass,plan:situation.planCode?{code:situation.planCode,name:situation.subscription?.plan_name||`Gift ${situation.planCode}`}:null,limits:situation.limits,features:situation.capabilities,countryCode:situation.countryCode,verification:situation.verification,accessState:situation.accessState,usage:situation.usage,giftGrant:situation.giftGrant,cancelAtPeriodEnd:Number(situation.subscription?.cancel_at_period_end||0)===1,currentPeriodStart:situation.period?.start||null,currentPeriodEnd:situation.period?.end||null};
}

export async function requireEntitlement(env,companyId,feature){
  const e=await getEntitlements(env,companyId);
  if(!e.subscribed){const x=new Error(e.accessState==="verification_required"?"VERIFICATION_REQUIRED":"ACTIVE_SUBSCRIPTION_REQUIRED");x.status=402;throw x;}
  if(feature==="publicMissions"&&!e.features.shareForYou){const x=new Error("PLAN_UPGRADE_REQUIRED");x.status=403;throw x;}
  return e;
}
