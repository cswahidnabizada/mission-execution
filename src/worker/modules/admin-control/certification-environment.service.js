/**
 * ON Mission 15.4 — Canonical Certification Environment.
 *
 * This module orchestrates a disposable, repeatable certification fixture.
 * It never becomes a second tenant, identity, product, mission or execution
 * authority. Country/product/identity truth remains owned by their canonical
 * services/tables.
 */
import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';
import {createProductCountry,getProductCountry} from '../../security/product-country-catalog.service.js';
import {createProductDefinition,getProductDefinition,compileProductDefinition} from '../../security/product-definition.service.js';
import {createOrganizationOnboarding} from '../onboarding/organization-onboarding.service.js';
import {hashPassword} from '../../security/password.js';
import * as authRepo from '../../repositories/auth.repository.js';
import {auditAdminControl} from '../../security/admin-control-audit.service.js';
import {RELEASE_VERSION} from '../../core/release.js';

export const CERTIFICATION_FIXTURE_CODE='ONM-CERT-DE-15';
export const CERTIFICATION_PRODUCT_KEY='onmission-logistics-certification';
export const CERTIFICATION_PRODUCT_NAME='ON Mission Logistics Certification';
const TENANT_A='ON Mission Certification GmbH';
const TENANT_B='ON Mission Isolation Test GmbH';

const fail=(code,status=400)=>Object.assign(new Error(code),{code,status});
const text=(v,max=240)=>String(v??'').trim().slice(0,max);
const actorForAdmin=admin=>({role:'platform_super_administrator',id:admin?.id||null});

async function ensureGermanyProductCountry(env){
 const existing=await getProductCountry(env,'DE');
 if(existing)return existing;
 const registration=await canonicalFirst(env,`SELECT code,name FROM country_catalog WHERE code='DE' AND active=1 LIMIT 1`,[],'country_catalog');
 if(!registration)throw fail('CERTIFICATION_GERMANY_COUNTRY_NOT_AVAILABLE',422);
 return (await createProductCountry(env,{code:'DE',name:registration.name,requiresReview:true})).country;
}

async function ensureProduct(env,admin){
 const existing=await canonicalFirst(env,`SELECT id FROM platform_product_definitions WHERE product_key=? ORDER BY definition_version DESC,id DESC LIMIT 1`,[CERTIFICATION_PRODUCT_KEY],'product_definition_authority');
 if(existing)return getProductDefinition(env,Number(existing.id));
 const definition=await createProductDefinition(env,actorForAdmin(admin),{
   productKey:CERTIFICATION_PRODUCT_KEY,
   name:CERTIFICATION_PRODUCT_NAME,
   description:'Controlled Germany logistics product used only for ON Mission runtime certification.',
   countryCode:'DE',
   sectorCode:'logistics'
 });
 try{return await compileProductDefinition(env,Number(definition.id));}catch{return definition;}
}

async function ensureTenant(env,admin,{name,fixtureTenantKey,adminEmail,adminPassword}){
 const marker=`${CERTIFICATION_FIXTURE_CODE}:${fixtureTenantKey}`;
 const existing=await canonicalFirst(env,`SELECT ep.company_id FROM platform_environment_profiles ep WHERE ep.environment_code='CERTIFICATION' AND ep.metadata_json LIKE ? LIMIT 1`,[`%${marker}%`],'certification_environment_authority');
 if(existing){
   await env.DB.prepare(`UPDATE platform_environment_profiles SET product_code=?,product_definition_id=(SELECT id FROM platform_product_definitions WHERE product_key=? ORDER BY definition_version DESC,id DESC LIMIT 1),country_code='DE',status='ACTIVE',side_effect_policy_code='SIMULATED_EXTERNAL_SIDE_EFFECTS',updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND environment_code='CERTIFICATION'`).bind(CERTIFICATION_PRODUCT_KEY,CERTIFICATION_PRODUCT_KEY,Number(existing.company_id)).run();
   return Number(existing.company_id);
 }
 const password=String(adminPassword||''); if(password.length<12)throw fail('CERTIFICATION_PASSWORD_REQUIRED',422);
 const result=await createOrganizationOnboarding(env,{
   idempotencyKey:`${CERTIFICATION_FIXTURE_CODE}:${fixtureTenantKey}`,
   countryCode:'DE',
   companyName:name,
   organizationType:'company',
   sectorCode:'logistics',
   purposeCode:'operational_communications',
   adminName:`${fixtureTenantKey} Certification Admin`,
   email:adminEmail,
   password,
   registrationNumber:`${CERTIFICATION_FIXTURE_CODE}-${fixtureTenantKey}`,
   registeredAddressLine1:'Certification Fixture',
   registeredPostalCode:'20095',
   registeredCity:'Hamburg'
 },{requestId:crypto.randomUUID(),actor:{type:'platform_super_administrator',id:admin?.id||null},certificationFixture:true});
 const companyId=Number(result.companyId);
 await env.DB.prepare(`INSERT INTO platform_environment_profiles(company_id,environment_code,product_code,product_definition_id,country_code,status,side_effect_policy_code,metadata_json,created_by_type,created_by_id) VALUES(?,'CERTIFICATION',?,(SELECT id FROM platform_product_definitions WHERE product_key=? ORDER BY definition_version DESC,id DESC LIMIT 1),'DE','ACTIVE','SIMULATED_EXTERNAL_SIDE_EFFECTS',?,'platform_super_administrator',?) ON CONFLICT(company_id) DO UPDATE SET environment_code='CERTIFICATION',product_code=excluded.product_code,product_definition_id=excluded.product_definition_id,country_code='DE',status='ACTIVE',side_effect_policy_code=excluded.side_effect_policy_code,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
   .bind(companyId,CERTIFICATION_PRODUCT_KEY,CERTIFICATION_PRODUCT_KEY,JSON.stringify({fixtureCode:CERTIFICATION_FIXTURE_CODE,fixtureTenantKey,credentialsExposed:false,externalSideEffects:false}),String(admin?.id||'')).run();
 return companyId;
}

async function ensureUser(env,{fixtureTenantKey,tenantId,role,login,password,displayName}){
 const existing=await canonicalFirst(env,`SELECT id,company_id,role,login,display_name,active FROM auth_identities WHERE login=? LIMIT 1`,[login],'certification_identity_authority');
 if(existing){
   if(Number(existing.company_id)!==Number(tenantId))throw fail('CERTIFICATION_IDENTITY_TENANT_MISMATCH',409);
   if(Number(existing.active)!==1){
     if(!password||String(password).length<12)throw fail('CERTIFICATION_PASSWORD_REQUIRED',422);
     const hashed=await hashPassword(String(password));
     await authRepo.updateIdentityCredentials(env,Number(existing.id),{login:existing.login,email:existing.login,displayName:existing.display_name,passwordHash:hashed.hash,passwordSalt:hashed.salt,passwordIterations:hashed.iterations,mustChangePassword:false});
   }
   await env.DB.prepare(`UPDATE platform_certification_fixture_users SET active=1,updated_at=CURRENT_TIMESTAMP WHERE fixture_code=? AND identity_id=?`).bind(CERTIFICATION_FIXTURE_CODE,Number(existing.id)).run();
   return Number(existing.id);
 }
 if(!password||String(password).length<12)throw fail('CERTIFICATION_PASSWORD_REQUIRED',422);
 const hashed=await hashPassword(String(password));
 const identityId=await authRepo.createIdentity(env,{companyId:tenantId,role,login,email:login,displayName,passwordHash:hashed.hash,passwordSalt:hashed.salt,passwordIterations:hashed.iterations,mustChangePassword:false});
 await env.DB.prepare(`INSERT OR IGNORE INTO platform_users(principal_type,principal_id,account_state) VALUES('tenant',?,'active')`).bind(identityId).run();
 const pu=await env.DB.prepare(`SELECT id FROM platform_users WHERE principal_type='tenant' AND principal_id=? LIMIT 1`).bind(identityId).first();
 await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_actors(platform_user_id,actor_type,active) VALUES(?,'tenant',1)`).bind(Number(pu.id)).run();
 await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_memberships(platform_user_id,membership_type,membership_id,status) VALUES(?,'tenant',?,'active')`).bind(Number(pu.id),tenantId).run();
 await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_roles(platform_user_id,role_code,scope_type,scope_id,active) VALUES(?,?,?,?,1)`).bind(Number(pu.id),role,'tenant',tenantId).run();
 await env.DB.prepare(`INSERT INTO platform_certification_fixture_users(fixture_code,tenant_key,identity_id,role_code,login) VALUES(?,?,?,?,?)`).bind(CERTIFICATION_FIXTURE_CODE,fixtureTenantKey,identityId,role,login).run();
 return identityId;
}

export async function getCertificationEnvironment(env){
 const fixture=await canonicalFirst(env,`SELECT * FROM platform_certification_fixtures WHERE fixture_code=? LIMIT 1`,[CERTIFICATION_FIXTURE_CODE],'certification_environment_authority');
 if(!fixture)return {ready:false,fixtureCode:CERTIFICATION_FIXTURE_CODE,release:RELEASE_VERSION};
 const users=await canonicalAll(env,`SELECT tenant_key,identity_id,role_code,login,active FROM platform_certification_fixture_users WHERE fixture_code=? ORDER BY tenant_key,role_code,identity_id`,[CERTIFICATION_FIXTURE_CODE],'certification_identity_authority');
 return {ready:String(fixture.status)==='READY',fixtureCode:fixture.fixture_code,release:fixture.version,countryCode:fixture.country_code,productKey:fixture.product_key,productDefinitionId:fixture.product_definition_id?Number(fixture.product_definition_id):null,tenantAId:fixture.tenant_a_id?Number(fixture.tenant_a_id):null,tenantBId:fixture.tenant_b_id?Number(fixture.tenant_b_id):null,status:fixture.status,users};
}

export async function provisionCertificationEnvironment(env,admin,{users={}}={}){
 const existing=await canonicalFirst(env,`SELECT * FROM platform_certification_fixtures WHERE fixture_code=? LIMIT 1`,[CERTIFICATION_FIXTURE_CODE],'certification_environment_authority');
 if(existing&&String(existing.status)==='READY')return {...await getCertificationEnvironment(env),reused:true};
 for(const key of ['admin','manager','operator','attacker']){if(!users[key]?.password||String(users[key].password).length<12)throw fail(`CERTIFICATION_PASSWORD_REQUIRED:${key}`,422);}

 await ensureGermanyProductCountry(env);
 const product=await ensureProduct(env,admin);
 const tenantA=await ensureTenant(env,admin,{name:TENANT_A,fixtureTenantKey:'A',adminEmail:text(users.admin?.login||'cert-admin@cert.onmission.test',190).toLowerCase(),adminPassword:users.admin?.password});
 const tenantB=await ensureTenant(env,admin,{name:TENANT_B,fixtureTenantKey:'B',adminEmail:text(users.attacker?.login||'cert-attacker@cert.onmission.test',190).toLowerCase(),adminPassword:users.attacker?.password});

 const credentials=[
   ['A','admin',users.admin||{login:'cert-admin@cert.onmission.test'},'Certification Admin'],
   ['A','manager',users.manager||{login:'cert-manager@cert.onmission.test'},'Certification Manager'],
   ['A','operator',users.operator||{login:'cert-operator@cert.onmission.test'},'Certification Operator'],
   ['B','operator',users.attacker||{login:'cert-attacker@cert.onmission.test'},'Certification Isolation Attacker']
 ];
 for(const [key,role,input,label] of credentials){
   await ensureUser(env,{fixtureTenantKey:key,tenantId:key==='A'?tenantA:tenantB,role,login:text(input.login,190).toLowerCase(),password:input.password,displayName:label});
 }

 await env.DB.prepare(`INSERT INTO platform_certification_fixtures(fixture_code,country_code,product_key,product_definition_id,tenant_a_id,tenant_b_id,status,version,metadata_json) VALUES(?,?,?,?,? ,?,'READY',?,?) ON CONFLICT(fixture_code) DO UPDATE SET country_code=excluded.country_code,product_key=excluded.product_key,product_definition_id=excluded.product_definition_id,tenant_a_id=excluded.tenant_a_id,tenant_b_id=excluded.tenant_b_id,status='READY',version=excluded.version,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
   .bind(CERTIFICATION_FIXTURE_CODE,'DE',CERTIFICATION_PRODUCT_KEY,Number(product.id),tenantA,tenantB,'15.4.0',JSON.stringify({externalEffects:false,providerCode:'onmission-cert-sandbox'})).run();
 await auditAdminControl(env,{actor:actorForAdmin(admin),action:'platform.certification.fixture_provisioned',resourceType:'certification_fixture',resourceId:null,targetCompanyId:tenantA,metadata:{fixtureCode:CERTIFICATION_FIXTURE_CODE,countryCode:'DE',productKey:CERTIFICATION_PRODUCT_KEY,tenantA,tenantB,externalEffects:false}});
 return {...await getCertificationEnvironment(env),reused:false};
}

export async function resetCertificationEnvironment(env,admin){
 const fixture=await canonicalFirst(env,`SELECT * FROM platform_certification_fixtures WHERE fixture_code=? LIMIT 1`,[CERTIFICATION_FIXTURE_CODE],'certification_environment_authority');
 if(!fixture)return {reset:false,reason:'NOT_PROVISIONED'};
 await env.DB.prepare(`UPDATE platform_certification_fixtures SET status='RESETTING',updated_at=CURRENT_TIMESTAMP WHERE fixture_code=?`).bind(CERTIFICATION_FIXTURE_CODE).run();
 await env.DB.prepare(`UPDATE auth_identities SET active=0,session_version=session_version+1,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT identity_id FROM platform_certification_fixture_users WHERE fixture_code=?)`).bind(CERTIFICATION_FIXTURE_CODE).run();
 await env.DB.prepare(`UPDATE platform_environment_profiles SET status='QUARANTINED',updated_at=CURRENT_TIMESTAMP WHERE company_id IN (?,?) AND environment_code='CERTIFICATION'`).bind(Number(fixture.tenant_a_id),Number(fixture.tenant_b_id)).run();
 await env.DB.prepare(`UPDATE platform_certification_fixture_users SET active=0,updated_at=CURRENT_TIMESTAMP WHERE fixture_code=?`).bind(CERTIFICATION_FIXTURE_CODE).run();
 await auditAdminControl(env,{actor:actorForAdmin(admin),action:'platform.certification.fixture_reset',resourceType:'certification_fixture',resourceId:null,targetCompanyId:Number(fixture.tenant_a_id),metadata:{fixtureCode:CERTIFICATION_FIXTURE_CODE}});
 return {reset:true,status:'QUARANTINED',fixtureCode:CERTIFICATION_FIXTURE_CODE};
}
