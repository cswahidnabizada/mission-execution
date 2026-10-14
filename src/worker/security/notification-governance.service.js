import {canonicalFirst} from '../core/canonical-db.js';
import {resolveExternalProviderGovernance} from './external-provider-governance.service.js';
/**
 * ON Mission 10.35.5 — Canonical Notification Data Governance.
 * Notifications are governed data, not a free-form messaging side channel.
 * Runtime resolves policy from notification type + canonical company context.
 */

const DEFAULT_VERSION = '1';
const DEFAULT_PROVIDER = 'in_app';
const DEFAULT_CLASSIFICATION = 'INTERNAL';
const DEFAULT_PURPOSE = 'operational_communications';
const ALLOWED_CLASSIFICATIONS = new Set(['PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE']);
const ALLOWED_PURPOSES = new Set(['operational_communications','mission_execution','security_audit','account_management','billing']);
const ALLOWED_ROLES = new Set(['admin','driver','executor']);

const TYPE_DEFAULTS = Object.freeze({
  mission_assigned: {purposeCode:'mission_execution', classification:'INTERNAL'},
  mission_updated: {purposeCode:'mission_execution', classification:'INTERNAL'},
  mission_status: {purposeCode:'mission_execution', classification:'INTERNAL'},
  mission_exception: {purposeCode:'mission_execution', classification:'CONFIDENTIAL'},
  deadline_soon: {purposeCode:'mission_execution', classification:'INTERNAL'},
  tenant_message: {purposeCode:'operational_communications', classification:'CONFIDENTIAL'},
  direct_tenant_message: {purposeCode:'operational_communications', classification:'CONFIDENTIAL'},
  participant_message: {purposeCode:'operational_communications', classification:'CONFIDENTIAL'}
});

export function notificationPolicyDefaults(type){
  const d=TYPE_DEFAULTS[String(type||'')]||{purposeCode:DEFAULT_PURPOSE,classification:DEFAULT_CLASSIFICATION};
  return {purposeCode:d.purposeCode,classification:d.classification,providerCode:DEFAULT_PROVIDER,retentionPolicyCode:null,maxTitleLength:160,maxBodyLength:600,allowedRecipientRoles:['admin','driver','executor'],minimize:true,version:DEFAULT_VERSION};
}

export async function resolveNotificationGovernance(env,{type,controllerCompanyId,recipientRole}={}){
  const normalizedType=String(type||'').trim().slice(0,80);
  const defaults=notificationPolicyDefaults(normalizedType);
  let company=null;
  const companyId=Number(controllerCompanyId||0);
  if(companyId){
    company=await canonicalFirst(env,`SELECT c.id,c.deletion_status,cmp.country_code,cmp.sector_code,cmp.compliance_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.id=? LIMIT 1`,[companyId],'notification_governance');
  }
  if(company?.deletion_status && company.deletion_status!=='active') throw new Error('NOTIFICATION_COMPANY_INACTIVE');
  const countryCode=String(company?.country_code||'').toUpperCase();
  if(!/^[A-Z]{2}$/.test(countryCode)||countryCode==='ZZ') throw Object.assign(new Error('NOTIFICATION_COUNTRY_UNRESOLVED'),{status:409,code:'NOTIFICATION_COUNTRY_UNRESOLVED'});
  const policy=await canonicalFirst(env,`
    SELECT np.*, rp.retention_days, rp.action_after_expiry, rp.legal_hold_allowed
    FROM notification_policy_registry np
    LEFT JOIN retention_policies rp ON rp.code=np.retention_policy_code AND rp.active=1
    WHERE np.notification_type=? AND np.active=1
      AND (np.company_id=? OR np.company_id IS NULL)
      AND (np.country_code=? OR np.country_code='ZZ')
    ORDER BY CASE WHEN np.company_id=? THEN 0 ELSE 1 END,
             CASE WHEN np.country_code=? THEN 0 ELSE 1 END,
             np.effective_at DESC, np.id DESC
    LIMIT 1
  `,[normalizedType,companyId||null,countryCode,companyId||null,countryCode],'notification_governance');
  const fallbackRetention=policy?.retention_policy_code?null:await canonicalFirst(env,`SELECT code,retention_days,action_after_expiry,legal_hold_allowed FROM retention_policies WHERE purpose_code=? AND jurisdiction_code=(SELECT code FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC LIMIT 1) AND sector_code='general' AND active=1 ORDER BY version DESC LIMIT 1`,[policy?.purpose_code||defaults.purposeCode,countryCode],'notification_governance');
  if(!policy) throw Object.assign(new Error('NOTIFICATION_POLICY_NOT_CONFIGURED'),{status:503,code:'NOTIFICATION_POLICY_NOT_CONFIGURED'});
  if(!policy.retention_policy_code && !fallbackRetention) throw Object.assign(new Error('NOTIFICATION_RETENTION_POLICY_NOT_CONFIGURED'),{status:503,code:'NOTIFICATION_RETENTION_POLICY_NOT_CONFIGURED'});
  const resolved={
    policyId:policy?.id?Number(policy.id):null,
    notificationType:normalizedType,
    companyId:companyId||null,
    countryCode,
    purposeCode:policy?.purpose_code||defaults.purposeCode,
    classification:policy?.classification||defaults.classification,
    providerCode:policy?.provider_code||defaults.providerCode,
    retentionPolicyCode:policy?.retention_policy_code||fallbackRetention?.code||defaults.retentionPolicyCode,
    retentionDays:policy?.retention_days!=null?Number(policy.retention_days):fallbackRetention?.retention_days==null?null:Number(fallbackRetention.retention_days),
    retentionAction:policy?.action_after_expiry||fallbackRetention?.action_after_expiry||null,
    legalHoldAllowed:policy?.legal_hold_allowed!=null?Boolean(Number(policy.legal_hold_allowed)):fallbackRetention?.legal_hold_allowed==null?true:Boolean(Number(fallbackRetention.legal_hold_allowed)),
    allowedRecipientRoles:parseRoles(policy?.allowed_recipient_roles,defaults.allowedRecipientRoles),
    maxTitleLength:clamp(policy?.max_title_length,defaults.maxTitleLength,40,240),
    maxBodyLength:clamp(policy?.max_body_length,defaults.maxBodyLength,80,2000),
    minimize:policy?Boolean(Number(policy.minimize)):defaults.minimize,
    auditRequired:policy?Boolean(Number(policy.audit_required)):true,
    version:policy?.version||defaults.version,
    configured:Boolean(policy)
  };
  if(!ALLOWED_ROLES.has(String(recipientRole||''))) throw new Error('NOTIFICATION_RECIPIENT_INVALID');
  if(!resolved.allowedRecipientRoles.includes(String(recipientRole))) throw new Error('NOTIFICATION_RECIPIENT_NOT_ALLOWED');
  if(!ALLOWED_CLASSIFICATIONS.has(resolved.classification)) throw new Error('NOTIFICATION_CLASSIFICATION_INVALID');
  if(!ALLOWED_PURPOSES.has(resolved.purposeCode)) throw new Error('NOTIFICATION_PURPOSE_INVALID');
  const providerGovernance=await resolveExternalProviderGovernance(env,{providerCode:resolved.providerCode,companyId:companyId||null,countryCode,purposeCode:resolved.purposeCode,classification:resolved.classification,dataFields:['notification_type','title','body','recipient_role','mission_id'],authorizationScope:'notification_delivery',authorizationGranted:true,operation:'notification_delivery'});
  return Object.freeze({...resolved,providerGovernance});
}

export function minimizeNotificationText(value,maxLength){
  let text=String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/\b(password|passwd|secret|authorization|bearer|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*[^\s,;]+/gi,'[redacted]')
    .replace(/\s+/g,' ').trim();
  if(text.length>maxLength)text=`${text.slice(0,Math.max(0,maxLength-1)).trim()}…`;
  return text;
}

function parseRoles(value,fallback){
  try{
    const roles=JSON.parse(String(value||''));
    const valid=Array.isArray(roles)?roles.map(String).filter(x=>ALLOWED_ROLES.has(x)):[];
    return valid.length?Array.from(new Set(valid)):fallback;
  }catch{return fallback;}
}
function clamp(value,fallback,min,max){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;}
