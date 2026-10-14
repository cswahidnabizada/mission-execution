import {canonicalFirst} from '../core/canonical-db.js';
/**
 * ON Mission 10.35.5 — Durable critical-audit contract.
 * Critical mutation intent is persisted before the authoritative mutation.
 * The record remains durable even if the post-mutation audit log cannot be written.
 */

export function criticalActionEventId({requestId,action,resourceType,resourceId=null}={}){
  const request=String(requestId||'').trim();
  const suffix=crypto.randomUUID().replaceAll('-','');
  return `ca_${request.slice(0,48)||'internal'}_${suffix.slice(0,24)}`;
}

export async function prepareCriticalAudit(env,{session,action,resourceType,resourceId=null,requestId=null,metadata=null}={}){
  const eventId=criticalActionEventId({requestId,action,resourceType,resourceId});
  const companyId=Number(session?.tenantId||0);
  if(companyId<0)throw criticalError('CRITICAL_AUDIT_CONTEXT_INVALID',503);
  const safe=JSON.stringify(sanitize(metadata));
  try{
    await env.DB.prepare(`INSERT INTO critical_audit_events(event_id,company_id,actor_role,actor_identity_id,actor_driver_id,action,resource_type,resource_id,request_id,phase,metadata) VALUES(?,?,?,?,?,?,?,?,?,'prepared',?)`)
      .bind(eventId,companyId,String(session?.role||'system'),Number(session?.identityId||0)||null,Number(session?.driverId||0)||null,String(action||'unknown').slice(0,160),String(resourceType||'unknown').slice(0,80),resourceId,String(requestId||'').slice(0,128)||null,safe).run();
  }catch(error){
    if(/UNIQUE constraint failed.*event_id/i.test(String(error?.message||'')))return eventId;
    throw criticalError('CRITICAL_AUDIT_UNAVAILABLE',503,error);
  }
  return eventId;
}

export async function completeCriticalAudit(env,eventId,{success=true,errorCode=null}={}){
  if(!eventId)return {status:'complete'};
  const phase=success?'succeeded':'failed';
  try{
    const result=await env.DB.prepare(`UPDATE critical_audit_events SET phase=?,error_code=?,completed_at=CURRENT_TIMESTAMP WHERE event_id=?`).bind(phase,errorCode?String(errorCode).slice(0,120):null,eventId).run();
    if(Number(result?.meta?.changes||0)!==1)return {status:'pending_reconciliation',eventId};
    return {status:'complete',eventId};
  }catch(error){
    // The prepared record is already durable. A completion write failure is evidence debt,
    // not proof that the audit completed. Keep the durable record explicitly reconcilable.
    try{
      const fallback=await env.DB.prepare(`UPDATE critical_audit_events SET phase='reconciled',error_code=?,completed_at=CURRENT_TIMESTAMP WHERE event_id=?`).bind('AUDIT_COMPLETION_PERSISTENCE_FAILED',eventId).run();
      if(Number(fallback?.meta?.changes||0)===1)return {status:'pending_reconciliation',eventId};
    }catch{}
    console.log('CRITICAL_AUDIT_COMPLETION_FALLBACK',{eventId,reason:error?.message});
    return {status:'pending_reconciliation',eventId};
  }
}

export async function hasActiveLegalHold(env,{companyId=null,scopeType=null,scopeId=null,identityType=null,identityId=null}={}){
  const checks=[];
  if(companyId)checks.push(canonicalFirst(env,`SELECT id FROM privacy_legal_holds WHERE company_id=? AND active=1 LIMIT 1`,[Number(companyId)],'privacy_legal_hold_authority'));
  if(scopeType&&scopeId)checks.push(canonicalFirst(env,`SELECT id FROM privacy_legal_holds WHERE scope_type=? AND scope_id=? AND active=1 LIMIT 1`,[String(scopeType),Number(scopeId)],'privacy_legal_hold_authority'));
  if(identityType&&identityId)checks.push(canonicalFirst(env,`SELECT id FROM privacy_legal_holds WHERE identity_type=? AND identity_id=? AND active=1 LIMIT 1`,[String(identityType),Number(identityId)],'privacy_legal_hold_authority'));
  if(!checks.length)return false;
  const rows=await Promise.all(checks);
  return rows.some(Boolean);
}

function sanitize(value,depth=0){
  if(depth>3)return '[redacted-depth]';
  if(value===null||value===undefined)return value;
  if(typeof value==='string')return value.length>500?`${value.slice(0,500)}…`:value;
  if(typeof value!=='object')return value;
  if(Array.isArray(value))return value.slice(0,16).map(v=>sanitize(v,depth+1));
  const out={};
  for(const [k,v] of Object.entries(value))if(!/password|secret|token|cookie|authorization|email|phone|mobile|login|code|ip/i.test(k))out[String(k).slice(0,64)]=sanitize(v,depth+1);
  return out;
}

function criticalError(message,status,cause){const e=new Error(message);e.status=status;if(cause)e.cause=cause;return e;}
