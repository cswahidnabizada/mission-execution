/**
 * ON Mission 10.31.71 — Canonical User Situation
 *
 * The single read-only commercial/access situation consumed by Actions Intelligence
 * and secured action gates. It composes identity role, jurisdiction, verification,
 * subscription eligibility, billing period, gift access, usage and capabilities.
 * It never replaces domain authorization, mission truth, custody or lifecycle truth.
 */
import {
  resolveSubscriptionContext,
} from "./subscription-policy.service.js";
import {resolveIdentityClassification} from "./user-classification.core.js";
import {consumeOperationalAccess} from "./operational-access-cache.js";
import {listEntitlements} from "../repositories/subscription.repository.js";
import {resolveProductConfiguration,roleCanAction} from './product-configuration.service.js';
import {resolveCanonicalComplianceContext} from './compliance-context.service.js';
import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';

const situationRequestCache=new WeakMap();

export async function resolveUserSituation(env, session, {productConfiguration=null}={}){
  if(session && typeof session==='object'){
    let cache=situationRequestCache.get(session);
    if(!cache){cache=new Map();situationRequestCache.set(session,cache);}
    const key=productConfiguration&&typeof productConfiguration==='object'?productConfiguration:DEFAULT_PRODUCT_CACHE_KEY;
    if(cache.has(key))return cache.get(key);
    const promise=resolveUserSituationFresh(env,session,{productConfiguration});
    cache.set(key,promise);
    return promise;
  }
  return resolveUserSituationFresh(env,session,{productConfiguration});
}

const DEFAULT_PRODUCT_CACHE_KEY={};

async function resolveUserSituationFresh(env, session, {productConfiguration=null}={}){
  const context=await resolveSubscriptionContext(env,session);
  const identity=await resolveIdentityClassification(env,session);
  const role=String(session?.role||"");
  const organizationRole=String(session?.organizationRole||identity?.actor?.roles?.find?.(x=>['owner','admin','manager','operator','developer'].includes(String(x)))||'');
  const product=productConfiguration||await resolveProductConfiguration(env);
  const commercial=Boolean(context?.subjectType);
  const className=commercial?String(context?.subscriptionClass||"eligible"):"exempt";
  const verification=await resolveOperationalVerification(env,session,context);
  const verified=verification.verified;
  const accessState=String(context?.accessState||"not_applicable");
  const entitlements=commercial?await listEntitlements(env,context?.subjectId||session?.tenantId||0):[];
  const entitlementCapabilities=Object.fromEntries(entitlements.filter(e=>String(e.status)==='entitled').map(e=>[String(e.capability_code),true]));
  const rawCapabilities={...(commercial?context?.features||{}:{}),...entitlementCapabilities};
  const missionLimitReached=Number(context?.limits?.missionsPeriod??-1)>=0 && Number(context?.usage?.missionsCreated||0)>=Number(context?.limits?.missionsPeriod);
  const driverLimitReached=Number(context?.limits?.drivers??-1)>=0 && Number(context?.usage?.activeDrivers||0)>=Number(context?.limits?.drivers);
  // Commercial plan capability is necessary but not sufficient for operational
  // access. The canonical verification contract must be fully trusted before
  // creation/distribution rights become visible or executable.
  const accountActive=identity.account?.state==='active';
  const unrestricted=Array.isArray(identity.restrictions)?identity.restrictions.length===0:true;
  const subscriptionOperational=accessState==='active'||accessState==='grace'||className==='exempt';
  const operationalReady=verified&&accountActive&&unrestricted&&subscriptionOperational;
  const capabilities=Object.freeze({
    ...rawCapabilities,
    createMissions:operationalReady && (rawCapabilities.createMissions===true || (role==='admin' && ['starter','business','free'].includes(String(context?.policy?.plan_code||context?.subscription?.plan_code||'')))) && !missionLimitReached,
    createDrivers:operationalReady && rawCapabilities.createDrivers===true && !driverLimitReached,
    // READY TO GO establishes operational access. Mission collaboration actions
    // are then available to the role and secured mission context; plan/country
    // policy still controls eligibility, while capacity limits control volume.
    shareForYou:operationalReady,
    requestForYou:operationalReady,
    shareNetwork:operationalReady,
    acceptNetwork:operationalReady
  });
  const capacity=Object.freeze({
    missions:Object.freeze({used:Number(context?.usage?.missionsCreated||0),limit:context?.limits?.missionsPeriod==null?null:Number(context.limits.missionsPeriod),remaining:context?.limits?.missionsPeriod==null?null:Math.max(0,Number(context.limits.missionsPeriod)-Number(context?.usage?.missionsCreated||0)),reached:missionLimitReached}),
    activeDrivers:Object.freeze({used:Number(context?.usage?.activeDrivers||0),limit:context?.limits?.drivers==null?null:Number(context.limits.drivers),remaining:context?.limits?.drivers==null?null:Math.max(0,Number(context.limits.drivers)-Number(context?.usage?.activeDrivers||0)),reached:driverLimitReached})
  });
  const compliance=await resolveCanonicalComplianceContext(env,session,{countryCode:context?.verifiedCountryCode||verification.verifiedCountryCode||"ZZ"});
  const effectiveCapabilities=Object.freeze({
    ...capabilities,
    shareForYou:capabilities.shareForYou===true && Boolean(compliance?.actionPolicy?.share_foryou!==false),
    requestForYou:capabilities.requestForYou===true && Boolean(compliance?.actionPolicy?.request_foryou_mission!==false),
    shareNetwork:capabilities.shareNetwork===true && Boolean(compliance?.actionPolicy?.share_network!==false),
    acceptNetwork:capabilities.acceptNetwork===true && Boolean(compliance?.actionPolicy?.accept_network!==false)
  });
  const journey=Object.freeze(deriveProductJourney({accountActive,verified,commercial,subscriptionOperational,accessState,restrictions:identity.restrictions,readyToGo:operationalReady}));
  const configuredActionCodes=['create_mission','create_driver','share_foryou','request_foryou_mission','share_network','accept_network','repost_foryou','restart_network','edit_mission','edit_mission_data','delete_mission','assign_driver','change_driver','approve_foryou_request','decline_foryou_request'];
  const actionPolicy=Object.fromEntries(configuredActionCodes.map(code=>[code,roleCanAction(product,organizationRole,code)]));
  const governedCapabilities=Object.freeze({...effectiveCapabilities,createMissions:effectiveCapabilities.createMissions===true && (organizationRole?roleCanAction(product,organizationRole,'create_mission'):role==='admin'),createDrivers:effectiveCapabilities.createDrivers===true && (organizationRole?roleCanAction(product,organizationRole,'create_driver'):role==='admin'),shareForYou:effectiveCapabilities.shareForYou===true && (organizationRole?roleCanAction(product,organizationRole,'share_foryou'):true),requestForYou:effectiveCapabilities.requestForYou===true && (organizationRole?roleCanAction(product,organizationRole,'request_foryou_mission'):true),shareNetwork:effectiveCapabilities.shareNetwork===true && (organizationRole?roleCanAction(product,organizationRole,'share_network'):true),acceptNetwork:effectiveCapabilities.acceptNetwork===true && (organizationRole?roleCanAction(product,organizationRole,'accept_network'):true)});
  const commercialRestrictions=Object.freeze({
    verificationRequired:!verified && Boolean(context?.verification?.required),
    subscriptionRequired:commercial && className!=="exempt",
    paymentRequired:["payment_required","period_expired"].includes(accessState),
    subscriptionLimitReached:missionLimitReached||driverLimitReached,
    missionLimitReached,
    driverLimitReached,
    forYouSharing:effectiveCapabilities.shareForYou!==true,
    forYouRequesting:effectiveCapabilities.requestForYou!==true,
    networkSharing:effectiveCapabilities.shareNetwork!==true,
    networkAccepting:effectiveCapabilities.acceptNetwork!==true,
    missionCreation:capabilities.createMissions!==true,
    driverCreation:capabilities.createDrivers!==true
  });
  return Object.freeze({
    version:"2.1",
    role,
    subjectType:context?.subjectType||null,
    subjectId:context?.subjectId||null,
    countryCode:context?.verifiedCountryCode||"ZZ",
    country:Object.freeze({declared:verification.declaredCountryCode||context?.declaredCountryCode||context?.countryCode||"ZZ",verified:verification.verifiedCountryCode||null,status:(verification.checks||[]).some(c=>c.type==="country"&&c.status==="verified")?"verified":"pending"}),
    subscriptionClass:className,
    eligibleForSubscription:commercial && className!=="exempt",
    subscriptionRequired:commercial && className!=="exempt",
    verification:Object.freeze({...context?.verification, ...verification}),
    accessState,
    planCode:context?.giftGrant?.planCode||context?.subscription?.plan_code||context?.policy?.plan_code||null,
    subscription:context?.subscription||null,
    entitlements,
    policy:context?.policy||null,
    period:context?.period||null,
    usage:context?.usage||null,
    limits:context?.limits||null,
    capacity,
    giftGrant:context?.giftGrant||null,
    capabilities:governedCapabilities,
    restrictions:identity.restrictions,
    readyToGo:operationalReady,
    actions:{...buildActionSituation(governedCapabilities,commercialRestrictions),...Object.fromEntries(configuredActionCodes.map(code=>[code,{allowed:roleCanAction(product,organizationRole,code),reason:roleCanAction(product,organizationRole,code)?'configured_role_policy':'role_policy'}]))},
    commercialRestrictions,
    journey,
    compliance,
    account:identity.account,
    actor:identity.actor,
    organizationRole,
    product:product?{rendering:product.rendering,guidance:product.guidance,missionRules:product.mission_rules,capabilities:product.capabilities}:null,
    membership:identity.membership,
    classification:Object.freeze({platformUserId:identity.platformUserId,identity:identity.identity,account:identity.account,actor:identity.actor,membership:identity.membership,restrictions:identity.restrictions}),
    source:Object.freeze({authority:"canonical_user_situation",policyAuthority:"subscription_policy",classificationAuthority:"canonical_user_classification",compatibilityClassificationAuthority:"user_access" /* legacy test contract: classificationAuthority:"user_access" */})
  });
}

async function resolveOperationalVerification(env,session,context){
  const type=session?.role==="admin"?"tenant":session?.role==="executor"?"executor":session?.role==="driver"?"driver":null;
  const id=type==="tenant"?Number(session?.tenantId||0):type==="executor"?Number(session?.executorId||0):type==="driver"?Number(session?.driverId||0):0;
  const required=Boolean(context?.verification?.required)||type==="driver";
  if(!type||!id)return Object.freeze({required:Boolean(context?.verification?.required),verified:Boolean(context?.verification?.verified),reviewStatus:null,trustKeyStatus:null,checks:[]});
  const profile=await canonicalFirst(env,`SELECT id,review_status,declared_country_code,verified_country_code,address_line1,address_line2,postal_code,city,region,company_name_snapshot,person_name_snapshot,phone_snapshot,email_snapshot,identity_type,identity_id,company_id FROM verification_profiles WHERE identity_type=? AND identity_id=? ORDER BY id DESC LIMIT 1`,[type,id],'user_situation');
  if(!profile)return Object.freeze({required,verified:false,reviewStatus:"draft",trustKeyStatus:null,checks:[]});
  const rows=await canonicalAll(env,`SELECT check_type,status FROM verification_checks WHERE profile_id=?`,[Number(profile.id)],'user_situation');
  const checks=rows.results||[];
  const by=Object.fromEntries(checks.map(x=>[String(x.check_type),String(x.status)]));
  const requiredChecks=["email","phone","company","country","identity"];
  const checksComplete=requiredChecks.every(x=>by[x]==="verified");
  const trust=await canonicalFirst(env,`SELECT status,expires_at FROM trust_keys WHERE profile_id=? AND status IN ('active','issued','suspended') ORDER BY id DESC LIMIT 1`,[Number(profile.id)],'user_situation');
  const trustActive=trust?.status==="active" && (!trust.expires_at || Date.parse(String(trust.expires_at).replace(" ","T")+(/[Zz]$/.test(String(trust.expires_at))?"":"Z"))>Date.now());
  const approved=String(profile.review_status||"")==="approved";
  return Object.freeze({required,verified:Boolean(checksComplete&&approved&&trustActive),reviewStatus:profile.review_status||"draft",trustKeyStatus:trust?.status||null,declaredCountryCode:profile.declared_country_code||context?.declaredCountryCode||null,verifiedCountryCode:profile.verified_country_code||null,address:{line1:profile.address_line1||"",line2:profile.address_line2||"",postalCode:profile.postal_code||"",city:profile.city||"",region:profile.region||""},companyName:profile.company_name_snapshot||null,personName:profile.person_name_snapshot||null,phone:profile.phone_snapshot||null,email:profile.email_snapshot||null,identityType:profile.identity_type||type,identityId:Number(profile.identity_id||id),companyId:profile.company_id?Number(profile.company_id):null,checks});
}

const ACTION_CAPABILITY=Object.freeze({
  create_mission:"createMissions",
  create_driver:"createDrivers",
  share_foryou:"shareForYou",
  request_foryou_mission:"requestForYou",
  share_network:"shareNetwork",
  accept_network:"acceptNetwork",
  repost_foryou:"shareForYou",
  restart_network:"shareNetwork"
});

function deriveProductJourney({accountActive,verified,commercial,subscriptionOperational,accessState,restrictions,readyToGo}){
  if(!accountActive)return {stage:'account',label:'Activate your account',action:'/',reason:'Your account is not active.'};
  if(Array.isArray(restrictions)&&restrictions.length)return {stage:'resolve_restriction',label:'Resolve account restriction',action:'/',reason:'A current account restriction must be resolved before operational work.'};
  if(!verified)return {stage:'verification',label:'Complete verification',action:'/app#account?activation=1',reason:'Verification is required before operational access.'};
  if(commercial&&!subscriptionOperational)return {stage:'subscription',label:'Activate your plan',action:'/app#account?activation=1',reason:`Your subscription is ${accessState||'not active'}.`};
  if(!readyToGo)return {stage:'access',label:'Complete workspace setup',action:'/app',reason:'Your workspace is authenticated but not yet operationally ready.'};
  return {stage:'operate',label:'Continue operations',action:'#work',reason:'Your workspace is ready for governed mission execution.'};
}

function buildActionSituation(capabilities,restrictions){
  const out={};
  for(const [code,key] of Object.entries(ACTION_CAPABILITY))out[code]=Object.freeze({allowed:capabilities[key]===true,reason:capabilities[key]===true?"allowed":(restrictions?.[key]===true?"restricted":"unavailable")});
  // Safety/completion actions must remain available even when a plan no longer
  // permits creating new commercial exposure. They are not commercial acquisition.
  for(const code of ["cancel_foryou_request","decline_foryou_request","withdraw_foryou","withdraw_network"])out[code]=Object.freeze({allowed:true,reason:"safety_or_completion"});
  return Object.freeze(out);
}

const FRESH_AUTHORITY_ACTIONS=new Set([
  'remove_driver','archive_customer','request_trust','accept_trust','reject_trust','suspend_trust',
  'accept_network','reject_network','approve_foryou_request','decline_foryou_request',
  'assign_driver','change_driver','confirm_arrival','confirm_pickup','start_transit','confirm_delivery',
  'complete_mission','start_operation','complete_operation','start_custody_resolution','confirm_custody_release','finalize_custody_transfer',
  'accept_custody','reassign_custody_receiver','abort_custody_transfer','cancel_mission'
]);

export async function requireUserSituationAction(env,session,action){
  const code=String(action||'');
  if(FRESH_AUTHORITY_ACTIONS.has(code))return requireFreshUserSituationAction(env,session,code);
  const cached=session?.__operationalGateConsumed ? session?.operationalAccess : await consumeOperationalAccess(env,session?.__sessionToken||'');
  if(cached){
    const activation=cached.activation||{};
    if(activation.readyToGo!==true){const e=new Error(String(activation.access?.state||activation.next?.kind||'ACTIVATION_REQUIRED').toUpperCase());e.status=402;throw e;}
    const decision=activation.actions?.[code];
    const readyOperational=new Set(['create_mission','create_driver','share_foryou','request_foryou_mission','share_network','accept_network']);
    if(decision?.allowed===false&&!readyOperational.has(code)){const e=new Error(`SUBSCRIPTION_ACTION_NOT_ELIGIBLE:${code}`);e.status=403;throw e;}
    if(decision?.allowed===false&&readyOperational.has(code)){const e=new Error(`SUBSCRIPTION_ACTION_NOT_ELIGIBLE:${code}`);e.status=403;throw e;}
    return {readyToGo:true,actions:activation.actions,accessState:activation.access?.state||'active',subscriptionRequired:false,subscriptionClass:activation.billing?.subscriptionClass||'eligible',verification:{verified:true,required:false},account:{state:'active'},restrictions:activation.access?.restrictions||[]};
  }
  const situation=await resolveUserSituation(env,session);
  const decision=situation.actions?.[code];
  if(!decision)return situation;
  if(!situation.verification?.verified && situation.verification?.required){const e=new Error("VERIFICATION_REQUIRED");e.status=402;throw e;}
  if(situation.subscriptionRequired===true && situation.subscriptionClass==="eligible" && !["active","grace"].includes(String(situation.accessState||""))){const e=new Error(String(situation.accessState||"SUBSCRIPTION_REQUIRED").toUpperCase());e.status=402;throw e;}
  if(decision.allowed!==true){
    const readyOperational=new Set(['create_mission','create_driver','share_foryou','request_foryou_mission','share_network','accept_network']);
    if(!(readyOperational.has(code)&&situation.readyToGo)){const e=new Error(`SUBSCRIPTION_ACTION_NOT_ELIGIBLE:${code}`);e.status=403;throw e;}
  }
  return situation;
}

async function requireFreshUserSituationAction(env,session,code){
  const situation=await resolveUserSituation(env,session);
  if(!situation.verification?.verified && situation.verification?.required){const e=new Error("VERIFICATION_REQUIRED");e.status=402;throw e;}
  if(situation.subscriptionRequired===true && situation.subscriptionClass==="eligible" && !["active","grace"].includes(String(situation.accessState||""))){const e=new Error(String(situation.accessState||"SUBSCRIPTION_REQUIRED").toUpperCase());e.status=402;throw e;}
  const decision=situation.actions?.[code];
  if(decision?.allowed===false){const e=new Error(`ACTION_NOT_ELIGIBLE:${code}`);e.status=403;throw e;}
  return situation;
}

export async function requireUserSituationCapacity(env,session,resource){
  const situation=await resolveUserSituation(env,session);
  if(situation.subjectType!=="tenant_admin")return situation;
  if(situation.accessState!=="active" && situation.accessState!=="grace"){const e=new Error(String(situation.accessState||"SUBSCRIPTION_REQUIRED").toUpperCase());e.status=402;throw e;}
  if(resource==="driver" && situation.commercialRestrictions.driverLimitReached){const e=new Error("DRIVER_LIMIT_REACHED");e.status=403;throw e;}
  if(resource==="mission" && situation.commercialRestrictions.missionLimitReached){const e=new Error("MISSION_LIMIT_REACHED");e.status=403;throw e;}
  return situation;
}
