import {canonicalFirst} from "../../core/canonical-db.js";
import * as verificationRepo from "../../repositories/verification.repository.js";
import {completeActivationRequestsForFields} from "../../security/activation-review.service.js";
import {refreshOperationalAccessForSession} from "../../security/operational-gate.service.js";
import * as authRepo from "../../repositories/auth.repository.js";
import * as executorRepo from "../../repositories/executor.repository.js";
import { sendTrustKeyEmail,sendVerificationCodeEmail } from "../auth/email.service.js";
import { audit } from "../../security/audit.js";
import { setVerifiedCountry } from "../../security/country-policy.service.js";
import { resolveSubscriptionContext } from "../../security/subscription-policy.service.js";
import { transitionOrganizationLifecycle } from "../../security/organization-lifecycle.service.js";

import { authorityUnavailable } from '../../core/canonical-db.js';
const EMAIL_CODE_TTL_MINUTES=15;

export async function getVerification(env,session){
  const ctx=await identityContext(env,session);
  const profile=await ensureVerificationProfile(env,ctx);
  const checks=await verificationRepo.listChecks(env,profile.id);
  const trustKey=await verificationRepo.getActiveTrustKey(env,profile.id);
  const level=computeLevel(checks,trustKey);
  if(Number(profile.trust_level)!==level){
    await env.DB.prepare(`UPDATE verification_profiles SET trust_level=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(level,profile.id).run();
  }
  return publicVerification({...profile,trust_level:level},checks,trustKey,env);
}

export async function updateVerificationProfile(env,session,data){
  const ctx=await identityContext(env,session);
  const profile=await ensureVerificationProfile(env,ctx);
  const phone=clean(data.phone,60);
  const personName=clean(data.personName,160);
  const email=clean(data.email,200).toLowerCase();
  if(!personName)throw bad("Full name is required for verification");
  if(!phone)throw bad("Phone number is required for verification");
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw bad("A valid email address is required for verification");
  const emailChanged=clean(profile.email_snapshot,200).toLowerCase()!==email;
  const phoneChanged=clean(profile.phone_snapshot,60)!==phone;
  const nameChanged=clean(profile.person_name_snapshot,160)!==personName;
  await verificationRepo.updateProfileContact(env,profile.id,{email,phone,companyName:ctx.companyName});
  await env.DB.prepare(`UPDATE verification_profiles SET person_name_snapshot=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(personName,Number(profile.id)).run();
  if(emailChanged||phoneChanged||nameChanged){
    if(emailChanged)await verificationRepo.setCheck(env,profile.id,"email",{status:"pending",method:"email_code",note:"Verification email changed; re-verification required"});
    if(phoneChanged)await verificationRepo.setCheck(env,profile.id,"phone",{status:"pending",method:"manual_review",note:"Phone changed; re-verification required"});
    if(nameChanged)await verificationRepo.setCheck(env,profile.id,"identity",{status:"pending",method:"manual_review",note:"Representative name changed; re-verification required"});
    await suspendTrustForProfile(env,profile.id,"Verification identity details changed");
    if(profile.review_status==="approved")await verificationRepo.setReview(env,profile.id,{status:"pending",trustLevel:0,note:"Verification identity details changed; review required"});
  }
  await completeActivationRequestsForFields(env,session,[...(emailChanged?["email"]:[]),...(phoneChanged?["phone"]:[]),...(nameChanged?["identity"]:[])]);
  try{await refreshOperationalAccessForSession(env,session);}catch(error){throw authorityUnavailable('operational_access_projection',error);}
  return getVerification(env,session);
}

export async function listVerificationCompanies(env,session){
  if(session.role!=="driver")return [];
  const identity=await authRepo.findIdentityById(env,Number(session.identityId));
  if(!identity?.company_id)throw notFound("Driver tenant not found");
  const company=await authRepo.getCompany(env,Number(identity.company_id));
  if(!company)throw notFound("Driver tenant not found");
  const tenantProfile=await verificationRepo.getProfile(env,"tenant",Number(company.id));
  const checks=tenantProfile?await verificationRepo.listChecks(env,tenantProfile.id):[];
  const by=Object.fromEntries(checks.map(c=>[c.check_type,c.status]));
  const key=tenantProfile?await verificationRepo.getActiveTrustKey(env,tenantProfile.id):null;
  const tenantReady=Boolean(tenantProfile?.review_status==="approved"&&key?.status==="active"&&["email","phone","company","country","identity"].every(x=>by[x]==="verified"));
  return [{id:Number(company.id),name:company.name,readyToGo:tenantReady}];
}

export async function sendEmailCode(env,session){
  const ctx=await identityContext(env,session);
  if(!ctx.email)throw bad("Add an email address to your account first");
  const profile=await ensureVerificationProfile(env,ctx);
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0");
  const hash=await sha256(code);
  const expiresAt=new Date(Date.now()+EMAIL_CODE_TTL_MINUTES*60*1000).toISOString().replace("T"," ").replace("Z","");
  await verificationRepo.createEmailCode(env,profile.id,hash,expiresAt);
  await sendVerificationCodeEmail(env,{to:ctx.email,code});
  return {sent:true,expiresInMinutes:EMAIL_CODE_TTL_MINUTES,emailMask:maskEmail(ctx.email)};
}

export async function confirmEmailCode(env,session,code){
  const ctx=await identityContext(env,session);
  const profile=await ensureVerificationProfile(env,ctx);
  const normalized=String(code||"").replace(/\D/g,"").slice(0,6);
  if(normalized.length!==6)throw bad("Enter the 6-digit email code");
  const row=await verificationRepo.findValidEmailCode(env,profile.id,await sha256(normalized));
  if(!row)throw bad("Verification code is invalid or expired");
  await verificationRepo.consumeEmailCode(env,row.id);
  await verificationRepo.setCheck(env,profile.id,"email",{status:"verified",method:"email_code"});
  await audit(env,{session,action:"verification.email",resourceType:"verification_profile",resourceId:profile.id});
  try{await refreshOperationalAccessForSession(env,session);}catch(error){throw authorityUnavailable('operational_access_projection',error);}
  return getVerification(env,session);
}

export async function submitCountryVerification(env,session,{countryCode,addressLine1,addressLine2,postalCode,city,region}={}){
  const ctx=await identityContext(env,session);
  const profile=await ensureVerificationProfile(env,ctx);
  const code=String(countryCode||"").trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(code)||code==="ZZ")throw bad("Select a valid country before submitting");
  const country=await env.DB.prepare(`SELECT code,name,active FROM country_catalog WHERE code=? AND active=1 LIMIT 1`).bind(code).first();
  if(!country)throw bad("Selected country is not available");
  const a1=clean(addressLine1,240), a2=clean(addressLine2,240), pc=clean(postalCode,40), c=clean(city,120), r=clean(region,120);
  if(!a1||!pc||!c)throw bad("Complete your address: street address, postal code and city are required");
  const before=await getVerification(env,session);
  const byType=Object.fromEntries((before.checks||[]).map(c=>[c.type,c]));
  if(byType.email?.status!=="verified")throw bad("Verify your email before continuing");
  if(!profile.phone_snapshot)throw bad("Add your phone number before continuing");
  if(!profile.company_name_snapshot)throw bad("Company information is required");
  await verificationRepo.updateProfileAddress(env,profile.id,{addressLine1:a1,addressLine2:a2,postalCode:pc,city:c,region:r});
  await env.DB.prepare(`UPDATE verification_profiles SET declared_country_code=?,country_code=?,verified_country_code=NULL,company_id=COALESCE(?,company_id),review_status='draft',trust_level=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(code,code,ctx.companyId||null,Number(profile.id)).run();
  await verificationRepo.setCheck(env,profile.id,"country",{status:"pending",method:"manual_review",note:"Country and operating address saved; complete verification and submit the profile for platform review."});
  await suspendTrustForProfile(env,profile.id,"Country/address details changed; verification submission required");
  await audit(env,{session,action:"verification.country.save",resourceType:"verification_profile",resourceId:profile.id,metadata:{countryCode:code,city:c}});
  await completeActivationRequestsForFields(env,session,["country","address"]);
  try{await refreshOperationalAccessForSession(env,session);}catch(error){throw authorityUnavailable('operational_access_projection',error);}
  return getVerification(env,session);
}

export async function submitVerification(env,session){
  const current=await getVerification(env,session);
  const ctx=await identityContext(env,session);
  const profile=await verificationRepo.getProfile(env,ctx.identityType,ctx.identityId);
  const byType=Object.fromEntries(current.checks.map(c=>[c.type,c]));
  if(byType.email?.status!=="verified")throw bad("Verify your email before submitting");
  if(!profile.phone_snapshot)throw bad("Add your phone number before submitting");
  if(!profile.company_name_snapshot)throw bad("Company information is required");
  await verificationRepo.submitReview(env,profile.id);
  await audit(env,{session,action:"verification.submit",resourceType:"verification_profile",resourceId:profile.id});
  try{await refreshOperationalAccessForSession(env,session);}catch(error){throw authorityUnavailable('operational_access_projection',error);}
  return getVerification(env,session);
}

export async function activateTrustKey(env,session,rawKey){
  const ctx=await identityContext(env,session);
  const profile=await ensureVerificationProfile(env,ctx);
  const key=normalizeKey(rawKey);
  if(!key)throw bad("Enter your ON Mission Trust Key");
  const row=await verificationRepo.findTrustKeyByHash(env,await sha256(key));
  if(!row||Number(row.profile_id)!==Number(profile.id))throw bad("Trust Key is invalid");
  if(row.status==="active")return getVerification(env,session);
  if(row.status!=="issued")throw forbidden(`Trust Key is ${row.status}`);
  if(row.expires_at&&Date.parse(asIso(row.expires_at))<=Date.now())throw forbidden("Trust Key has expired");
  if(profile.review_status!=="approved")throw forbidden("Verification review is not approved");
  await verificationRepo.activateTrustKey(env,row.id);
  await verificationRepo.addTrustEvent(env,row.id,"activated","identity","Activated from account");
  await audit(env,{session,action:"trust_key.activate",resourceType:"trust_key",resourceId:row.id});
  return getVerification(env,session);
}

export async function listPendingReviews(env){
  return verificationRepo.listPendingReviews(env);
}

export async function platformSetVerificationCheck(env,profileId,{checkType,status,note,countryCode}){
  const allowed=new Set(["phone","company","country","identity","email"]);
  if(!allowed.has(checkType))throw bad("Invalid verification check");
  if(!["verified","rejected","pending","not_required"].includes(status))throw bad("Invalid check status");
  const profile=await verificationRepo.findProfileById(env,profileId);
  if(!profile)throw notFound("Verification profile not found");
  if(checkType==="country" && status==="verified"){
    if(!/^[A-Z]{2}$/.test(String(countryCode||"").trim().toUpperCase()))throw bad("Verified country is required");
    const nextCountry=String(countryCode).trim().toUpperCase();
    if(profile.verified_country_code&&profile.verified_country_code!==nextCountry){
      const key=await verificationRepo.getActiveTrustKey(env,profile.id);
      if(key?.id&&key.status==="active"){
        await verificationRepo.setTrustKeyStatus(env,key.id,"suspended");
        await verificationRepo.addTrustEvent(env,key.id,"suspended","platform_super_administrator","Verified country changed; Trust Key locked until review is reconfirmed");
      }
      await verificationRepo.setReview(env,profile.id,{status:"pending",trustLevel:0,note:clean(note,1000)||"Verified country changed; review required"});
    }
    await setVerifiedCountry(env,profile.id,nextCountry,note);
  }
  if(checkType==="company"&&status==="verified"&&profile.identity_type==="driver"){
    const companyId=Number(profile.company_id||0);
    if(!companyId)throw conflict("Driver verification requires an associated tenant company");
    const admin=await env.DB.prepare(`SELECT ai.id,ai.company_id,COALESCE(cvs.country_code,vp.verified_country_code,vp.declared_country_code,vp.country_code) country_code FROM auth_identities ai LEFT JOIN company_verification_status cvs ON cvs.company_id=ai.company_id LEFT JOIN verification_profiles vp ON vp.identity_type='tenant' AND vp.identity_id=ai.company_id WHERE ai.company_id=? AND ai.role='admin' AND ai.active=1 ORDER BY ai.id LIMIT 1`).bind(companyId).first();
    if(!admin)throw conflict("Driver tenant does not have an active administrator");
    const tenantCountry=String(admin.country_code||"").trim().toUpperCase();
    if(!/^[A-Z]{2}$/.test(tenantCountry)||tenantCountry==="ZZ")throw conflict("Driver tenant country is unresolved");
    const tenantCtx=await resolveSubscriptionContext(env,{role:"admin",tenantId:companyId,identityId:Number(admin.id),countryCode:tenantCountry});
    if(!tenantCtx.verification?.verified||tenantCtx.accessState!=="active")throw conflict("Driver company can be verified only after the selected tenant is READY TO GO");
  }
  await verificationRepo.setCheck(env,profile.id,checkType,{status,method:"manual_review",note:clean(note,500)});
  // Any failed or reopened verification invalidates operational trust immediately.
  // The profile must return to review; a fresh approval may issue a new key, or the
  // administrator may explicitly reactivate a still-valid suspended key after all checks pass.
  if(status!=="verified"&&status!=="not_required"){
    const key=await verificationRepo.getActiveTrustKey(env,profile.id);
    if(key?.id&&["active","issued"].includes(String(key.status))){
      await verificationRepo.setTrustKeyStatus(env,key.id,"suspended");
      await verificationRepo.addTrustEvent(env,key.id,"suspended","platform_super_administrator",clean(note,500)||`${checkType} verification requires attention`);
    }
    if(profile.review_status==="approved")await verificationRepo.setReview(env,profile.id,{status:"pending",trustLevel:0,note:clean(note,1000)||`${checkType} verification requires attention`});
  }
  return administratorProfile(env,profile.id);
}

export async function platformApproveVerification(env,profileId,{note,expiresAt}={}){
  const profile=await verificationRepo.findProfileById(env,profileId);
  if(!profile)throw notFound("Verification profile not found");
  const checks=await verificationRepo.listChecks(env,profile.id);
  const by=Object.fromEntries(checks.map(c=>[c.check_type,c]));
  const required=["email","phone","company","country","identity"];
  const missing=required.filter(type=>by[type]?.status!=="verified");
  if(missing.length)throw conflict(`Cannot approve. Unverified checks: ${missing.join(", ")}`);

  // A administrator-requested activation change is a two-party workflow: the user
  // fulfills the requested fields, then the platform administrator completes the
  // review. An open request without user_completed_at must block approval.
  const unfulfilled=(await env.DB.prepare(`SELECT id FROM activation_review_requests WHERE identity_type=? AND identity_id=? AND status='open' AND user_completed_at IS NULL`).bind(profile.identity_type,Number(profile.identity_id)).all()).results||[];
  if(unfulfilled.length)throw conflict(`Cannot approve until the user completes the requested activation update${unfulfilled.length>1?'s':''}`);

  await verificationRepo.setReview(env,profile.id,{status:"approved",trustLevel:3,note:clean(note,1000)});
  // Approved tenant verification must converge into the canonical company authorization state.
  if(profile.identity_type==="tenant") await authRepo.markCompanyVerified(env,Number(profile.identity_id));
  if(profile.identity_type==="tenant") {
    const companyId=Number(profile.identity_id);
    const lifecycle=await env.DB.prepare(`SELECT status,status_version FROM company_management_profiles WHERE company_id=? LIMIT 1`).bind(companyId).first();
    if(lifecycle?.status==="PENDING_VERIFICATION") await transitionOrganizationLifecycle(env,{companyId,toStatus:"VERIFIED",actor:{type:"platform_super_administrator",id:profile.id},reasonCode:"verification_approved",reason:"Canonical verification and Trust approval converged into organization lifecycle.",expectedStatusVersion:Number(lifecycle.status_version||1),metadata:{verificationProfileId:Number(profile.id),trustIssued:true}});
  }
  const rawKey=generateTrustKey();
  const keyId=await verificationRepo.createTrustKey(env,profile.id,{
    keyHash:await sha256(rawKey),
    keyHint:keyHint(rawKey),
    expiresAt:clean(expiresAt,40)||null
  });
  await verificationRepo.addTrustEvent(env,keyId,"issued","platform_super_administrator",clean(note,500)||"Verification approved");

  // Platform administrator completion closes only requests that the user has actually fulfilled.
  await env.DB.prepare(`UPDATE activation_review_requests SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE identity_type=? AND identity_id=? AND status='open' AND user_completed_at IS NOT NULL`).bind(profile.identity_type,Number(profile.identity_id)).run();

  let emailed=false;
  if(profile.email_snapshot){
    try{
      await sendTrustKeyEmail(env,{to:profile.email_snapshot,trustKey:rawKey});
      emailed=true;
    }catch(error){
      console.error("TRUST_KEY_EMAIL",error?.message||error);
    }
  }

  // Raw key is intentionally returned only to the trusted administrator once.
  return {approved:true,profileId:profile.id,trustKey:rawKey,keyHint:keyHint(rawKey),emailed};
}

export async function platformRejectVerification(env,profileId,{note}={}){
  const profile=await verificationRepo.findProfileById(env,profileId);
  if(!profile)throw notFound("Verification profile not found");
  await verificationRepo.setReview(env,profile.id,{status:"rejected",trustLevel:0,note:clean(note,1000)});
  const key=await verificationRepo.getActiveTrustKey(env,profile.id);
  if(key?.id){
    await verificationRepo.setTrustKeyStatus(env,key.id,"revoked");
    await verificationRepo.addTrustEvent(env,key.id,"revoked","platform_super_administrator",clean(note,500)||"Verification rejected");
  }
  return {rejected:true,profileId:profile.id};
}

export async function platformTrustStatus(env,profileId,{status,note}){
  if(!["active","suspended","revoked"].includes(status))throw bad("Invalid Trust Key status");
  const profile=await verificationRepo.findProfileById(env,profileId);
  if(!profile)throw notFound("Verification profile not found");
  const key=await verificationRepo.getActiveTrustKey(env,profile.id);
  if(!key?.id)throw notFound("No Trust Key found");
  if(status==="active"){
    const checks=await verificationRepo.listChecks(env,profile.id);const required=["email","phone","company","country","identity"];
    const missing=required.filter(t=>checks.find(c=>c.check_type===t)?.status!=="verified");
    if(profile.review_status!=="approved"||missing.length)throw conflict(`Trust Key cannot be reactivated. Unverified checks: ${missing.join(", ")||"none"}`);
    if(key.expires_at&&Date.parse(asIso(key.expires_at))<=Date.now())throw forbidden("Trust Key has expired; issue a new key");
    await verificationRepo.setTrustKeyStatus(env,key.id,"active");
    await verificationRepo.addTrustEvent(env,key.id,"reactivated","platform_super_administrator",clean(note,500)||"Reactivated after verification was confirmed");
    return {profileId:profile.id,status:"active",keyHint:key.key_hint};
  }
  await verificationRepo.setTrustKeyStatus(env,key.id,status);
  await verificationRepo.addTrustEvent(env,key.id,status,"platform_super_administrator",clean(note,500));
  if(status==="revoked")await verificationRepo.setReview(env,profile.id,{status:"pending",trustLevel:0,note:clean(note,1000)||"Trust Key revoked; review required"});
  return {profileId:profile.id,status};
}

export async function requireWorkTrust(env,session){
  const strict=String(env.SECURITY_STRICT_MODE||"").toLowerCase()==="true";
  const mode=String(env.TRUST_ENFORCEMENT_MODE||"").toLowerCase();
  // Security-strict production deployments must never silently downgrade trust
  // enforcement when the explicit mode is missing. Development/rolling deploys
  // may remain compatible by setting SECURITY_STRICT_MODE=false.
  if(strict && mode!=="enforce") { const e=new Error("TRUST_ENFORCEMENT_NOT_CONFIGURED"); e.status=503; throw e; }
  if(mode!=="enforce")return true;
  if(!session)return true;

  let profile=null;
  if(session.role==="executor"){
    profile=await verificationRepo.getProfile(env,"executor",Number(session.executorId));
  }else if(session.role==="admin"){
    profile=await verificationRepo.getProfile(env,"tenant",Number(session.tenantId));
  }else if(session.role==="driver"){
    profile=await verificationRepo.getProfile(env,"driver",Number(session.driverId));
  }else{
    return true;
  }

  if(!profile){
    const e=new Error("ACTIVE_TRUST_KEY_REQUIRED");e.status=403;throw e;
  }
  const key=await verificationRepo.getActiveTrustKey(env,profile.id);
  if(key?.status!=="active"){
    const e=new Error("ACTIVE_TRUST_KEY_REQUIRED");e.status=403;throw e;
  }
  return true;
}

async function ensureVerificationProfile(env,ctx){
  const before=await verificationRepo.getProfile(env,ctx.identityType,ctx.identityId);
  const profile=await verificationRepo.ensureProfile(env,{
    identityType:ctx.identityType,identityId:ctx.identityId,email:ctx.email,
    phone:before?.phone_snapshot||ctx.phone,companyName:ctx.companyName,personName:before?.person_name_snapshot||ctx.personName,companyId:ctx.companyId||before?.company_id||null,countryCode:before?.country_code||ctx.countryCode||"ZZ"
  });

  if(before&&clean(before.email_snapshot,240).toLowerCase()!==clean(ctx.email,240).toLowerCase()){
    await verificationRepo.setCheck(env,profile.id,"email",{status:"pending",method:"email_code",note:"Account email changed; re-verification required"});
    await suspendTrustForProfile(env,profile.id,"Account email changed");
  }

  if(before&&ctx.identityType==="executor"&&clean(before.company_name_snapshot,240)!==clean(ctx.companyName,240)){
    await verificationRepo.setCheck(env,profile.id,"company",{status:"pending",method:"manual_review",note:"Company information changed; re-verification required"});
    await suspendTrustForProfile(env,profile.id,"Executor company information changed");
  }

  return verificationRepo.getProfile(env,ctx.identityType,ctx.identityId);
}

async function suspendTrustForProfile(env,profileId,note){
  const key=await verificationRepo.getActiveTrustKey(env,profileId);
  if(key?.id&&key.status==="active"){
    await verificationRepo.setTrustKeyStatus(env,key.id,"suspended");
    await verificationRepo.addTrustEvent(env,key.id,"suspended","system",note);
  }
}

async function identityContext(env,session){
  if(session.role==="admin"){
    const identity=await authRepo.findIdentityById(env,Number(session.identityId));
    if(!identity||identity.role!=="admin")throw forbidden("Tenant Admin verification required");
    return {
      identityType:"tenant",
      identityId:Number(identity.company_id),
      email:identity.email||identity.login||"",
      phone:null,
      companyName:identity.company_name||"",
      personName:identity.display_name||identity.driver_name||"",
      countryCode:(await authRepo.getCompany(env,Number(identity.company_id)))?.country_code||"ZZ",
      companyId:Number(identity.company_id),
      companyVerified:identity.company_verification_status==="verified"
    };
  }
  if(session.role==="executor"){
    const executor=await executorRepo.findExecutorById(env,Number(session.executorId));
    if(!executor)throw notFound("Executor account not found");
    return {
      identityType:"executor",
      identityId:Number(executor.id),
      email:executor.email||executor.login||"",
      phone:executor.mobile||null,
      companyName:executor.registered_company_name||"",
      personName:executor.display_name||"",
      countryCode:executor.country_code||"ZZ",
      companyId:null,
      companyVerified:false
    };
  }
  if(session.role==="driver"){
    const identity=await authRepo.findIdentityById(env,Number(session.identityId));
    if(!identity||identity.role!=="driver"||!identity.driver_id)throw notFound("Driver account not found");
    const company=await authRepo.getCompany(env,Number(identity.company_id));
    const driverProfile=await canonicalFirst(env,`SELECT * FROM driver_operational_profiles WHERE driver_id=? LIMIT 1`,[Number(identity.driver_id)],'driver_operational_profile_authority');
    return {
      identityType:"driver",
      identityId:Number(identity.driver_id),
      email:identity.email||identity.login||"",
      phone:identity.phone||driverProfile?.mobile||null,
      companyName:identity.company_name||company?.name||"",
      personName:identity.display_name||identity.driver_name||"",
      countryCode:"ZZ",
      companyId:Number(identity.company_id),
      companyVerified:identity.company_verification_status==="verified"
    };
  }
  throw forbidden("Verification is available to tenant Admins, drivers and independent executors");
}

async function administratorProfile(env,profileId){
  const p=await verificationRepo.findProfileById(env,profileId);
  return {profile:p,checks:await verificationRepo.listChecks(env,profileId),trustKey:await verificationRepo.getActiveTrustKey(env,profileId)};
}
export async function platformVerificationProfileForRoute(env,profileId){
  const p=await verificationRepo.findProfileById(env,profileId);
  if(!p)throw notFound("Verification profile not found");
  return {profile:p,checks:await verificationRepo.listChecks(env,profileId),trustKey:await verificationRepo.getActiveTrustKey(env,profileId)};
}

function publicVerification(profile,checks,trustKey,env){
  return {
    profileId:Number(profile.id),
    identityType:profile.identity_type,
    reviewStatus:profile.review_status,
    trustLevel:Number(profile.trust_level||0),
    trustLabel:trustLabel(Number(profile.trust_level||0)),
    phone:profile.phone_snapshot||"",
    companyName:profile.company_name_snapshot||"",
    companyId:profile.company_id?Number(profile.company_id):null,
    personName:profile.person_name_snapshot||"",
    countryCode:profile.country_code||"ZZ",
    declaredCountryCode:profile.declared_country_code||profile.country_code||"ZZ",
    verifiedCountryCode:profile.verified_country_code||null,
    email:profile.email_snapshot||"",
    address:Object.freeze({line1:profile.address_line1||"",line2:profile.address_line2||"",postalCode:profile.postal_code||"",city:profile.city||"",region:profile.region||""}),
    submittedAt:profile.submitted_at||null,
    reviewedAt:profile.reviewed_at||null,
    administratorNote:profile.reviewer_note||null,
    enforcementMode:String(env.TRUST_ENFORCEMENT_MODE||"off").toLowerCase()==="enforce"?"enforce":"off",
    checks:checks.map(c=>({type:c.check_type,status:c.status,method:c.method||null,verifiedAt:c.verified_at||null,note:c.reviewer_note||null})),
    trustKey:trustKey?{
      status:trustKey.status,
      hint:trustKey.key_hint,
      issuedAt:trustKey.issued_at,
      activatedAt:trustKey.activated_at,
      expiresAt:trustKey.expires_at||null
    }:null,
    badge:trustKey?.status==="active"?"ON_MISSION_VERIFIED":null
  };
}

function computeLevel(checks,trustKey){
  if(trustKey?.status==="active")return 4;
  const by=Object.fromEntries(checks.map(c=>[c.check_type,c.status]));
  const contact=by.email==="verified"&&by.phone==="verified";
  if(!contact)return by.email==="verified"?1:0;
  const business=by.company==="verified";
  if(!business)return 1;
  if(by.identity!=="verified")return 2;
  return 3;
}
function trustLabel(level){return ["REGISTERED","CONTACT VERIFIED","BUSINESS VERIFIED","IDENTITY VERIFIED","ON MISSION VERIFIED"][level]||"REGISTERED";}
function generateTrustKey(){
  const bytes=new Uint8Array(10);crypto.getRandomValues(bytes);
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let body="";for(const b of bytes)body+=alphabet[b%alphabet.length];
  return `OMV-DE-${body.slice(0,4)}-${body.slice(4,8)}-${body.slice(8,10)}`;
}
function normalizeKey(v){return String(v||"").trim().toUpperCase().replace(/\s+/g,"");}
function keyHint(key){return `${key.slice(0,10)}••••${key.slice(-2)}`;}
async function sha256(value){
  const data=new TextEncoder().encode(String(value));
  const hash=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}
function maskEmail(email){const [a,b]=String(email||"").split("@");return b?`${a.slice(0,2)}***@${b}`:"";}
function asIso(value){return String(value).includes("T")?String(value):String(value).replace(" ","T")+"Z";}
function clean(v,max){return String(v??"").trim().slice(0,max);}
function make(m,s){const e=new Error(m);e.status=s;return e;}
const bad=m=>make(m,400),forbidden=m=>make(m,403),notFound=m=>make(m,404),conflict=m=>make(m,409);
