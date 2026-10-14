import { authorityUnavailable } from '../../core/canonical-db.js';
import {RELEASE_VERSION} from '../../core/release.js';
import * as authRepo from "../../repositories/auth.repository.js";
import { hashPassword } from "../../security/password.js";
import { transitionOrganizationLifecycle } from "../../security/organization-lifecycle.service.js";
import { auditAdminControl } from "../admin-control/admin-control.audit.js";
import {resolveProductConfiguration,enabledCapability} from "../../security/product-configuration.service.js";
import {evaluateCountryEligibility} from '../../security/country-product-launch.service.js';

const VERIFICATION_CHECKS = Object.freeze(["email","phone","company","country","identity"]);
const STEPS = Object.freeze(["organization","policy","verification","trust","capabilities","subscription","owner","complete"]);
function bad(message,status=400){const e=new Error(message);e.status=status;return e;}
function text(v,max=240){return String(v??'').trim().slice(0,max);}
function upper(v,max=80){return text(v,max).toUpperCase();}
function normalizeEmail(v){return text(v,190).toLocaleLowerCase('de-DE');}
async function resolveRequirements(env,input,{certificationFixture=false}={}){
  const countryCode=upper(input.countryCode,2);
  const country=await env.DB.prepare(`SELECT code,name,active,requires_review,default_subscription_class FROM country_catalog WHERE code=? AND active=1 LIMIT 1`).bind(countryCode).first();
  if(!country) throw bad('Selected country is not currently available',422);
  if(!certificationFixture){
    const launch=await evaluateCountryEligibility(env,{countryCode:countryCode,organizationType:input.organizationType||'company',sectorCode:input.sectorCode||'general',registrationNumber:input.registrationNumber||null,email:input.email||null,userClass:'tenant_admin'});
    if(!launch.allowed) throw bad(launch.reason==='COUNTRY_NOT_LAUNCHED'?'This country is still under development.':'This organization is not currently eligible for the selected country product.',422);
  }
  const jurisdiction=await env.DB.prepare(`SELECT code,country_code,region_code,framework_code,data_residency_mode,effective_version,status FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC LIMIT 1`).bind(countryCode).first();
  if(!jurisdiction) throw bad('No active jurisdiction policy is configured for the selected country',422);
  const residency=await env.DB.prepare(`SELECT code,jurisdiction_code,mode,primary_region,primary_provider,fallback_allowed,version,active FROM residency_policies WHERE jurisdiction_code=? AND active=1 ORDER BY version DESC,code LIMIT 1`).bind(jurisdiction.code).first();
  if(!residency) throw bad('No active data residency policy is configured for the selected country',422);
  const sectorCode=text(input.sectorCode,80)||'general';
  const sector=await env.DB.prepare(`SELECT code,sector_code,regulatory_profile,data_profile,effective_version,status FROM sector_policies WHERE sector_code=? AND status='active' ORDER BY effective_version DESC LIMIT 1`).bind(sectorCode).first();
  if(!sector) throw bad('Selected sector is not configured by platform policy',422);
  const purposeCode=text(input.purposeCode,80)||'operational_communications';
  const purpose=await env.DB.prepare(`SELECT code,label,default_legal_basis,data_minimization_rule FROM processing_purposes WHERE code=? AND active=1 LIMIT 1`).bind(purposeCode).first();
  if(!purpose) throw bad('Selected purpose is not configured by platform policy',422);
  const requiredFields=['companyName','adminName','email','password','countryCode','organizationType','sectorCode','purposeCode'];
  if(Number(country.requires_review)===1) requiredFields.push('registrationNumber','registeredAddressLine1','registeredCity','registeredPostalCode');
  const product=await resolveProductConfiguration(env);
  const capabilities=(await env.DB.prepare(`SELECT code,label,domain_code,status,version FROM canonical_capability_registry WHERE status='active' ORDER BY code`).all()).results||[];
  const capabilityEligibility=capabilities.map(c=>({code:c.code,label:c.label,eligible:Boolean(enabledCapability(product,c.code)&&country.default_subscription_class!=='blocked'),reason:!enabledCapability(product,c.code)?'platform_configuration':country.default_subscription_class==='blocked'?'country_subscription_policy':'platform_supported',version:c.version}));
  const verification=VERIFICATION_CHECKS.map(check=>({check,required:true,reason:Number(country.requires_review)===1?'country_review_policy':'platform_verification_baseline'}));
  return {country,jurisdiction,residency,sector,purpose,requiredFields,verification,capabilityEligibility,subscriptionEligibility:{class:country.default_subscription_class||'eligible',eligible:(country.default_subscription_class||'eligible')!=='blocked'}};
}
function missingRequired(input,fields){return fields.filter(k=>{const v=input[k];return v===undefined||v===null||String(v).trim()==='';});}
async function existingByIdempotency(env,key){return env.DB.prepare(`SELECT o.*,c.name company_name,cmp.status organization_status FROM organization_onboarding_records o JOIN companies c ON c.id=o.company_id LEFT JOIN company_management_profiles cmp ON cmp.company_id=o.company_id WHERE o.idempotency_key=? LIMIT 1`).bind(key).first();}
export async function getOrganizationOnboardingRequirements(env,{countryCode,organizationType='company',sectorCode='general',purposeCode='operational_communications'}){
  const r=await resolveRequirements(env,{countryCode,organizationType,sectorCode,purposeCode});
  return {version:RELEASE_VERSION,organizationType:upper(organizationType),country:{code:r.country.code,name:r.country.name,requiresReview:Boolean(Number(r.country.requires_review))},jurisdiction:r.jurisdiction,residency:r.residency,sector:r.sector,purpose:r.purpose,requiredFields:r.requiredFields,verificationRequirements:r.verification,capabilityEligibility:r.capabilityEligibility,subscriptionEligibility:r.subscriptionEligibility};
}
export async function createOrganizationOnboarding(env,input,{requestId=null,actor={type:'public',id:null},certificationFixture=false}={}){
  if(certificationFixture && actor?.type!=='platform_super_administrator') throw bad('Certification fixture onboarding requires platform super administrator authority',403);
  const idempotencyKey=text(input.idempotencyKey,160);if(!idempotencyKey)throw bad('Idempotency key is required');
  const prior=await existingByIdempotency(env,idempotencyKey);if(prior)return {reused:true,...await getOrganizationProvisioning(env,prior.company_id)};
  const normalized={companyName:text(input.companyName,180),tradingName:text(input.tradingName,240)||null,adminName:text(input.adminName,120),email:normalizeEmail(input.email),password:String(input.password||''),countryCode:upper(input.countryCode,2),regionCode:text(input.regionCode,80)||null,registeredAddressLine1:text(input.registeredAddressLine1,240)||null,registeredAddressLine2:text(input.registeredAddressLine2,240)||null,registeredPostalCode:text(input.registeredPostalCode,40)||null,registeredCity:text(input.registeredCity,120)||null,organizationType:text(input.organizationType,80)||'company',sectorCode:text(input.sectorCode,80)||'general',organizationSize:text(input.organizationSize,80)||null,purposeCode:text(input.purposeCode,80)||'operational_communications',registrationNumber:text(input.registrationNumber,120)||null,registrationAuthority:text(input.registrationAuthority,200)||null,registrationDate:text(input.registrationDate,40)||null};
  const req=await resolveRequirements(env,normalized,{certificationFixture}); const missing=missingRequired(normalized,req.requiredFields);if(missing.length)throw bad(`Organization onboarding is incomplete: ${missing.join(', ')}`,422);
  if(!/^\S+@\S+\.\S+$/.test(normalized.email))throw bad('Enter a valid owner email address',422);
  if(await authRepo.findIdentityByLogin(env,normalized.email))throw bad('An account with this email already exists',409);
  const password=await hashPassword(normalized.password);
  let companyId=null,identityId=null;
  try{
    const c=await env.DB.prepare(`INSERT INTO companies(name) VALUES(?)`).bind(normalized.companyName).run();companyId=Number(c.meta.last_row_id);
    await env.DB.prepare(`INSERT INTO company_management_profiles(company_id,legal_name,trading_name,registration_number,registration_authority,registration_date,country_code,region_code,registered_address_line1,registered_address_line2,registered_postal_code,registered_city,organization_type,sector_code,organization_size,compliance_status,status,status_reason,status_version,status_changed_by_type,status_changed_by_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','ONBOARDING','canonical_organization_onboarding',1,'system','system')`).bind(companyId,normalized.companyName,normalized.tradingName,normalized.registrationNumber,normalized.registrationAuthority,normalized.registrationDate,normalized.countryCode,normalized.regionCode,normalized.registeredAddressLine1,normalized.registeredAddressLine2,normalized.registeredPostalCode,normalized.registeredCity,normalized.organizationType,normalized.sectorCode,normalized.organizationSize).run();
    await env.DB.prepare(`INSERT INTO organization_compliance_policies(company_id,jurisdiction_code,sector_code,sector_policy_code,processing_profile,residency_policy_code,policy_version,status) VALUES(?,?,?,?,?,?,?,'configured')`).bind(companyId,req.jurisdiction.code,req.sector.sector_code,req.sector.code,normalized.purposeCode,req.residency.code,req.jurisdiction.effective_version).run();
    await env.DB.prepare(`INSERT INTO company_verification_status(company_id,status,country_code) VALUES(?,'pending',?) ON CONFLICT(company_id) DO UPDATE SET status='pending',country_code=excluded.country_code,verified_at=NULL,updated_at=CURRENT_TIMESTAMP`).bind(companyId,normalized.countryCode).run();
    identityId=await authRepo.createIdentity(env,{companyId,role:'admin',login:normalized.email,email:normalized.email,displayName:normalized.adminName,passwordHash:password.hash,passwordSalt:password.salt,passwordIterations:password.iterations});
    await env.DB.prepare(`INSERT OR IGNORE INTO platform_users(principal_type,principal_id,account_state) VALUES('tenant',?,'active')`).bind(identityId).run();
    const platformUser=await env.DB.prepare(`SELECT id FROM platform_users WHERE principal_type='tenant' AND principal_id=? LIMIT 1`).bind(identityId).first();
    await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_actors(platform_user_id,actor_type,active) VALUES(?, 'tenant',1)`).bind(Number(platformUser.id)).run();
    await env.DB.prepare(`INSERT INTO platform_user_memberships(platform_user_id,membership_type,membership_id,status) VALUES(?, 'tenant',?,'active') ON CONFLICT(platform_user_id,membership_type,membership_id) DO UPDATE SET status='active'`).bind(Number(platformUser.id),companyId).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_roles(platform_user_id,role_code,scope_type,scope_id,active) VALUES(?,?,?,?,1)`).bind(Number(platformUser.id),'owner','tenant',companyId).run();
    const profile=await env.DB.prepare(`SELECT id FROM verification_profiles WHERE identity_type='tenant' AND identity_id=? LIMIT 1`).bind(companyId).first();
    if(profile){} else {await env.DB.prepare(`INSERT INTO verification_profiles(identity_type,identity_id,email_snapshot,company_name_snapshot,company_id,country_code,declared_country_code,review_status,trust_level) VALUES('tenant',?,?,?,?,? ,?,'draft',0)`).bind(companyId,normalized.email,normalized.companyName,companyId,normalized.countryCode,normalized.countryCode).run();}
    const vp=await env.DB.prepare(`SELECT id FROM verification_profiles WHERE identity_type='tenant' AND identity_id=? LIMIT 1`).bind(companyId).first();
    for(const check of VERIFICATION_CHECKS) await env.DB.prepare(`INSERT OR IGNORE INTO verification_checks(profile_id,check_type,status,updated_at) VALUES(?,?,'pending',CURRENT_TIMESTAMP)`).bind(vp.id,check).run();
    await env.DB.prepare(`INSERT INTO organization_onboarding_records(company_id,idempotency_key,purpose_code,sector_code,organization_type,country_code,jurisdiction_code,requirement_snapshot,verification_requirement_snapshot,capability_eligibility_snapshot,subscription_eligibility_class,owner_identity_id,review_status,provisioning_status,provisioning_step,attempt_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'RUNNING','organization',1)`).bind(companyId,idempotencyKey,normalized.purposeCode,normalized.sectorCode,normalized.organizationType,normalized.countryCode,req.jurisdiction.code,JSON.stringify(req.requiredFields),JSON.stringify(req.verification),JSON.stringify(req.capabilityEligibility),req.subscriptionEligibility.class,identityId,'pending').run();
    await env.DB.prepare(`INSERT INTO organization_provisioning_events(company_id,attempt,step_code,status,idempotency_key,metadata) VALUES(?,1,'organization','succeeded',?,?)`).bind(companyId,idempotencyKey,JSON.stringify({requestId,actor})).run();
    await transitionOrganizationLifecycle(env,{companyId,toStatus:'PENDING_VERIFICATION',actor:{type:'system',id:'system'},reasonCode:'onboarding_created',reason:'Canonical organization onboarding created and owner bootstrapped.',requestId,expectedStatusVersion:1,metadata:{idempotencyKey,purposeCode:normalized.purposeCode,sectorCode:normalized.sectorCode,jurisdictionCode:req.jurisdiction.code}});
    await env.DB.prepare(`UPDATE organization_onboarding_records SET provisioning_status='COMPLETED',provisioning_step='complete',updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(companyId).run();
    await env.DB.prepare(`INSERT INTO organization_provisioning_events(company_id,attempt,step_code,status,idempotency_key,metadata) VALUES(?,1,'complete','succeeded',?,?)`).bind(companyId,idempotencyKey,JSON.stringify({ownerIdentityId:identityId})).run();
    await auditAdminControl(env,{actor:{role:actor.type||'public',id:actor.id},action:'organization.onboarding.created',resourceType:'organization',resourceId:companyId,targetCompanyId:companyId,requestId,metadata:{countryCode:normalized.countryCode,jurisdictionCode:req.jurisdiction.code,purposeCode:normalized.purposeCode,sectorCode:normalized.sectorCode,subscriptionClass:req.subscriptionEligibility.class}});
    return {reused:false,...await getOrganizationProvisioning(env,companyId)};
  }catch(error){
    if(companyId){await env.DB.prepare(`UPDATE organization_onboarding_records SET provisioning_status='PROVISIONING_FAILED',last_error_code=?,last_error_message=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(text(error?.code||error?.message||'PROVISIONING_FAILED',80),text(error?.message||'Provisioning failed',500),companyId).run().catch(recoveryError=>{throw authorityUnavailable('organization_onboarding_failure_record',recoveryError);});await env.DB.prepare(`INSERT INTO organization_provisioning_events(company_id,attempt,step_code,status,idempotency_key,error_code,error_message) VALUES(?,1,'organization','failed',?,?,?)`).bind(companyId,idempotencyKey,text(error?.code||'PROVISIONING_FAILED',80),text(error?.message||'Provisioning failed',500)).run().catch(recoveryError=>{throw authorityUnavailable('organization_onboarding_failure_event',recoveryError);});}
    throw error;
  }
}
export async function getOrganizationProvisioning(env,companyId){
 const row=await env.DB.prepare(`SELECT o.*,c.name company_name,cmp.status organization_status,cmp.status_version FROM organization_onboarding_records o JOIN companies c ON c.id=o.company_id LEFT JOIN company_management_profiles cmp ON cmp.company_id=o.company_id WHERE o.company_id=? LIMIT 1`).bind(Number(companyId)).first();if(!row)throw bad('Organization onboarding record not found',404);
 const events=(await env.DB.prepare(`SELECT id,attempt,step_code,status,idempotency_key,error_code,error_message,metadata,created_at FROM organization_provisioning_events WHERE company_id=? ORDER BY id DESC LIMIT 100`).bind(Number(companyId)).all()).results||[];
 return {companyId:Number(row.company_id),companyName:row.company_name,organizationStatus:row.organization_status,statusVersion:Number(row.status_version||1),purposeCode:row.purpose_code,sectorCode:row.sector_code,organizationType:row.organization_type,countryCode:row.country_code,jurisdictionCode:row.jurisdiction_code,subscriptionEligibilityClass:row.subscription_eligibility_class,ownerIdentityId:row.owner_identity_id?Number(row.owner_identity_id):null,reviewStatus:row.review_status,provisioning:{status:row.provisioning_status,step:row.provisioning_step,attemptCount:Number(row.attempt_count||0),lastErrorCode:row.last_error_code,lastErrorMessage:row.last_error_message},requirements:JSON.parse(row.requirement_snapshot||'[]'),verificationRequirements:JSON.parse(row.verification_requirement_snapshot||'[]'),capabilityEligibility:JSON.parse(row.capability_eligibility_snapshot||'[]'),events};
}
export async function retryOrganizationProvisioning(env,companyId,{requestId=null,actor={type:'system',id:'system'}}={}){
 const row=await env.DB.prepare(`SELECT * FROM organization_onboarding_records WHERE company_id=? LIMIT 1`).bind(Number(companyId)).first();if(!row)throw bad('Organization onboarding record not found',404);
 if(row.provisioning_status!=='PROVISIONING_FAILED')return getOrganizationProvisioning(env,companyId);
 await env.DB.prepare(`UPDATE organization_onboarding_records SET provisioning_status='RUNNING',attempt_count=attempt_count+1,last_error_code=NULL,last_error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(Number(companyId)).run();
 await env.DB.prepare(`INSERT INTO organization_provisioning_events(company_id,attempt,step_code,status,idempotency_key,metadata) VALUES(?,(SELECT attempt_count FROM organization_onboarding_records WHERE company_id=?),'recovery','started',?,?)`).bind(Number(companyId),Number(companyId),row.idempotency_key,JSON.stringify({requestId,actor})).run();
 try{
   const checks=await env.DB.prepare(`SELECT status FROM verification_checks vc JOIN verification_profiles vp ON vp.id=vc.profile_id WHERE vp.identity_type='tenant' AND vp.identity_id=?`).bind(Number(companyId)).all();
   const hasOwner=await env.DB.prepare(`SELECT id FROM auth_identities WHERE company_id=? AND role='admin' AND active=1 ORDER BY id LIMIT 1`).bind(Number(companyId)).first();
   if(!hasOwner)throw bad('Owner bootstrap is missing; provisioning cannot resume safely',409);
   if((checks.results||[]).length<VERIFICATION_CHECKS.length) throw bad('Verification baseline is incomplete; provisioning cannot resume safely',409);
   await env.DB.prepare(`UPDATE organization_onboarding_records SET owner_identity_id=?,provisioning_status='COMPLETED',provisioning_step='complete',updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(Number(hasOwner.id),Number(companyId)).run();
   await env.DB.prepare(`INSERT INTO organization_provisioning_events(company_id,attempt,step_code,status,idempotency_key,metadata) VALUES(?,(SELECT attempt_count FROM organization_onboarding_records WHERE company_id=?),'complete','reconciled',?,?)`).bind(Number(companyId),Number(companyId),row.idempotency_key,JSON.stringify({requestId})).run();
   return getOrganizationProvisioning(env,companyId);
 }catch(error){await env.DB.prepare(`UPDATE organization_onboarding_records SET provisioning_status='PROVISIONING_FAILED',last_error_code=?,last_error_message=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(text(error?.code||'PROVISIONING_FAILED',80),text(error?.message||'Recovery failed',500),Number(companyId)).run();throw error;}
}
