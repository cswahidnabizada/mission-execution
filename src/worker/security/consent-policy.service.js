/* ON Mission canonical consent policy authority.
 * Consent policy state belongs below the Control Plane; admin routes orchestrate it.
 */
import {auditAdminControl} from './admin-control-audit.service.js';
const clean=(v,max=500)=>String(v??'').trim().slice(0,max);
const bad=(message,status=400,code=message)=>Object.assign(new Error(message),{status,code});

export async function listConsentPolicies(env){
 const rows=await env.DB.prepare(`
    SELECT cp.id,cp.company_id,cp.country_code,cp.purpose_code,cp.policy_version,cp.title,
           cp.policy_text,cp.require_consent,cp.withdrawal_effect,cp.effective_at,cp.superseded_at,
           cp.active,p.label purpose_label,p.default_legal_basis
    FROM consent_policy_versions cp
    JOIN processing_purposes p ON p.code=cp.purpose_code
    ORDER BY cp.active DESC,cp.country_code,cp.company_id,p.code,cp.effective_at DESC,cp.id DESC
    LIMIT 250`).all();
 return (rows.results||[]).map(r=>({...r,id:Number(r.id),company_id:r.company_id===null?null:Number(r.company_id),require_consent:Number(r.require_consent)===1,active:Number(r.active)===1}));
}

export async function upsertConsentPolicy(env,actor,data,requestId){
 const companyId=data.companyId===null||data.companyId===undefined||data.companyId===''?null:Number(data.companyId);
 const countryCode=clean(data.countryCode,2).toUpperCase()||'ZZ';
 const purposeCode=clean(data.purposeCode,120);
 const policyVersion=clean(data.policyVersion,40)||'1';
 const title=clean(data.title,240);
 const policyText=clean(data.policyText,5000);
 const withdrawalEffect=clean(data.withdrawalEffect,60)||'restrict_future_processing';
 const requireConsent=Boolean(data.requireConsent);
 if(companyId!==null&&(!Number.isInteger(companyId)||companyId<=0))throw bad('Valid company id is required',400);
 if(!/^[A-Z]{2}$/.test(countryCode)&&countryCode!=='ZZ')throw bad('Valid ISO country code is required',400);
 if(!purposeCode||!title||!policyText)throw bad('Purpose, title and policy text are required',400);
 if(!['restrict_future_processing','review','none'].includes(withdrawalEffect))throw bad('Invalid withdrawal effect',400);
 if(!await env.DB.prepare(`SELECT code FROM processing_purposes WHERE code=? AND active=1 LIMIT 1`).bind(purposeCode).first())throw bad('Processing purpose is not configured',422);
 if(countryCode!=='ZZ'&&!await env.DB.prepare(`SELECT code FROM country_catalog WHERE code=? AND active=1 LIMIT 1`).bind(countryCode).first())throw bad('Country is not configured',422);
 if(companyId!==null&&!await env.DB.prepare(`SELECT id FROM companies WHERE id=? AND deletion_status='active' LIMIT 1`).bind(companyId).first())throw bad('Active company not found',404);
 await env.DB.prepare(`UPDATE consent_policy_versions SET active=0,superseded_at=COALESCE(superseded_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE active=1 AND purpose_code=? AND ((company_id IS NULL AND ? IS NULL) OR company_id=?) AND country_code=?`).bind(purposeCode,companyId,companyId,countryCode).run();
 const r=await env.DB.prepare(`INSERT INTO consent_policy_versions(company_id,country_code,purpose_code,policy_version,title,policy_text,require_consent,withdrawal_effect,created_by_role) VALUES(?,?,?,?,?,?,?,?,?)`).bind(companyId,countryCode,purposeCode,policyVersion,title,policyText,requireConsent?1:0,withdrawalEffect,'platform_administrator').run();
 const id=Number(r.meta.last_row_id);
 await auditAdminControl(env,{actor,action:'admin.consent_policy.published',resourceType:'consent_policy',resourceId:id,targetCompanyId:companyId,requestId,metadata:{countryCode,purposeCode,policyVersion,requireConsent,withdrawalEffect}});
 return (await listConsentPolicies(env)).find(x=>x.id===id)||{id};
}
