import {audit} from './audit.js';
import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';

const FIELDS=new Set(['email','phone','address','country','company','identity','restriction','billing','profile']);
const normalizeFields=v=>[...new Set((Array.isArray(v)?v:String(v||'').split(',')).map(x=>String(x||'').trim().toLowerCase()).filter(x=>FIELDS.has(x)))];
const safeId=v=>Number(v||0)||0;

export async function searchActivationUsers(env,query){
  const q=String(query||'').trim();if(q.length<2)throw bad('Enter at least 2 characters');
  const like=`%${q.replace(/[%_]/g,'') }%`;
  const tenants=(await env.DB.prepare(`SELECT ai.id identity_id,ai.role,ai.company_id tenant_id,ai.email,ai.display_name,ai.active,c.name company_name,COALESCE(cvs.country_code,vp.verified_country_code,vp.declared_country_code,vp.country_code) country_code FROM auth_identities ai LEFT JOIN companies c ON c.id=ai.company_id LEFT JOIN company_verification_status cvs ON cvs.company_id=ai.company_id LEFT JOIN verification_profiles vp ON vp.identity_type='tenant' AND vp.identity_id=ai.company_id WHERE ai.role='admin' AND (lower(ai.email) LIKE lower(?) OR lower(ai.display_name) LIKE lower(?) OR lower(c.name) LIKE lower(?) OR CAST(ai.id AS TEXT)=?) ORDER BY ai.id DESC LIMIT 20`).bind(like,like,like,q).all()).results||[];
  const people=(await env.DB.prepare(`SELECT ai.id identity_id,d.id actor_id,'driver' role,ai.company_id tenant_id,ai.email,COALESCE(ai.display_name,d.name) display_name,ai.active,c.name company_name,COALESCE(cvs.country_code,vp.verified_country_code,vp.declared_country_code,vp.country_code) country_code FROM auth_identities ai JOIN drivers d ON d.id=ai.driver_id AND d.company_id=ai.company_id LEFT JOIN companies c ON c.id=ai.company_id LEFT JOIN company_verification_status cvs ON cvs.company_id=ai.company_id LEFT JOIN verification_profiles vp ON vp.identity_type='driver' AND vp.identity_id=d.id WHERE ai.role='driver' AND (lower(ai.email) LIKE lower(?) OR lower(ai.display_name) LIKE lower(?) OR lower(d.name) LIKE lower(?) OR lower(c.name) LIKE lower(?) OR CAST(ai.id AS TEXT)=?) ORDER BY ai.id DESC LIMIT 20`).bind(like,like,like,like,q).all()).results||[];
  const executors=(await env.DB.prepare(`SELECT pei.id identity_id,'executor' role,NULL tenant_id,pei.email,pei.display_name,pei.active,p.registered_company_name company_name,p.country_code FROM public_executor_identities pei LEFT JOIN public_executor_profiles p ON p.executor_id=pei.id WHERE lower(pei.email) LIKE lower(?) OR lower(pei.display_name) LIKE lower(?) OR lower(p.registered_company_name) LIKE lower(?) OR CAST(pei.id AS TEXT)=? ORDER BY pei.id DESC LIMIT 20`).bind(like,like,like,q).all()).results||[];
  return [...tenants,...people,...executors].slice(0,30).map(r=>({identityType:r.role==='admin'?'tenant':r.role,identityId:safeId(r.role==='executor'?r.identity_id:r.role==='driver'?r.actor_id:r.tenant_id),authIdentityId:safeId(r.identity_id),tenantId:safeId(r.tenant_id),role:r.role,email:r.email||null,displayName:r.display_name||null,companyName:r.company_name||null,countryCode:r.country_code||null,active:Number(r.active)===1}));
}

export async function createActivationReviewRequest(env,administrator,{identityType,identityId,tenantId,fields,message}){
  const type=String(identityType||'').toLowerCase();const id=safeId(identityId);const requested=normalizeFields(fields);const text=String(message||'').trim().slice(0,1200);
  if(!['tenant','driver','executor'].includes(type)||!id)throw bad('A valid user is required');
  if(!requested.length)throw bad('Select at least one detail to update');
  if(!text)throw bad('Platform administration message is required');
  const target=await targetExists(env,type,id,tenantId);if(!target)throw notFound('User not found');
  const r=await env.DB.prepare(`INSERT INTO activation_review_requests(identity_type,identity_id,tenant_id,requested_fields,reviewer_message,status,created_at,updated_at) VALUES(?,?,?,?,?,'open',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(type,id,target.tenantId||null,JSON.stringify(requested),text).run();
  const idNew=Number(r.meta?.last_row_id||0);
  await audit(env,{session:administrator,action:'platform.activation.review_request',resourceType:'activation_review_request',resourceId:idNew,metadata:{identityType:type,identityId:id,fields:requested}});
  return {requestId:idNew,identityType:type,identityId:id,requestedFields:requested,status:'open'};
}

export async function listOpenActivationRequests(env,session){
  const type=session?.role==='admin'?'tenant':session?.role;const id=session?.role==='admin'?safeId(session.tenantId):session?.role==='driver'?safeId(session.driverId):safeId(session.executorId);
  if(!type||!id)return [];
  const r=await env.DB.prepare(`SELECT id,requested_fields,reviewer_message,status,user_completed_at,created_at,updated_at FROM activation_review_requests WHERE identity_type=? AND identity_id=? AND status='open' ORDER BY id DESC LIMIT 20`).bind(type,id).all();
  return (r.results||[]).map(x=>({id:Number(x.id),fields:parse(x.requested_fields),message:x.reviewer_message,status:x.status,userCompletedAt:x.user_completed_at||null,createdAt:x.created_at,updatedAt:x.updated_at}));
}

export async function completeActivationRequestsForFields(env,session,changedFields){
  const type=session?.role==='admin'?'tenant':session?.role;const id=session?.role==='admin'?safeId(session.tenantId):session?.role==='driver'?safeId(session.driverId):safeId(session?.executorId);
  const changed=new Set(normalizeFields(changedFields));if(!type||!id||!changed.size)return;
  const rows=(await env.DB.prepare(`SELECT id,requested_fields FROM activation_review_requests WHERE identity_type=? AND identity_id=? AND status='open'`).bind(type,id).all()).results||[];
  for(const row of rows){const fields=parse(row.requested_fields);if(fields.length&&fields.every(f=>changed.has(f)))await env.DB.prepare(`UPDATE activation_review_requests SET user_completed_at=COALESCE(user_completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND identity_type=? AND identity_id=? AND status='open'`).bind(Number(row.id),type,id).run();}
}

export async function reconcileActivationReviewRequests(env,session,situation){
  const type=session?.role==='admin'?'tenant':session?.role;
  const id=type==='tenant'?safeId(session?.tenantId):type==='driver'?safeId(session?.driverId):safeId(session?.executorId);
  if(!type||!id)return;
  const rows=(await env.DB.prepare(`SELECT id,requested_fields FROM activation_review_requests WHERE identity_type=? AND identity_id=? AND status='open'`).bind(type,id).all()).results||[];
  for(const row of rows){
    const fields=parse(row.requested_fields);
    if(fields.length&&fields.every(field=>reviewFieldSatisfied(field,situation)))
      await env.DB.prepare(`UPDATE activation_review_requests SET user_completed_at=COALESCE(user_completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND identity_type=? AND identity_id=? AND status='open'`).bind(Number(row.id),type,id).run();
  }
}

function reviewFieldSatisfied(field,situation){
  if(field==='restriction')return !Array.isArray(situation?.restrictions)||situation.restrictions.length===0;
  if(field==='billing')return ['active','grace'].includes(String(situation?.accessState||''))||situation?.subscriptionClass==='exempt';
  // Profile/identity/country/email/phone/company requests require an explicit
  // user-side change and are completed by completeActivationRequestsForFields.
  // Never auto-complete them merely because the current value already exists.
  return false;
}

export async function platformActivationProfile(env,type,id){
  const target=await targetExists(env,type,id,null);if(!target)throw notFound('User not found');
  let account={};
  if(type==='tenant'){
    account=await canonicalFirst(env,`SELECT ai.id,ai.email,ai.display_name,ai.login,COALESCE(cvs.country_code,vp.verified_country_code,vp.declared_country_code,vp.country_code) country_code,ai.active,ai.company_id,ai.driver_id,c.name company_name FROM auth_identities ai LEFT JOIN companies c ON c.id=ai.company_id LEFT JOIN company_verification_status cvs ON cvs.company_id=ai.company_id LEFT JOIN verification_profiles vp ON vp.identity_type='tenant' AND vp.identity_id=ai.company_id WHERE ai.id=? LIMIT 1`,[Number(target.authIdentityId)],'activation_review')||{};
  }else if(type==='driver'){
    account=await canonicalFirst(env,`SELECT ai.id,ai.email,ai.display_name,ai.login,COALESCE(cvs.country_code,vp.verified_country_code,vp.declared_country_code,vp.country_code) country_code,ai.active,ai.company_id,ai.driver_id,c.name company_name FROM auth_identities ai LEFT JOIN companies c ON c.id=ai.company_id LEFT JOIN company_verification_status cvs ON cvs.company_id=ai.company_id LEFT JOIN verification_profiles vp ON vp.identity_type='driver' AND vp.identity_id=ai.driver_id WHERE ai.id=? LIMIT 1`,[Number(target.authIdentityId)],'activation_review')||{};
  }else{
    account=await canonicalFirst(env,`SELECT pei.id,pei.email,pei.display_name,pei.login,p.country_code,pei.active,p.registered_company_name company_name FROM public_executor_identities pei LEFT JOIN public_executor_profiles p ON p.executor_id=pei.id WHERE pei.id=? LIMIT 1`,[Number(id)],'activation_review')||{};
  }
  const profile=await env.DB.prepare(`SELECT id,review_status,declared_country_code,verified_country_code,address_line1,address_line2,postal_code,city,region,company_name_snapshot,person_name_snapshot,phone_snapshot FROM verification_profiles WHERE identity_type=? AND identity_id=? ORDER BY id DESC LIMIT 1`).bind(type,Number(id)).first();
  const checks=profile?(await canonicalAll(env,`SELECT check_type,status,method,verified_at,reviewer_note,updated_at FROM verification_checks WHERE profile_id=? ORDER BY id`,[Number(profile.id)],'activation_review')).results||[]:[];
  const trustKey=profile?await env.DB.prepare(`SELECT id,key_hint,status,issued_at,activated_at,suspended_at,revoked_at,expires_at FROM trust_keys WHERE profile_id=? AND status IN ('active','issued','suspended') ORDER BY id DESC LIMIT 1`).bind(Number(profile.id)).first():null;
  const requests=await env.DB.prepare(`SELECT id,requested_fields,reviewer_message,status,user_completed_at,created_at,updated_at FROM activation_review_requests WHERE identity_type=? AND identity_id=? ORDER BY id DESC LIMIT 20`).bind(type,Number(id)).all();
  return {user:{identityType:type,identityId:Number(id),tenantId:target.tenantId||null,account,verification:profile||null},checks,trustKey:trustKey||null,requests:(requests.results||[]).map(x=>({...x,id:Number(x.id),requestedFields:parse(x.requested_fields),userCompletedAt:x.user_completed_at||null}))};
}

async function targetExists(env,type,id,tenantId){
  if(type==='executor'){const r=await env.DB.prepare(`SELECT id FROM public_executor_identities WHERE id=? LIMIT 1`).bind(id).first();return r?{authIdentityId:id,tenantId:null}:null;}
  if(type==='tenant'){const r=await env.DB.prepare(`SELECT ai.id auth_identity_id,ai.company_id tenant_id FROM auth_identities ai WHERE ai.company_id=? AND ai.role='admin' ORDER BY ai.active DESC,ai.id LIMIT 1`).bind(id).first();return r?{authIdentityId:Number(r.auth_identity_id),tenantId:Number(r.tenant_id)}:null;}
  const r=await env.DB.prepare(`SELECT ai.id auth_identity_id,ai.company_id tenant_id,d.id driver_id FROM auth_identities ai JOIN drivers d ON d.id=ai.driver_id AND d.company_id=ai.company_id WHERE d.id=? AND ai.role='driver' ORDER BY ai.active DESC,ai.id LIMIT 1`).bind(id).first();
  return r?{authIdentityId:Number(r.auth_identity_id),tenantId:Number(r.tenant_id),driverId:Number(r.driver_id)}:null;
}
function parse(v){try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[];}catch{return[];}}
const bad=m=>{const e=new Error(m);e.status=400;return e;};const notFound=m=>{const e=new Error(m);e.status=404;return e;};
