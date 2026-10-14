import * as verificationRepo from "../../repositories/verification.repository.js";
import * as authRepo from "../../repositories/auth.repository.js";
import * as executorRepo from "../../repositories/executor.repository.js";
import { getUserProgress } from "../../security/user-access.service.js";
import {publicLaunchCountries,getCountryProductLaunch,evaluateCountryEligibility} from '../../security/country-product-launch.service.js';
const SUBJECTS=Object.freeze({tenant_admin:Object.freeze({label:"Company administrator",requiredChecks:["email","phone","company","country","identity"]}),independent_executor:Object.freeze({label:"Independent executor",requiredChecks:["email","phone","company","country","identity"]}),driver:Object.freeze({label:"Driver",requiredChecks:["email","phone","company","country","identity"]})});
export async function listPublicCountries(env){ return publicLaunchCountries(env); }
export async function getOnboardingState(env,session){
 const userClass=session.role==="executor"?"independent_executor":session.role==="admin"?"tenant_admin":session.role==="driver"?"driver":null;
 if(!userClass)throw err("Onboarding is available to tenant administrators, drivers and independent executors",403);
 const profile=await getOrCreateContext(env,session); const checks=profile?await verificationRepo.listChecks(env,profile.id):[];
 const countryCode=normalize(profile?.declared_country_code||session.countryCode||profile?.country_code||"ZZ");
 const countryRow=await env.DB.prepare(`SELECT code,name,requires_review,default_subscription_class FROM country_catalog WHERE code=? AND active=1 LIMIT 1`).bind(countryCode).first();
 const launch=await getCountryProductLaunch(env,countryCode,{publicOnly:true});
 const subject=SUBJECTS[userClass];
 const requiredChecks=subject.requiredChecks; const map=Object.fromEntries(checks.map(c=>[c.check_type,c.status]));
 const missing=requiredChecks.filter(x=>map[x]!=="verified"); const trustKey=profile?await verificationRepo.getActiveTrustKey(env,profile.id):null;
 const complete=Boolean(launch&&profile?.review_status==="approved"&&trustKey?.status==="active"&&missing.length===0&&profile?.verified_country_code);
 const next=complete?"complete":missing.includes("phone")?"phone":missing.includes("email")?"email":missing.includes("country")?"review":profile?.review_status==="pending"?"review":"submit";
 return {version:"1.1.0",userClass,userClassLabel:subject.label,declaredCountryCode:countryCode,declaredCountry:countryRow?.name||"Other",verifiedCountryCode:profile?.verified_country_code||null,verifiedCountry:profile?.verified_country_code?((await env.DB.prepare(`SELECT name FROM country_catalog WHERE code=? LIMIT 1`).bind(profile.verified_country_code).first())?.name||profile.verified_country_code):null,countryReviewStatus:map.country||"pending",countryRequiresReview:countryRow?Number(countryRow.requires_review)===1:true,defaultSubscriptionClass:countryRow?.default_subscription_class||"eligible",requiredChecks,checks:checks.map(c=>({type:c.check_type,status:c.status})),reviewStatus:profile?.review_status||"draft",trustKeyStatus:trustKey?.status||null,verificationComplete:complete,nextStep:next,access:complete?"operational":launch?"verification_required":"country_not_launched",launchStatus:launch?'active':'under_development',policyNote:"Your declared country is reviewed by ON Mission before jurisdiction-specific access and commercial policy are applied."};
}
async function getOrCreateContext(env,session){
 if(session.role==="admin"){const i=await authRepo.findIdentityById(env,Number(session.identityId));if(!i)throw err("Account not found",404);const existing=await verificationRepo.getProfile(env,"tenant",Number(i.company_id));if(existing)return existing;return verificationRepo.ensureProfile(env,{identityType:"tenant",identityId:Number(i.company_id),email:i.email||i.login||"",phone:null,companyName:i.company_name||"",countryCode:i.country_code||"ZZ"});}
 const e=await executorRepo.findExecutorById(env,Number(session.executorId));if(!e)throw err("Executor account not found",404);const existing=await verificationRepo.getProfile(env,"executor",Number(e.id));if(existing)return existing;return verificationRepo.ensureProfile(env,{identityType:"executor",identityId:Number(e.id),email:e.email||e.login||"",phone:e.mobile||null,companyName:e.registered_company_name||"",countryCode:e.country_code||"ZZ"});
}
function normalize(v){const x=String(v||"ZZ").trim().toUpperCase();return /^[A-Z]{2}$/.test(x)?x:"ZZ";}function err(m,s){const e=new Error(m);e.status=s;return e;}
