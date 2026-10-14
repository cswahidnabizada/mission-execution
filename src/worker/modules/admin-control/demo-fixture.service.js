/**
 * ON Mission 15.5.0 — Product Experience Demo Fixture.
 *
 * This is orchestration/configuration only. Country, product, tenant and
 * identity authorities remain canonical. The fixture gives Product Experience
 * one stable, resettable DEMO environment instead of random demo data.
 */
import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';
import {createOrganizationOnboarding} from '../onboarding/organization-onboarding.service.js';
import {hashPassword} from '../../security/password.js';
import * as authRepo from '../../repositories/auth.repository.js';
import {purgeSessions} from '../account/account.service.js';
import {auditAdminControl} from '../../security/admin-control-audit.service.js';
import {getProductCountry} from '../../security/product-country-catalog.service.js';
import {RELEASE_VERSION} from '../../core/release.js';

export const DEMO_FIXTURE_CODE='ONM-DEMO-DE-15';
export const DEMO_FIXTURE_TENANT='ON Mission Demo GmbH';
export const DEMO_FIXTURE_PRODUCTS=Object.freeze([
  Object.freeze({productCode:'onmission-logistics-demo',displayName:'ON Mission Logistics Demo',countryCode:'DE',sectorCode:'logistics'}),
  Object.freeze({productCode:'onmission-field-service-demo',displayName:'ON Mission Field Service Demo',countryCode:'DE',sectorCode:'field_service'})
]);
const USERS=Object.freeze([
  Object.freeze({role:'admin',login:'demo-admin@demo.onmission.test',displayName:'Demo Admin'}),
  Object.freeze({role:'manager',login:'demo-manager@demo.onmission.test',displayName:'Demo Operations Manager'}),
  Object.freeze({role:'operator',login:'demo-operator@demo.onmission.test',displayName:'Demo Operations User'})
]);
const fail=(code,status=400)=>Object.assign(new Error(code),{code,status});
const actor=admin=>({role:'platform_super_administrator',id:admin?.id||null});

async function ensureDemoProducts(env){
  const country=await getProductCountry(env,'DE'); if(!country||Number(country.active)!==1)throw fail('DEMO_GERMANY_COUNTRY_NOT_AVAILABLE',422);
  for(const product of DEMO_FIXTURE_PRODUCTS){
    const source=await canonicalFirst(env,`SELECT id FROM platform_product_definitions WHERE product_key=? ORDER BY definition_version DESC,id DESC LIMIT 1`,[product.productCode],'product_definition_authority');
    await env.DB.prepare(`INSERT INTO platform_demo_product_profiles(product_code,display_name,country_code,sector_code,source_product_definition_id,status,metadata_json)
      VALUES(?,?,?,?,?,'ACTIVE',?)
      ON CONFLICT(product_code) DO UPDATE SET display_name=excluded.display_name,country_code=excluded.country_code,sector_code=excluded.sector_code,source_product_definition_id=excluded.source_product_definition_id,status='ACTIVE',metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(product.productCode,product.displayName,product.countryCode,product.sectorCode,source?.id?Number(source.id):null,JSON.stringify({fixtureCode:DEMO_FIXTURE_CODE,simulationOnly:true,externalSideEffects:false,canonicalProductAuthority:'platform_product_definitions'})).run();
  }
}

async function ensureTenant(env,admin){
  const marker=`${DEMO_FIXTURE_CODE}:TENANT`;
  const existing=await canonicalFirst(env,`SELECT company_id FROM platform_environment_profiles WHERE environment_code='DEMO' AND metadata_json LIKE ? LIMIT 1`,[`%${marker}%`],'demo_environment_authority');
  if(existing){
    await env.DB.prepare(`UPDATE platform_environment_profiles SET country_code='DE',product_code=?,product_definition_id=(SELECT source_product_definition_id FROM platform_demo_product_profiles WHERE product_code=? LIMIT 1),status='ACTIVE',side_effect_policy_code='SIMULATED_EXTERNAL_SIDE_EFFECTS',expires_at=NULL,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND environment_code='DEMO'`)
      .bind(DEMO_FIXTURE_PRODUCTS[0].productCode,DEMO_FIXTURE_PRODUCTS[0].productCode,JSON.stringify({fixtureCode:DEMO_FIXTURE_CODE,marker,disposable:false,showcase:true,credentialsExposed:false,externalSideEffects:false}),Number(existing.company_id)).run();
    return Number(existing.company_id);
  }
  const password=`ONM-DEMO-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const result=await createOrganizationOnboarding(env,{
    idempotencyKey:`${DEMO_FIXTURE_CODE}:TENANT`,
    countryCode:'DE',
    companyName:DEMO_FIXTURE_TENANT,
    organizationType:'company',
    sectorCode:'logistics',
    purposeCode:'operational_communications',
    adminName:'Demo Admin',
    email:USERS[0].login,
    password,
    registrationNumber:`${DEMO_FIXTURE_CODE}-TENANT`,
    registeredAddressLine1:'Certification Fixture',
    registeredPostalCode:'20095',
    registeredCity:'Hamburg'
  },{requestId:crypto.randomUUID(),actor:{type:'platform_super_administrator',id:admin?.id||null}});
  const companyId=Number(result.companyId);
  await env.DB.prepare(`INSERT INTO platform_environment_profiles(company_id,environment_code,product_code,product_definition_id,status,side_effect_policy_code,country_code,metadata_json,created_by_type,created_by_id)
    VALUES(?,'DEMO',?,(SELECT source_product_definition_id FROM platform_demo_product_profiles WHERE product_code=? LIMIT 1),'ACTIVE','SIMULATED_EXTERNAL_SIDE_EFFECTS','DE',?,'platform_super_administrator',?)
    ON CONFLICT(company_id) DO UPDATE SET environment_code='DEMO',product_code=excluded.product_code,status='ACTIVE',side_effect_policy_code=excluded.side_effect_policy_code,country_code='DE',metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(companyId,DEMO_FIXTURE_PRODUCTS[0].productCode,DEMO_FIXTURE_PRODUCTS[0].productCode,JSON.stringify({fixtureCode:DEMO_FIXTURE_CODE,marker,disposable:false,showcase:true,credentialsExposed:false,externalSideEffects:false}),String(admin?.id||'')).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_demo_fixtures(fixture_code,country_code,tenant_id,default_product_code,status,metadata_json)
    VALUES(?,'DE',?,?, 'READY',?)`).bind(DEMO_FIXTURE_CODE,companyId,DEMO_FIXTURE_PRODUCTS[0].productCode,JSON.stringify({showcase:true,simulationOnly:true})).run();
  return companyId;
}

async function ensureUser(env,{tenantId,role,login,displayName}){
  const existing=await canonicalFirst(env,`SELECT id,company_id,role,login,display_name,active FROM auth_identities WHERE login=? LIMIT 1`,[login],'demo_fixture.identity_authority');
  if(existing){
    if(Number(existing.company_id)!==Number(tenantId))throw fail('DEMO_FIXTURE_IDENTITY_TENANT_MISMATCH',409);
    await env.DB.prepare(`UPDATE auth_identities SET active=1,role=?,display_name=?,session_version=session_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(role,displayName,Number(existing.id)).run();
    const platformUser=await env.DB.prepare(`SELECT id FROM platform_users WHERE principal_type='tenant' AND principal_id=? LIMIT 1`).bind(Number(existing.id)).first();
    if(platformUser){
      await env.DB.prepare(`UPDATE platform_users SET account_state='active' WHERE id=?`).bind(Number(platformUser.id)).run();
      await env.DB.prepare(`UPDATE platform_user_actors SET active=1 WHERE platform_user_id=?`).bind(Number(platformUser.id)).run();
      await env.DB.prepare(`UPDATE platform_user_memberships SET status='active' WHERE platform_user_id=? AND membership_id=?`).bind(Number(platformUser.id),tenantId).run();
      await env.DB.prepare(`UPDATE platform_user_roles SET active=1,role_code=? WHERE platform_user_id=? AND scope_type='tenant' AND scope_id=?`).bind(role,Number(platformUser.id),tenantId).run();
    }
    await env.DB.prepare(`UPDATE platform_demo_fixture_users SET active=1,role_code=?,updated_at=CURRENT_TIMESTAMP WHERE fixture_code=? AND identity_id=?`)
      .bind(role,DEMO_FIXTURE_CODE,Number(existing.id)).run();
    return Number(existing.id);
  }
  const password=`ONM-DEMO-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const hashed=await hashPassword(password);
  const identityId=await authRepo.createIdentity(env,{companyId:tenantId,role,login,email:login,displayName,passwordHash:hashed.hash,passwordSalt:hashed.salt,passwordIterations:hashed.iterations,mustChangePassword:true});
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_users(principal_type,principal_id,account_state) VALUES('tenant',?,'active')`).bind(identityId).run();
  const pu=await env.DB.prepare(`SELECT id FROM platform_users WHERE principal_type='tenant' AND principal_id=? LIMIT 1`).bind(identityId).first();
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_actors(platform_user_id,actor_type,active) VALUES(?,'tenant',1)`).bind(Number(pu.id)).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_memberships(platform_user_id,membership_type,membership_id,status) VALUES(?,'tenant',?,'active')`).bind(Number(pu.id),tenantId).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_roles(platform_user_id,role_code,scope_type,scope_id,active) VALUES(?,?,?,?,1)`).bind(Number(pu.id),role,'tenant',tenantId).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_demo_fixture_users(fixture_code,identity_id,role_code,login,active) VALUES(?,?,?,?,1)`).bind(DEMO_FIXTURE_CODE,identityId,role,login).run();
  return identityId;
}

export async function getDemoFixture(env){
  const fixture=await canonicalFirst(env,`SELECT f.*,c.name tenant_name,cmp.country_code,cmp.sector_code,ep.status environment_status,ep.product_code,ep.side_effect_policy_code
    FROM platform_demo_fixtures f LEFT JOIN companies c ON c.id=f.tenant_id LEFT JOIN company_management_profiles cmp ON cmp.company_id=f.tenant_id
    LEFT JOIN platform_environment_profiles ep ON ep.company_id=f.tenant_id AND ep.environment_code='DEMO'
    WHERE f.fixture_code=? LIMIT 1`,[DEMO_FIXTURE_CODE],'demo_fixture.authority');
  const products=await canonicalAll(env,`SELECT p.product_code,p.display_name,p.country_code,p.sector_code,p.source_product_definition_id,p.status
    FROM platform_demo_product_profiles p WHERE p.status='ACTIVE' ORDER BY p.sector_code,p.product_code`,[],'demo_fixture.product_catalog');
  const users=await canonicalAll(env,`SELECT u.identity_id,u.role_code,u.login,u.active
    FROM platform_demo_fixture_users u WHERE u.fixture_code=? ORDER BY CASE u.role_code WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END`,[DEMO_FIXTURE_CODE],'demo_fixture.identity_authority');
  return {ready:Boolean(fixture&&String(fixture.status)==='READY'&&String(fixture.environment_status||'')==='ACTIVE'),fixtureCode:DEMO_FIXTURE_CODE,status:fixture?.status||'NOT_PROVISIONED',countryCode:'DE',tenantId:fixture?.tenant_id?Number(fixture.tenant_id):null,tenantName:fixture?.tenant_name||null,environmentStatus:fixture?.environment_status||null,productCode:fixture?.product_code||DEMO_FIXTURE_PRODUCTS[0].productCode,sideEffectPolicy:fixture?.side_effect_policy_code||'SIMULATED_EXTERNAL_SIDE_EFFECTS',products,users};
}

export async function provisionDemoFixture(env,admin){
  const existing=await canonicalFirst(env,`SELECT * FROM platform_demo_fixtures WHERE fixture_code=? LIMIT 1`,[DEMO_FIXTURE_CODE],'demo_fixture.authority');
  await ensureDemoProducts(env);
  const tenantId=await ensureTenant(env,admin);
  for(const user of USERS)await ensureUser(env,{tenantId,...user});
  await env.DB.prepare(`INSERT INTO platform_demo_fixtures(fixture_code,country_code,tenant_id,default_product_code,status,metadata_json)
    VALUES(?,'DE',?,?, 'READY',?)
    ON CONFLICT(fixture_code) DO UPDATE SET country_code='DE',tenant_id=excluded.tenant_id,default_product_code=excluded.default_product_code,status='READY',metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(DEMO_FIXTURE_CODE,tenantId,DEMO_FIXTURE_PRODUCTS[0].productCode,JSON.stringify({showcase:true,simulationOnly:true,externalSideEffects:false})).run();
  await auditAdminControl(env,{actor:actor(admin),action:'platform.demo.fixture_provisioned',resourceType:'demo_fixture',resourceId:DEMO_FIXTURE_CODE,targetCompanyId:tenantId,metadata:{fixtureCode:DEMO_FIXTURE_CODE,countryCode:'DE',products:DEMO_FIXTURE_PRODUCTS.map(x=>x.productCode),users:USERS.map(x=>x.login),externalEffects:false}});
  return {...await getDemoFixture(env),reused:Boolean(existing)};
}

export async function resetDemoFixture(env,admin){
  const fixture=await canonicalFirst(env,`SELECT * FROM platform_demo_fixtures WHERE fixture_code=? LIMIT 1`,[DEMO_FIXTURE_CODE],'demo_fixture.authority');
  if(!fixture)return {reset:false,reason:'NOT_PROVISIONED'};
  const tenantId=Number(fixture.tenant_id||0);
  if(tenantId){
    await purgeSessions(env,s=>Number(s.tenantId)===tenantId||Number(s.actingAs?.targetTenantId||0)===tenantId||Number(s.actingAs?.demoSession?.tenantId||0)===tenantId);
    await env.DB.prepare(`UPDATE auth_identities SET active=0,session_version=session_version+1,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT identity_id FROM platform_demo_fixture_users WHERE fixture_code=?)`).bind(DEMO_FIXTURE_CODE).run();
    await env.DB.prepare(`UPDATE platform_environment_profiles SET status='QUARANTINED',updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND environment_code='DEMO'`).bind(tenantId).run();
    await env.DB.prepare(`UPDATE demo_scenario_instances SET status='RESET',current_sequence=0,started_at=NULL,completed_at=NULL,reset_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(tenantId).run();
    await env.DB.prepare(`UPDATE platform_demo_fixture_users SET active=0,updated_at=CURRENT_TIMESTAMP WHERE fixture_code=?`).bind(DEMO_FIXTURE_CODE).run();
    await env.DB.prepare(`UPDATE platform_demo_fixtures SET status='QUARANTINED',updated_at=CURRENT_TIMESTAMP WHERE fixture_code=?`).bind(DEMO_FIXTURE_CODE).run();
  }
  await auditAdminControl(env,{actor:actor(admin),action:'platform.demo.fixture_reset',resourceType:'demo_fixture',resourceId:DEMO_FIXTURE_CODE,targetCompanyId:tenantId||null,metadata:{fixtureCode:DEMO_FIXTURE_CODE}});
  return {reset:true,fixtureCode:DEMO_FIXTURE_CODE,status:'QUARANTINED'};
}
