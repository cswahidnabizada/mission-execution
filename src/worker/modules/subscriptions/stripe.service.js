import {resolveExternalProviderGovernance} from '../../security/external-provider-governance.service.js';
const API="https://api.stripe.com/v1";
async function post(env,path,params){
  if(!env.STRIPE_SECRET_KEY){const e=new Error("Stripe is not configured");e.status=503;throw e;}
  const companyId=Number(params.company_id||params['metadata[company_id]']||params['client_reference_id']||0)||null;
  await resolveExternalProviderGovernance(env,{providerCode:'stripe',companyId,purposeCode:'billing',classification:'CONFIDENTIAL',dataFields:['company_id','customer_id','plan_id','billing_return_url'],authorizationScope:'billing_provider',authorizationGranted:true,operation:path});
  const body=new URLSearchParams();
  Object.entries(params).forEach(([k,v])=>{if(v!==null&&v!==undefined)body.append(k,String(v));});
  const r=await fetch(API+path,{method:"POST",headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,"Content-Type":"application/x-www-form-urlencoded"},body});
  const d=await r.json(); if(!r.ok){const e=new Error(d?.error?.message||"Stripe request failed");e.status=r.status===404?404:502;e.code=d?.error?.code||null;throw e;} return d;
}

export async function getStripeCustomer(env,id){
  if(!env.STRIPE_SECRET_KEY){const e=new Error("Stripe is not configured");e.status=503;throw e;}
  await resolveExternalProviderGovernance(env,{providerCode:'stripe',purposeCode:'billing',classification:'CONFIDENTIAL',dataFields:['customer_id'],authorizationScope:'billing_provider',authorizationGranted:true,operation:'customer_read'});
  const r=await fetch(API+`/customers/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`}});
  const d=await r.json();
  if(!r.ok){const e=new Error(d?.error?.message||"Stripe customer lookup failed");e.status=r.status===404?404:502;e.code=d?.error?.code||null;throw e;}
  return d;
}
export const createStripeCustomer=(env,{companyId})=>post(env,"/customers",{"metadata[company_id]":companyId,description:`ON Mission tenant ${companyId}`});
export const createCheckoutSession=(env,d)=>post(env,"/checkout/sessions",{
  mode:"subscription",customer:d.customerId,"line_items[0][price]":d.priceId,"line_items[0][quantity]":1,
  success_url:d.successUrl,cancel_url:d.cancelUrl,client_reference_id:d.companyId,
  "metadata[company_id]":d.companyId,"subscription_data[metadata][company_id]":d.companyId,allow_promotion_codes:"true"
});
export const createPortalSession=(env,d)=>post(env,"/billing_portal/sessions",{customer:d.customerId,return_url:d.returnUrl});

async function del(env,path){
  if(!env.STRIPE_SECRET_KEY){const e=new Error("Stripe is not configured");e.status=503;throw e;}
  const r=await fetch(API+path,{method:"DELETE",headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`}});
  const d=await r.json();if(!r.ok){const e=new Error(d?.error?.message||"Stripe delete failed");e.status=502;throw e;}return d;
}

export async function listStripeCustomerSubscriptions(env,id){
  if(!env.STRIPE_SECRET_KEY){const e=new Error("Stripe is not configured");e.status=503;throw e;}
  await resolveExternalProviderGovernance(env,{providerCode:'stripe',purposeCode:'billing',classification:'CONFIDENTIAL',dataFields:['customer_id'],authorizationScope:'billing_provider',authorizationGranted:true,operation:'subscription_list'});
  const r=await fetch(API+`/subscriptions?customer=${encodeURIComponent(id)}&status=all&limit=20`,{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`}});
  const d=await r.json();
  if(!r.ok){const e=new Error(d?.error?.message||"Stripe subscription lookup failed");e.status=r.status===404?404:502;e.code=d?.error?.code||null;throw e;}
  return Array.isArray(d?.data)?d.data:[];
}
export const deleteStripeSubscription=(env,id)=>id?del(env,`/subscriptions/${encodeURIComponent(id)}`):null;
export const deleteStripeCustomer=(env,id)=>id?del(env,`/customers/${encodeURIComponent(id)}`):null;
