import {auditAdminControl} from '../../security/admin-control-audit.service.js';
import {canonicalAll} from '../../core/canonical-db.js';
import {listConsentPolicies,upsertConsentPolicy} from '../../security/consent-policy.service.js';
export {listConsentPolicies,upsertConsentPolicy};
import {clean,nullable,bad,parseJsonArray} from './admin-control.utils.js';
export async function getPrivacyAdministrationSummary(env){
  const [requests,holds]=await Promise.all([
    canonicalAll(env,`SELECT status,COUNT(*) count FROM privacy_requests GROUP BY status`,[],"privacy_administration_summary"),
    canonicalAll(env,`SELECT COUNT(*) count FROM privacy_legal_holds WHERE active=1`,[],"privacy_administration_summary")
  ]);
  const counts={received:0,processing:0,restricted:0,completed:0,partially_completed:0,rejected:0,cancelled:0};
  for(const r of requests||[])if(Object.prototype.hasOwnProperty.call(counts,r.status))counts[r.status]=Number(r.count||0);
  return {counts,activeLegalHolds:Number(holds?.[0]?.count||0)};
}
export async function getNotificationGovernance(env){
  const rows=(await env.DB.prepare(`
    SELECT np.id,np.notification_type,np.company_id,np.country_code,np.purpose_code,np.classification,np.provider_code,
           np.retention_policy_code,np.allowed_recipient_roles,np.max_title_length,np.max_body_length,np.minimize,
           np.audit_required,np.version,np.active,np.effective_at,np.updated_at,r.retention_days,r.action_after_expiry,r.legal_hold_allowed
    FROM notification_policy_registry np
    LEFT JOIN retention_policies r ON r.code=np.retention_policy_code
    ORDER BY np.notification_type,np.company_id IS NOT NULL,np.country_code,np.effective_at DESC,np.id DESC
  `).all()).results||[];
  return {policies:rows.map(x=>({...x,id:Number(x.id),company_id:x.company_id===null?null:Number(x.company_id),minimize:Boolean(Number(x.minimize)),audit_required:Boolean(Number(x.audit_required)),active:Boolean(Number(x.active)),allowed_recipient_roles:parseJsonArray(x.allowed_recipient_roles)}))};
}
export async function updateNotificationPolicy(env,actor,id,data,requestId){
  const policyId=Number(id||0);if(!policyId)throw bad('Notification policy id is required');
  const current=await env.DB.prepare(`SELECT * FROM notification_policy_registry WHERE id=? LIMIT 1`).bind(policyId).first();
  if(!current)throw bad('Notification policy not found',404);
  const classification=clean(data.classification,40).toUpperCase();
  if(!['PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE'].includes(classification))throw bad('Invalid notification classification');
  const purposeCode=clean(data.purposeCode,80);
  if(!await env.DB.prepare(`SELECT code FROM processing_purposes WHERE code=? AND active=1 LIMIT 1`).bind(purposeCode).first())throw bad('Notification purpose is not configured',422);
  const retentionCode=nullable(data.retentionPolicyCode,100);
  if(retentionCode&&!await env.DB.prepare(`SELECT code FROM retention_policies WHERE code=? AND active=1 LIMIT 1`).bind(retentionCode).first())throw bad('Retention policy is not configured',422);
  const roles=Array.from(new Set((Array.isArray(data.allowedRecipientRoles)?data.allowedRecipientRoles:[]).map(String).filter(x=>['admin','driver','executor'].includes(x))));
  if(!roles.length)throw bad('At least one recipient role is required');
  const maxTitle=Math.max(40,Math.min(240,Number(data.maxTitleLength)||160));
  const maxBody=Math.max(80,Math.min(2000,Number(data.maxBodyLength)||600));
  await env.DB.prepare(`UPDATE notification_policy_registry SET purpose_code=?,classification=?,retention_policy_code=?,allowed_recipient_roles=?,max_title_length=?,max_body_length=?,minimize=?,audit_required=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(purposeCode,classification,retentionCode,JSON.stringify(roles),maxTitle,maxBody,data.minimize===false?0:1,data.auditRequired===false?0:1,clean(data.version,40)||current.version,policyId).run();
  await auditAdminControl(env,{actor,action:'admin.notification-policy.updated',resourceType:'notification_policy',resourceId:policyId,targetCompanyId:current.company_id||null,requestId,metadata:{notificationType:current.notification_type,purposeCode,classification,retentionCode,roles}});
  return (await getNotificationGovernance(env)).policies.find(x=>x.id===policyId)||null;
}
export async function getAnalyticsGovernance(env){
  const rows=await env.DB.prepare(`SELECT ap.id,ap.company_id,ap.country_code,ap.purpose_code,ap.classification,ap.retention_policy_code,ap.allowed_metric_codes,ap.aggregation_required,ap.minimize,ap.pseudonymize,ap.export_allowed,ap.audit_required,ap.version,ap.active,rp.retention_days,rp.action_after_expiry FROM analytics_policy_registry ap LEFT JOIN retention_policies rp ON rp.code=ap.retention_policy_code AND rp.active=1 ORDER BY ap.active DESC,ap.country_code,ap.company_id,ap.id DESC`).all();
  return {policies:(rows.results||[]).map(r=>({...r,id:Number(r.id),company_id:r.company_id===null?null:Number(r.company_id),allowed_metric_codes:parseJsonArray(r.allowed_metric_codes),aggregation_required:Boolean(Number(r.aggregation_required)),minimize:Boolean(Number(r.minimize)),pseudonymize:Boolean(Number(r.pseudonymize)),export_allowed:Boolean(Number(r.export_allowed)),audit_required:Boolean(Number(r.audit_required)),active:Boolean(Number(r.active))}))};
}
export async function updateAnalyticsPolicy(env,actor,id,data,requestId){
  const policyId=Number(id||0);if(!policyId)throw bad('Analytics policy id is required');
  const current=await env.DB.prepare(`SELECT * FROM analytics_policy_registry WHERE id=? LIMIT 1`).bind(policyId).first();if(!current)throw bad('Analytics policy not found',404);
  const classification=clean(data.classification,40).toUpperCase();if(!['PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE'].includes(classification))throw bad('Invalid analytics classification');
  const purposeCode=clean(data.purposeCode,80);if(!await env.DB.prepare(`SELECT code FROM processing_purposes WHERE code=? AND active=1 LIMIT 1`).bind(purposeCode).first())throw bad('Analytics purpose is not configured',422);
  const retentionCode=nullable(data.retentionPolicyCode,100);if(retentionCode&&!await env.DB.prepare(`SELECT code FROM retention_policies WHERE code=? AND active=1 LIMIT 1`).bind(retentionCode).first())throw bad('Retention policy is not configured',422);
  const metrics=Array.from(new Set((Array.isArray(data.allowedMetricCodes)?data.allowedMetricCodes:[]).map(String).filter(Boolean))).slice(0,40);if(!metrics.length)throw bad('At least one analytics metric is required');
  await env.DB.prepare(`UPDATE analytics_policy_registry SET purpose_code=?,classification=?,retention_policy_code=?,allowed_metric_codes=?,aggregation_required=?,minimize=?,pseudonymize=?,export_allowed=?,audit_required=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(purposeCode,classification,retentionCode,JSON.stringify(metrics),data.aggregationRequired===false?0:1,data.minimize===false?0:1,data.pseudonymize===false?0:1,data.exportAllowed===true?1:0,data.auditRequired===false?0:1,clean(data.version,40)||current.version,policyId).run();
  await auditAdminControl(env,{actor,action:'admin.analytics-policy.updated',resourceType:'analytics_policy',resourceId:policyId,targetCompanyId:current.company_id||null,requestId,metadata:{purposeCode,classification,retentionCode,metrics}});
  return (await getAnalyticsGovernance(env)).policies.find(x=>x.id===policyId)||null;
}
export async function getExternalProviderGovernance(env){
 const providers=(await env.DB.prepare(`SELECT id,code,name,provider_type,endpoint,country_code,jurisdiction_code,region_code,residency_mode,transfer_mechanism,contract_status,active,version,updated_at FROM external_provider_registry ORDER BY active DESC,code`).all()).results||[];
 const policies=(await env.DB.prepare(`SELECT p.id,p.provider_code,p.company_id,p.country_code,p.purpose_code,p.classification,p.allowed_data_fields,p.retention_policy_code,p.transfer_policy,p.authorization_scope,p.audit_required,p.minimize,p.version,p.active,p.effective_at,r.retention_days,r.action_after_expiry,r.legal_hold_allowed FROM external_provider_policies p LEFT JOIN retention_policies r ON r.code=p.retention_policy_code AND r.active=1 ORDER BY p.active DESC,p.provider_code,p.company_id,p.country_code,p.effective_at DESC,p.id DESC`).all()).results||[];
 const audits=(await env.DB.prepare(`SELECT id,event_id,provider_code,company_id,country_code,purpose_code,classification,authorization_scope,decision,operation,data_fields,transfer_policy,policy_version,request_id,created_at FROM external_provider_audit_events ORDER BY id DESC LIMIT 50`).all()).results||[];
 const parse=v=>{try{const x=JSON.parse(String(v||'[]'));return Array.isArray(x)?x.map(String):[]}catch{return[]}};
 return {providers,policies:policies.map(x=>({...x,id:Number(x.id),company_id:x.company_id==null?null:Number(x.company_id),allowed_data_fields:parse(x.allowed_data_fields),audit_required:Boolean(Number(x.audit_required)),minimize:Boolean(Number(x.minimize)),active:Boolean(Number(x.active))})),audits:audits.map(x=>({...x,id:Number(x.id),company_id:x.company_id==null?null:Number(x.company_id),data_fields:parse(x.data_fields)}))};
}
export async function updateExternalProviderPolicy(env,actor,id,data,requestId){
 const policyId=Number(id||0);if(!policyId)throw bad('External provider policy id is required');const current=await env.DB.prepare(`SELECT * FROM external_provider_policies WHERE id=? LIMIT 1`).bind(policyId).first();if(!current)throw bad('External provider policy not found',404);
 const purpose=clean(data.purposeCode,120);if(!await env.DB.prepare(`SELECT code FROM processing_purposes WHERE code=? AND active=1 LIMIT 1`).bind(purpose).first())throw bad('Processing purpose is not configured',422);
 const classification=clean(data.classification,40).toUpperCase();if(!['PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE'].includes(classification))throw bad('Invalid provider classification');
 const retention=nullable(data.retentionPolicyCode,100);if(retention&&!await env.DB.prepare(`SELECT code FROM retention_policies WHERE code=? AND active=1 LIMIT 1`).bind(retention).first())throw bad('Retention policy is not configured',422);
 const fields=Array.from(new Set((Array.isArray(data.allowedDataFields)?data.allowedDataFields:[]).map(String).filter(Boolean))).slice(0,100);if(!fields.length)throw bad('At least one allowed data field is required');
 const transfer=['same_jurisdiction','adequacy','safeguards','approved_transfer','none'].includes(data.transferPolicy)?data.transferPolicy:current.transfer_policy;const scope=clean(data.authorizationScope,100)||current.authorization_scope;
 await env.DB.prepare(`UPDATE external_provider_policies SET purpose_code=?,classification=?,allowed_data_fields=?,retention_policy_code=?,transfer_policy=?,authorization_scope=?,audit_required=?,minimize=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(purpose,classification,JSON.stringify(fields),retention,transfer,scope,data.auditRequired===false?0:1,data.minimize===false?0:1,clean(data.version,40)||current.version,policyId).run();
 await auditAdminControl(env,{actor,action:'admin.external-provider-policy.updated',resourceType:'external_provider_policy',resourceId:policyId,targetCompanyId:current.company_id||null,requestId,metadata:{providerCode:current.provider_code,purpose,classification,retention,transfer,scope,fieldCount:fields.length}});return (await getExternalProviderGovernance(env)).policies.find(x=>x.id===policyId)||null;
}
