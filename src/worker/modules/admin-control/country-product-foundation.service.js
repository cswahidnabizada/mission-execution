import {RELEASE_VERSION} from '../../core/release.js';

const NOTIFICATION_TYPES=['mission_assigned','mission_updated','mission_status','mission_exception','deadline_soon','tenant_message','direct_tenant_message','participant_message'];
const PURPOSES=['operational_communications','mission_execution','security_audit','account_management','billing'];
const DEFAULT_RETENTION={operational_communications:365,mission_execution:3650,security_audit:2555,account_management:3650,billing:2555};
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const country=(v)=>{const c=clean(v,2).toUpperCase();if(!/^[A-Z]{2}$/.test(c)||c==='ZZ')throw Object.assign(new Error('A valid ISO country code is required'),{status:400,code:'COUNTRY_CODE_INVALID'});return c;};
const fail=(m,s=400,c)=>Object.assign(new Error(m),{status:s,code:c});
const json=v=>{if(v===null||v===undefined||v==='')return {};if(typeof v==='object')return v;try{return JSON.parse(String(v))||{}}catch{throw fail('Invoice requirements must contain valid JSON.',400,'FOUNDATION_INVOICE_JSON_INVALID')}};
const bits=v=>v===true||v===1||v==='1'?1:0;

export async function getCountryProductFoundation(env,countryCode){
 const cc=country(countryCode);
 const [c,j,r,b,ret,notify,storage,providers]=await Promise.all([
  env.DB.prepare(`SELECT code,name,active,requires_review,default_subscription_class FROM platform_product_country_catalog WHERE code=? LIMIT 1`).bind(cc).first(),
  env.DB.prepare(`SELECT * FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC,code DESC LIMIT 1`).bind(cc).first(),
  env.DB.prepare(`SELECT * FROM residency_policies r WHERE r.active=1 AND r.jurisdiction_code=(SELECT code FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC,code DESC LIMIT 1) ORDER BY r.version DESC LIMIT 1`).bind(cc).first(),
  env.DB.prepare(`SELECT * FROM billing_jurisdiction_policies WHERE country_code=? AND active=1 AND status='active' ORDER BY id DESC LIMIT 1`).bind(cc).first(),
  env.DB.prepare(`SELECT * FROM retention_policies WHERE jurisdiction_code=(SELECT code FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC,code DESC LIMIT 1) AND active=1 ORDER BY purpose_code,version DESC`).bind(cc).all(),
  env.DB.prepare(`SELECT notification_type,provider_code,purpose_code,classification,retention_policy_code,version,active FROM notification_policy_registry WHERE country_code=? AND active=1 ORDER BY notification_type,id DESC`).bind(cc).all(),
  env.DB.prepare(`SELECT e.code,e.name,e.provider_type,e.country_code,e.jurisdiction_code,e.region_code,e.residency_mode,e.contract_status,e.active,p.id policy_id,p.purpose_code,p.authorization_scope,p.active policy_active FROM external_provider_registry e LEFT JOIN external_provider_policies p ON p.provider_code=e.code AND p.country_code=? AND p.active=1 AND p.purpose_code='mission_execution' WHERE e.provider_type='storage' AND e.active=1 ORDER BY e.code`).bind(cc).all(),
  env.DB.prepare(`SELECT code,name,provider_type,country_code,jurisdiction_code,region_code,residency_mode,contract_status,active FROM external_provider_registry WHERE active=1 AND contract_status IN ('approved','configured') ORDER BY provider_type,code`).all()
 ]);
 const notifications=notify.results||[];const retained=ret.results||[];const storageRows=storage.results||[];const providerRows=providers.results||[];
 const missingNotifications=NOTIFICATION_TYPES.filter(t=>!notifications.some(x=>x.notification_type===t));
 const activeStorage= r?.primary_provider ? storageRows.find(x=>x.code===r.primary_provider&&Number(x.policy_active||0)===1) : null;
 const billingProvider=b?.provider_code?providerRows.find(x=>x.code===b.provider_code):null;
 const missingPurposes=PURPOSES.filter(p=>!retained.some(x=>x.purpose_code===p));
 const blockers=[];
 if(!c)blockers.push({code:'COUNTRY_NOT_FOUND',message:'Country is not in the canonical country catalog.'});
 if(!j)blockers.push({code:'JURISDICTION_NOT_CONFIGURED',message:'An active jurisdiction policy is required.'});
 if(!r)blockers.push({code:'RESIDENCY_NOT_CONFIGURED',message:'An active residency policy is required.'});
 if(missingPurposes.length)blockers.push({code:'RETENTION_POLICIES_MISSING',message:`Retention policies are missing for: ${missingPurposes.join(', ')}.`});
 if(!b||!billingProvider)blockers.push({code:'BILLING_FOUNDATION_NOT_CONFIGURED',message:'A country billing policy and configured payment provider are required.'});
 if(missingNotifications.length)blockers.push({code:'NOTIFICATION_POLICIES_MISSING',message:`Notification policies are missing for: ${missingNotifications.join(', ')}.`});
 if(!activeStorage)blockers.push({code:'STORAGE_FOUNDATION_NOT_CONFIGURED',message:'Mission file storage is not provisioned for this country. Configure a real approved storage provider and policy before publishing.'});
 return {version:RELEASE_VERSION,country:c||null,jurisdiction:j||null,residency:r||null,billing:b||null,retention:retained,notifications,storage:storageRows,providers:providerRows,ready:blockers.length===0,blockers};
}

export async function saveCountryProductFoundation(env,actor,input={},requestId=''){
 const cc=country(input.countryCode);
 const c=await env.DB.prepare(`SELECT code,name,active FROM platform_product_country_catalog WHERE code=? LIMIT 1`).bind(cc).first();
 if(!c)throw fail('Country does not exist.',404,'COUNTRY_NOT_FOUND');
 const activeLaunch=await env.DB.prepare(`SELECT id,version FROM country_product_launches WHERE country_code=? AND status='active' AND active=1 LIMIT 1`).bind(cc).first();
 if(activeLaunch)throw fail('The country already has an active product. Foundation policy changes must be versioned through a future governed release.',409,'COUNTRY_FOUNDATION_LOCKED');
 const framework=clean(input.frameworkCode,120);if(!framework)throw fail('Framework code is required.',400,'FOUNDATION_FRAMEWORK_REQUIRED');
 const region=clean(input.regionCode,120)||null;
 const residencyMode=['required','preferred','policy'].includes(input.residencyMode)?input.residencyMode:'required';
 const primaryRegion=clean(input.primaryRegion,120);if(!primaryRegion)throw fail('Primary data region is required.',400,'FOUNDATION_REGION_REQUIRED');
 const primaryProvider=clean(input.primaryProvider,120);if(!primaryProvider)throw fail('Primary storage provider code is required.',400,'FOUNDATION_STORAGE_PROVIDER_REQUIRED');
 const provider=await env.DB.prepare(`SELECT code,provider_type,country_code,jurisdiction_code,region_code,residency_mode,contract_status,active FROM external_provider_registry WHERE code=? LIMIT 1`).bind(primaryProvider).first();
 if(!provider||String(provider.provider_type)!=='storage'||Number(provider.active)!==1||!['approved','configured'].includes(String(provider.contract_status)))throw fail('Selected storage provider is not active, configured and approved.',422,'FOUNDATION_STORAGE_PROVIDER_UNAVAILABLE');
 if(String(provider.country_code||'ZZ')!=='ZZ'&&String(provider.country_code)!==cc)throw fail('Selected storage provider is governed for a different country.',422,'FOUNDATION_STORAGE_PROVIDER_COUNTRY_MISMATCH');
 if(String(provider.residency_mode)==='required' && provider.region_code && String(provider.region_code)!==primaryRegion)throw fail('Selected storage provider does not match the required primary region.',422,'FOUNDATION_STORAGE_PROVIDER_REGION_MISMATCH');
 const billingProvider=clean(input.billingProviderCode||'stripe',120);
 const bp=await env.DB.prepare(`SELECT code,provider_type,active,contract_status FROM external_provider_registry WHERE code=? LIMIT 1`).bind(billingProvider).first();
 if(!bp||String(bp.provider_type)!=='payment'||Number(bp.active)!==1||!['approved','configured'].includes(String(bp.contract_status)))throw fail('Selected billing provider is not active/configured.',422,'FOUNDATION_BILLING_PROVIDER_UNAVAILABLE');
 const currency=clean(input.currency,12).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw fail('Currency must be a 3-letter ISO code.',400,'FOUNDATION_CURRENCY_INVALID');
 const tax=clean(input.taxConfigurationCode,160);if(!tax)throw fail('Tax configuration code is required.',400,'FOUNDATION_TAX_CONFIGURATION_REQUIRED');
 const invoice=json(input.invoiceRequirements||{});
 const retentionInput=typeof input.retention==='object'&&input.retention?input.retention:{};
 const retentionRows=[];
 for(const purpose of PURPOSES){
  const raw=retentionInput[purpose];const days=raw?.retentionDays===null?null:Number(raw?.retentionDays??DEFAULT_RETENTION[purpose]);
  if(days!==null&&(!Number.isInteger(days)||days<1||days>36500))throw fail(`Invalid retention days for ${purpose}.`,400,'FOUNDATION_RETENTION_INVALID');
  const action=['delete','anonymize','restrict','review'].includes(String(raw?.actionAfterExpiry||'review'))?String(raw?.actionAfterExpiry||'review'):'review';
  retentionRows.push({purpose,days,action,legalHoldAllowed:raw?.legalHoldAllowed!==false});
 }
 const jurisdictionCode=clean(input.jurisdictionCode,160)||`${cc}-ONM-1`;
 const residencyCode=clean(input.residencyCode,160)||`${cc}_PRIMARY`;
 const statements=[];
 statements.push(env.DB.prepare(`INSERT INTO jurisdiction_policies(code,country_code,region_code,framework_code,data_residency_mode,retention_profile,deletion_profile,identity_profile,audit_profile,effective_version,status) VALUES(?,?,?,?,?,?,?,?,?,'1','active') ON CONFLICT(code) DO UPDATE SET region_code=excluded.region_code,framework_code=excluded.framework_code,data_residency_mode=excluded.data_residency_mode,updated_at=CURRENT_TIMESTAMP`).bind(jurisdictionCode,cc,region,framework,residencyMode,clean(input.retentionProfile,120)||'default',clean(input.deletionProfile,120)||'default',clean(input.identityProfile,120)||'default',clean(input.auditProfile,120)||'default'));
 statements.push(env.DB.prepare(`INSERT INTO residency_policies(code,jurisdiction_code,primary_region,primary_provider,mode,fallback_allowed,version,active) VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(code) DO UPDATE SET primary_region=excluded.primary_region,primary_provider=excluded.primary_provider,mode=excluded.mode,fallback_allowed=excluded.fallback_allowed,version=excluded.version,active=1`).bind(residencyCode,jurisdictionCode,primaryRegion,primaryProvider,residencyMode,bits(input.fallbackAllowed),RELEASE_VERSION));
 for(const r of retentionRows){const code=`${cc}_${r.purpose.toUpperCase()}_DEFAULT`;statements.push(env.DB.prepare(`INSERT INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version,active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO UPDATE SET retention_days=excluded.retention_days,action_after_expiry=excluded.action_after_expiry,legal_hold_allowed=excluded.legal_hold_allowed,version=excluded.version,active=1`).bind(code,r.purpose,jurisdictionCode,'general',r.days,r.action,r.legalHoldAllowed?1:0,RELEASE_VERSION));}
 statements.push(env.DB.prepare(`INSERT INTO billing_jurisdiction_policies(country_code,jurisdiction_code,currency,tax_configuration_code,invoice_requirements_json,provider_code,status,version,active) VALUES(?,?,?,?,?,?,?,'${RELEASE_VERSION}',1) ON CONFLICT(country_code,jurisdiction_code,version) DO UPDATE SET currency=excluded.currency,tax_configuration_code=excluded.tax_configuration_code,invoice_requirements_json=excluded.invoice_requirements_json,provider_code=excluded.provider_code,status='active',active=1`).bind(cc,jurisdictionCode,currency,tax,JSON.stringify(invoice),billingProvider,'active'));
 for(const type of NOTIFICATION_TYPES){const defaults=type==='mission_exception'?'CONFIDENTIAL':type==='tenant_message'||type==='direct_tenant_message'||type==='participant_message'?'CONFIDENTIAL':'INTERNAL';const purpose=['tenant_message','direct_tenant_message','participant_message'].includes(type)?'operational_communications':'mission_execution';const retentionCode=`${cc}_${purpose.toUpperCase()}_DEFAULT`;statements.push(env.DB.prepare(`INSERT INTO notification_policy_registry(notification_type,company_id,country_code,purpose_code,classification,provider_code,retention_policy_code,allowed_recipient_roles,max_title_length,max_body_length,minimize,audit_required,version,active) SELECT ?,NULL,?,?,?,?,?, '["admin","driver","executor"]',160,2000,1,1,?,1 WHERE NOT EXISTS (SELECT 1 FROM notification_policy_registry WHERE notification_type=? AND company_id IS NULL AND country_code=? AND version=? AND active=1)`).bind(type,cc,purpose,defaults,'in_app',retentionCode,RELEASE_VERSION,type,cc,RELEASE_VERSION));}
 for(const purpose of ['operational_communications','mission_execution'])statements.push(env.DB.prepare(`INSERT INTO external_provider_policies(provider_code,company_id,country_code,purpose_code,classification,allowed_data_fields,retention_policy_code,transfer_policy,authorization_scope,audit_required,minimize,version,active) SELECT 'in_app',NULL,?,?,?,?,?,?,?,?,?,?,1 WHERE NOT EXISTS (SELECT 1 FROM external_provider_policies WHERE provider_code='in_app' AND company_id IS NULL AND country_code=? AND purpose_code=? AND version=? AND active=1)`).bind(cc,purpose,'INTERNAL','["notification_type","title","body","recipient_role","mission_id"]',`${cc}_${purpose.toUpperCase()}_DEFAULT`,'none','notification_delivery',1,1,RELEASE_VERSION,cc,purpose,RELEASE_VERSION));
 await env.DB.batch(statements);
 return getCountryProductFoundation(env,cc);
}
