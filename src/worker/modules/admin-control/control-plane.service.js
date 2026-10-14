import {listPlatformConfigurations} from '../../security/platform-configuration.service.js';
import {safeAll,safeFirst} from './admin-control.utils.js';
export async function getControlPlane(env){
  // Authentication is authoritative and independent from control-plane data.
  // A single missing/changed governance table must never turn a valid Super Admin
  // session into a fake authentication failure page. Each read therefore degrades
  // independently and reports a non-sensitive warning code to the Studio.
  const results=await Promise.all([
    safeAll(()=>env.DB.prepare(`SELECT c.id,COALESCE(cmp.legal_name,c.name) legal_name,cmp.trading_name,cmp.country_code,cmp.region_code,cmp.sector_code,cmp.organization_type,cmp.organization_size,cmp.compliance_status,cmp.status management_status,c.deletion_status,c.created_at FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id ORDER BY c.id DESC LIMIT 100`),'companies'),
    safeAll(()=>env.DB.prepare(`SELECT code,name,active,requires_review,default_subscription_class FROM country_catalog WHERE active=1 ORDER BY name`),'countries'),
    safeAll(()=>env.DB.prepare(`SELECT code,name,active,requires_review,default_subscription_class FROM platform_product_country_catalog WHERE active=1 ORDER BY name`),'productCountries'),
    safeAll(()=>env.DB.prepare(`SELECT code,country_code,region_code,framework_code,data_residency_mode,effective_version,status FROM jurisdiction_policies WHERE status='active' ORDER BY country_code,code`),'jurisdictions'),
    safeAll(()=>env.DB.prepare(`SELECT code,name,description,active,created_at,updated_at FROM platform_reusable_sectors WHERE active=1 ORDER BY name`),'sectors'),
    safeAll(()=>env.DB.prepare(`SELECT code,label,description,default_legal_basis,active FROM processing_purposes WHERE active=1 ORDER BY code`),'purposes'),
    safeAll(()=>env.DB.prepare(`SELECT code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version,active FROM retention_policies WHERE active=1 ORDER BY code`),'retention'),
    safeAll(()=>env.DB.prepare(`SELECT code,jurisdiction_code,primary_region,primary_provider,mode,fallback_allowed,version,active FROM residency_policies WHERE active=1 ORDER BY code`),'residency'),
    safeAll(()=>env.DB.prepare(`SELECT role_code,label,description,scope_type,active FROM organization_role_catalog WHERE active=1 ORDER BY role_code`),'roles'),
    safeAll(()=>env.DB.prepare(`SELECT id,event_id,actor_role,action,resource_type,resource_id,target_company_id,request_id,metadata,created_at FROM admin_control_audit_events ORDER BY id DESC LIMIT 40`),'audit'),
    safeFirst(()=>env.DB.prepare(`SELECT COUNT(*) count FROM verification_profiles WHERE review_status='pending'`).first(),'reviews',{count:0}),
    safeAll(()=>env.DB.prepare(`SELECT cp.id,cp.company_id,cp.country_code,cp.purpose_code,cp.policy_version,cp.title,cp.policy_text,cp.require_consent,cp.withdrawal_effect,cp.effective_at,cp.active,p.label purpose_label,p.default_legal_basis FROM consent_policy_versions cp JOIN processing_purposes p ON p.code=cp.purpose_code ORDER BY cp.active DESC,cp.country_code,cp.company_id,p.code,cp.id DESC LIMIT 250`),'consentPolicies'),
    safeAll(()=>env.DB.prepare(`SELECT status,COUNT(*) count FROM company_management_profiles GROUP BY status`),'lifecycleCounts'),
    safeAll(()=>env.DB.prepare(`SELECT id,code,name,active FROM plans WHERE active=1 ORDER BY id`),'plans'),
    (async()=>{try{return {data:await listPlatformConfigurations(env),warning:null};}catch(error){console.error('ADMIN_CONTROL_PLANE_QUERY_FAILED','configurations',String(error?.message||error).slice(0,240));return {data:[],warning:'configurations'};}})()
  ]);
  const [companies,countries,productCountries,jurisdictions,sectors,purposes,retention,residency,roles,audit,reviews,consentPolicies,lifecycleCounts,plans,configurations]=results;
  const lifecycle={}; for(const r of lifecycleCounts.data||[]) lifecycle[r.status]=Number(r.count||0);
  const warnings=results.map(x=>x.warning).filter(Boolean);
  return {
    overview:{companyCount:companies.data.length,countryCount:countries.data.length,productCountryCount:productCountries.data.length,pendingReviews:Number(reviews.data?.count||0),organizationLifecycle:lifecycle},
    companies:companies.data,countries:countries.data,productCountries:productCountries.data,jurisdictions:jurisdictions.data,sectors:sectors.data,purposes:purposes.data,retention:retention.data,residency:residency.data,roles:roles.data,audit:audit.data,
    configurations:configurations.data,
    plans:plans.data,
    consentPolicies:consentPolicies.data.map(r=>({...r,id:Number(r.id),company_id:r.company_id===null?null:Number(r.company_id),require_consent:Number(r.require_consent)===1,active:Number(r.active)===1})),
    dataQuality:{status:warnings.length?'degraded':'healthy',warnings}
  };
}
