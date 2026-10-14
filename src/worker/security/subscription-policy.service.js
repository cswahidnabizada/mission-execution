import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';
import {getSubscriptionByCompany,getActiveSubscriptionGrant} from "../repositories/subscription.repository.js";

const PAID=new Set(["active","trialing"]);
const GRACE=new Set(["past_due","unpaid"]);
const SUBJECTS=new Set(["tenant_admin","independent_executor"]);
// Historical release vocabulary retained for regression compatibility: MISSION_LIMIT_REACHED / DRIVER_LIMIT_REACHED.

const EXEMPT_ROLES=new Set(["driver"]);

export function subjectType(session){
  if(session?.role==="executor") return "independent_executor";
  if(session?.role==="admin") return "tenant_admin";
  return null;
}
function country(value){const c=String(value||"ZZ").trim().toUpperCase();return /^[A-Z]{2}$/.test(c)?c:"ZZ";}
function verified(session){return session?.companyVerified===true || session?.verificationComplete===true;}
async function policy(env,type,countryCode,planCode=null){
  if(!SUBJECTS.has(type)) return null;
  const base=country(countryCode);
  let q=`SELECT * FROM subscription_policies WHERE subject_type=? AND country_code=? AND active=1`;
  const args=[type,base];
  if(planCode){q+=` AND plan_code=?`;args.push(planCode);}
  q+=` ORDER BY id ASC LIMIT 1`;
  return (await env.DB.prepare(q).bind(...args).first()) || (base!=="ZZ"?await env.DB.prepare(`SELECT * FROM subscription_policies WHERE subject_type=? AND country_code='ZZ' AND active=1${planCode?' AND plan_code=?':''} ORDER BY id ASC LIMIT 1`).bind(...(planCode?[type,planCode]:[type])).first():null);
}
async function usage(env,subject,periodStart,periodEnd){
  const start=periodStart?new Date(periodStart).toISOString():null;
  const end=periodEnd?new Date(periodEnd).toISOString():null;
  if(subject.type==="tenant_admin"){
    const [m,d]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS c FROM mission_canonical_projection WHERE company_id=? AND created_at>=? AND created_at<?`).bind(subject.id,start,end).first(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM drivers WHERE company_id=? AND created_at>=? AND created_at<?`).bind(subject.id,start,end).first()
    ]);
    const active=await env.DB.prepare(`SELECT COUNT(*) AS c FROM drivers WHERE company_id=? AND active=1 AND removed_at IS NULL`).bind(subject.id).first();
    return {missionsCreated:Number(m?.c||0),driversCreated:Number(d?.c||0),activeDrivers:Number(active?.c||0)};
  }
  const m=await env.DB.prepare(`SELECT COUNT(*) AS c FROM mission_assignments ma JOIN mission_canonical_projection m ON m.id=ma.mission_id AND m.company_id=ma.company_id WHERE ma.assignee_type='executor' AND ma.assignee_id=? AND ma.status='active' AND m.created_at>=? AND m.created_at<?`).bind(subject.id,start,end).first();
  return {missionsCreated:Number(m?.c||0),driversCreated:0,activeDrivers:0};
}
function nextPeriod(start,days){const d=new Date(start);d.setUTCDate(d.getUTCDate()+Number(days||30));return d.toISOString();}
export async function resolveSubscriptionContext(env,session){
  const type=subjectType(session); if(!type) return {subjectType:null,accessState:"not_applicable"};
  const id=type==="tenant_admin"?Number(session.tenantId):Number(session.executorId);
  const declaredCountryCode=country(session.countryCode);
  let verifiedCountryCode=null;
  const vp=await canonicalFirst(env,`SELECT id,declared_country_code,verified_country_code,review_status FROM verification_profiles WHERE identity_type=? AND identity_id=? ORDER BY id DESC LIMIT 1`,[type==="tenant_admin"?"tenant":"executor",id],'subscription_policy');
  verifiedCountryCode=vp?.verified_country_code?country(vp.verified_country_code):null;
  const countryCode=verifiedCountryCode||"ZZ";
  let canonicalVerified=false;
  if(vp?.id){
    const checks=await canonicalAll(env,`SELECT check_type,status FROM verification_checks WHERE profile_id=?`,[Number(vp.id)],'subscription_policy');
    const by=Object.fromEntries(checks.map(x=>[String(x.check_type),String(x.status)]));
    const required=["email","phone","company","country","identity"];
    const complete=required.every(x=>by[x]==="verified");
    const key=await canonicalFirst(env,`SELECT status,expires_at FROM trust_keys WHERE profile_id=? AND status='active' ORDER BY id DESC LIMIT 1`,[Number(vp.id)],'subscription_policy');
    const keyActive=key?.status==='active' && (!key.expires_at || Date.parse(String(key.expires_at).replace(' ','T')+(/[Zz]$/.test(String(key.expires_at))?'':'Z'))>Date.now());
    canonicalVerified=complete && String(vp.review_status||'')==='approved' && keyActive && Boolean(verifiedCountryCode);
  }
  const isVerified=canonicalVerified;
  let verificationApprovedAt=session.verificationApprovedAt||null;
  if(type==="independent_executor" && !verificationApprovedAt){const vp=await env.DB.prepare(`SELECT reviewed_at FROM verification_profiles WHERE identity_type='executor' AND identity_id=? AND review_status='approved' ORDER BY id DESC LIMIT 1`).bind(id).first();verificationApprovedAt=vp?.reviewed_at||null;}
  const sub=type==="tenant_admin"?await getSubscriptionByCompany(env,id):null;
  const grant=type==="tenant_admin"?await getActiveSubscriptionGrant(env,id):null;
  const planCode=grant?.plan_code || sub?.plan_code || (type==="independent_executor"?"executor":null);
  const p=await policy(env,type,countryCode,planCode);
  // Independent executors are currently non-commercial. If no explicit executor
  // billing policy exists for the jurisdiction, remain exempt rather than turning
  // a missing future policy into an accidental subscription requirement. A later
  // paid executor policy can be introduced simply by adding an active policy row.
  if(!p && type==="independent_executor") return {
    subjectType:type,subjectId:id,countryCode,declaredCountryCode,verifiedCountryCode,
    verification:{required:true,verified:isVerified},accessState:"active",
    subscriptionClass:"exempt",subscriptionRequired:false,eligibleForSubscription:false,
    subscription:null,policy:null,period:null,usage:null,limits:{drivers:null,missionsPeriod:null,storageMb:null},
    features:{publicMissions:false,createMissions:false,createDrivers:false,shareForYou:false,requestForYou:true,shareNetwork:false,acceptNetwork:true}
  };
  if(!p) return {subjectType:type,subjectId:id,countryCode,declaredCountryCode,verifiedCountryCode,verification:{required:true,verified:isVerified},accessState:"policy_unavailable",subscription:sub,policy:null,usage:null};
  const executorPaidPolicy=type==="independent_executor" && String(p.billing_mode||"").toLowerCase()==="paid" && String(p.subscription_class||"").toLowerCase()==="eligible";
  const normalizedPolicy=type==="independent_executor" && !executorPaidPolicy ? {...p,billing_mode:"free",subscription_class:"exempt",max_drivers:null} : p;
  const effectivePolicy=grant?{...normalizedPolicy,billing_mode:"free",subscription_class:"exempt",billing_period_days:Math.max(1,Math.floor((new Date(grant.ends_at).getTime()-new Date(grant.starts_at).getTime())/86400000))}:normalizedPolicy;
  let periodStart=grant?.starts_at || sub?.current_period_start || null, periodEnd=grant?.ends_at || sub?.current_period_end || null;
  if(effectivePolicy.billing_mode==="paid" && sub && (!periodStart || !periodEnd)){
    const anchor=new Date(sub.created_at||Date.now());
    periodStart=periodStart||anchor.toISOString();
    periodEnd=periodEnd||nextPeriod(periodStart,effectivePolicy.billing_period_days);
  }
  if(effectivePolicy.billing_mode==="free" && isVerified && !grant){
    const anchor=new Date(verificationApprovedAt||session.createdAt||Date.now());
    const now=new Date();
    if(!periodStart) periodStart=anchor.toISOString();
    while(new Date(periodEnd||periodStart)<=now){periodStart=new Date(periodEnd||periodStart).toISOString();periodEnd=nextPeriod(periodStart,p.billing_period_days);}
    if(!periodEnd) periodEnd=nextPeriod(periodStart,p.billing_period_days);
  }
  const usageData=periodStart&&periodEnd?await usage(env,{type,id},periodStart,periodEnd):null;
  let accessState="active";
  if(!isVerified && effectivePolicy.verification_required) accessState="verification_required";
  else if(effectivePolicy.billing_mode==="paid" && !sub) accessState="subscription_required";
  else if(effectivePolicy.billing_mode==="paid" && !PAID.has(String(sub?.status||""))){
    if(GRACE.has(String(sub?.status||"")) && periodEnd && Date.now()<=new Date(periodEnd).getTime()+Number(effectivePolicy.grace_days)*86400000) accessState="grace";
    else accessState="payment_required";
  }
  else if(periodEnd && Date.now()>new Date(periodEnd).getTime()) accessState="period_expired";
  return {subjectType:type,subjectId:id,countryCode,declaredCountryCode,verifiedCountryCode,subscriptionClass:String(effectivePolicy.subscription_class || (effectivePolicy.billing_mode==="paid"?"eligible":"exempt")),verification:{required:Number(effectivePolicy.verification_required)===1,verified:isVerified},accessState,subscription:sub,giftGrant:grant?{id:Number(grant.id),grantType:grant.grant_type,planCode:grant.plan_code,startsAt:grant.starts_at,endsAt:grant.ends_at}:null,policy:effectivePolicy,period:{start:periodStart,end:periodEnd,days:Number(effectivePolicy.billing_period_days)},usage:usageData,limits:{drivers:effectivePolicy.max_drivers===null?null:Number(effectivePolicy.max_drivers),missionsPeriod:effectivePolicy.max_missions_period===null?null:Number(effectivePolicy.max_missions_period),storageMb:effectivePolicy.max_storage_mb===null?null:Number(effectivePolicy.max_storage_mb)},features:{publicMissions:Number(effectivePolicy.public_missions_enabled)===1,createMissions:Number(effectivePolicy.can_create_missions||0)===1,createDrivers:Number(effectivePolicy.can_create_drivers||0)===1,shareForYou:Number(effectivePolicy.can_share_foryou||0)===1,requestForYou:Number(effectivePolicy.can_request_foryou||0)===1,shareNetwork:Number(effectivePolicy.can_share_network||0)===1,acceptNetwork:Number(effectivePolicy.can_accept_network||0)===1}};
}
export async function resolveSubscriptionEligibility(env,session){
  const role=String(session?.role||"");
  if(role==="driver")return {class:"exempt",reason:"driver_role",eligibleForSubscription:false,subscriptionRequired:false,subscriptionClass:"exempt",capabilities:{}};
  const c=await resolveSubscriptionContext(env,session);
  if(c.subjectType===null)return {class:"exempt",reason:"role_not_commercial",eligibleForSubscription:false,subscriptionRequired:false,subscriptionClass:"exempt",capabilities:{}};
  const exempt=c.subscriptionClass==="exempt";
  return {class:exempt?"exempt":"eligible",reason:c.giftGrant?"gift_access":c.policy?.billing_mode==="free"?"country_or_subject_policy":"paid_country_policy",eligibleForSubscription:!exempt,subscriptionRequired:!exempt,subscriptionClass:c.subscriptionClass,accessState:c.accessState,planCode:c.giftGrant?.planCode||c.subscription?.plan_code||c.policy?.plan_code||null,countryCode:c.countryCode,verification:c.verification,period:c.period,usage:c.usage,limits:c.limits,capabilities:c.features};
}
