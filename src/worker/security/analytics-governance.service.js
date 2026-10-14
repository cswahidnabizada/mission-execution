const ALLOWED_CLASSIFICATIONS=new Set(['PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE']);
const DEFAULT_METRICS=['missionVolume','activeMissions','completionRate','overdueRate','averageMissionDurationMinutes','averageStageDurationMinutes','exceptionRate','networkInvitationAcceptanceRate','missionsPerExecutor','foryouAcceptanceRate','statusDistribution','dailyActivity'];
export async function resolveAnalyticsGovernance(env,companyId){
  const id=Number(companyId||0); if(!Number.isSafeInteger(id)||id<=0) throw Object.assign(new Error('ANALYTICS_COMPANY_REQUIRED'),{status:400});
  const company=await env.DB.prepare(`SELECT c.id,c.deletion_status,cmp.country_code,cmp.compliance_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.id=? LIMIT 1`).bind(id).first();
  if(!company)throw Object.assign(new Error('ANALYTICS_COMPANY_NOT_FOUND'),{status:404});
  if(company.deletion_status&&company.deletion_status!=='active')throw Object.assign(new Error('ANALYTICS_COMPANY_INACTIVE'),{status:409});
  const countryCode=String(company.country_code||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(countryCode)||countryCode==='ZZ')throw Object.assign(new Error('ANALYTICS_COUNTRY_UNRESOLVED'),{status:409});
  const policy=await env.DB.prepare(`SELECT ap.*,rp.retention_days,rp.action_after_expiry,rp.legal_hold_allowed FROM analytics_policy_registry ap LEFT JOIN retention_policies rp ON rp.code=ap.retention_policy_code AND rp.active=1 WHERE ap.active=1 AND (ap.company_id=? OR ap.company_id IS NULL) AND (ap.country_code=? OR ap.country_code='ZZ') ORDER BY CASE WHEN ap.company_id=? THEN 0 ELSE 1 END,CASE WHEN ap.country_code=? THEN 0 ELSE 1 END,ap.effective_at DESC,ap.id DESC LIMIT 1`).bind(id,countryCode,id,countryCode).first();
  if(!policy)throw Object.assign(new Error('ANALYTICS_POLICY_NOT_CONFIGURED'),{status:403});
  const allowed=parseArray(policy.allowed_metric_codes,DEFAULT_METRICS); if(!allowed.length)throw Object.assign(new Error('ANALYTICS_METRICS_NOT_ALLOWED'),{status:403});
  const classification=String(policy.classification||'INTERNAL').toUpperCase(); if(!ALLOWED_CLASSIFICATIONS.has(classification))throw Object.assign(new Error('ANALYTICS_CLASSIFICATION_INVALID'),{status:500});
  return Object.freeze({policyId:Number(policy.id),companyId:id,countryCode,purposeCode:String(policy.purpose_code),classification,retentionPolicyCode:policy.retention_policy_code||null,retentionDays:policy.retention_days==null?null:Number(policy.retention_days),retentionAction:policy.action_after_expiry||null,legalHoldAllowed:policy.legal_hold_allowed==null?true:Boolean(Number(policy.legal_hold_allowed)),allowedMetricCodes:allowed,aggregationRequired:Boolean(Number(policy.aggregation_required)),minimize:Boolean(Number(policy.minimize)),pseudonymize:Boolean(Number(policy.pseudonymize)),exportAllowed:Boolean(Number(policy.export_allowed)),auditRequired:Boolean(Number(policy.audit_required)),version:String(policy.version||'1')});
}
function parseArray(v,fallback){try{const a=JSON.parse(String(v||'[]'));return Array.isArray(a)?Array.from(new Set(a.map(String).filter(Boolean))):fallback}catch{return fallback}}
export {DEFAULT_METRICS};
