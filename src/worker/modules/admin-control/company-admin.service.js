import {canonicalFirst} from '../../core/canonical-db.js';
import {resolveCanonicalCompanyContext} from '../../security/company-context.service.js';
import {auditAdminControl} from './admin-control.audit.js';
import {clean,nullable,bad} from './admin-control.utils.js';
export async function getCompany(env,companyId){const context=await resolveCanonicalCompanyContext(env,companyId);if(!context)throw bad('Company not found',404);return context;}
export async function updateCompany(env,actor,companyId,data,requestId){
  const id=Number(companyId||0);if(!id)throw bad('Company id is required');
  const current=await canonicalFirst(env,`SELECT c.id,c.name,c.deletion_status,cmp.* FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.id=? LIMIT 1`,[id],'admin.company.identity');
  if(!current)throw bad('Company not found',404);if(current.deletion_status!=='active')throw bad('Deleted company cannot be edited',409);
  const legalName=clean(data.legalName,240),countryCode=clean(data.countryCode,2).toUpperCase();
  if(!legalName)throw bad('Legal company name is required');if(!/^[A-Z]{2}$/.test(countryCode))throw bad('Valid ISO country code is required');
  if(!await canonicalFirst(env,`SELECT code FROM country_catalog WHERE code=? AND active=1 LIMIT 1`,[countryCode],'admin.company.country'))throw bad('Country is not configured',422);
  const sectorCode=clean(data.sectorCode,80)||'general';
  const sector=await canonicalFirst(env,`SELECT code FROM sector_policies WHERE sector_code=? AND status='active' ORDER BY effective_version DESC LIMIT 1`,[sectorCode],'admin.company.sector_policy');
  const params=[legalName,nullable(data.tradingName),nullable(data.registrationNumber,120),nullable(data.registrationAuthority,200),nullable(data.registrationDate,40),countryCode,nullable(data.regionCode,80),nullable(data.registeredAddressLine1),nullable(data.registeredAddressLine2),nullable(data.registeredPostalCode,40),nullable(data.registeredCity,120),clean(data.organizationType,80)||'company',sectorCode,nullable(data.organizationSize,80),clean(data.complianceStatus,30)||'configured',id];
  await env.DB.prepare(`INSERT INTO company_management_profiles(company_id,legal_name,trading_name,registration_number,registration_authority,registration_date,country_code,region_code,registered_address_line1,registered_address_line2,registered_postal_code,registered_city,organization_type,sector_code,organization_size,compliance_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET legal_name=excluded.legal_name,trading_name=excluded.trading_name,registration_number=excluded.registration_number,registration_authority=excluded.registration_authority,registration_date=excluded.registration_date,country_code=excluded.country_code,region_code=excluded.region_code,registered_address_line1=excluded.registered_address_line1,registered_address_line2=excluded.registered_address_line2,registered_postal_code=excluded.registered_postal_code,registered_city=excluded.registered_city,organization_type=excluded.organization_type,sector_code=excluded.sector_code,organization_size=excluded.organization_size,compliance_status=excluded.compliance_status,updated_at=CURRENT_TIMESTAMP`).bind(...params).run();
  await env.DB.prepare(`UPDATE companies SET name=? WHERE id=?`).bind(legalName,id).run();
  await env.DB.prepare(`UPDATE company_verification_status SET country_code=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(countryCode,id).run();
  const existing=await canonicalFirst(env,`SELECT * FROM organization_compliance_policies WHERE company_id=? LIMIT 1`,[id],'admin.company.compliance_policy');
  const jurisdiction=await canonicalFirst(env,`SELECT code FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC LIMIT 1`,[countryCode],'admin.company.jurisdiction_policy');
  const residency=await canonicalFirst(env,`SELECT code FROM residency_policies WHERE jurisdiction_code=? AND active=1 ORDER BY version DESC,code LIMIT 1`,[jurisdiction?.code||''],'admin.company.residency_policy');
  if(!jurisdiction||!residency)throw bad('Country compliance foundation is incomplete',422);
  const policyCode=sector?.code||existing?.sector_policy_code||'general-v1';
  await env.DB.prepare(`INSERT INTO organization_compliance_policies(company_id,jurisdiction_code,sector_code,sector_policy_code,processing_profile,residency_policy_code,policy_version,status) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET jurisdiction_code=excluded.jurisdiction_code,sector_code=excluded.sector_code,sector_policy_code=excluded.sector_policy_code,residency_policy_code=excluded.residency_policy_code,updated_at=CURRENT_TIMESTAMP`).bind(id,jurisdiction.code,sectorCode,policyCode,existing?.processing_profile||'operational_communications',residency.code,existing?.policy_version||'current',existing?.status||'configured').run();
  await auditAdminControl(env,{actor,action:'admin.company.updated',resourceType:'company',resourceId:id,targetCompanyId:id,requestId,metadata:{countryCode,sectorCode,fields:Object.keys(data||{}).slice(0,24)}});
  return getCompany(env,id);
}
export async function listCompanyAudit(env,companyId){return (await env.DB.prepare(`SELECT id,event_id,actor_role,action,resource_type,resource_id,target_company_id,request_id,metadata,created_at FROM admin_control_audit_events WHERE target_company_id=? ORDER BY id DESC LIMIT 100`).bind(Number(companyId)).all()).results||[];}
