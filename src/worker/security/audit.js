const SENSITIVE_KEY=/password|secret|token|cookie|authorization|trustkey|trust_key|reset|code|phone|mobile|email|login|ip|user.?agent/i;
const MAX_METADATA_BYTES=4096;
const DEFAULT_RETENTION_DAYS=365;

export async function audit(env,{session,action,resourceType,resourceId=null,metadata=null}){
  const safeMetadata=redactMetadata(metadata);
  const payload=JSON.stringify(safeMetadata);
  try{
    if(session?.actingAs?.contextId){
      const delegated=session.actingAs;
      await env.DB.prepare(`INSERT INTO admin_control_audit_events(event_id,actor_role,action,resource_type,resource_id,target_company_id,request_id,metadata) VALUES(?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(),'platform_super_administrator',`platform.user_experience.delegated.${String(action||'unknown').slice(0,120)}`,String(resourceType||'unknown').slice(0,80),resourceId,Number(delegated.targetTenantId)||null,null,JSON.stringify({contextId:delegated.contextId,mode:delegated.mode,targetIdentityId:Number(delegated.targetIdentityId)||null,reason:delegated.reason||null,tenantId:Number(session?.tenantId)||null})).run();
    }
    await env.DB.prepare(`
      INSERT INTO audit_logs (company_id,actor_role,actor_driver_id,action,resource_type,resource_id,metadata,created_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).bind(Number(session?.tenantId||0),session?.role||'system',session?.driverId||null,
      String(action||'unknown').slice(0,160),String(resourceType||'unknown').slice(0,80),resourceId,payload).run();
  }catch(error){
    console.log('AUDIT_FALLBACK',{action,resourceType,resourceId,reason:error?.message});
  }
}

export function redactMetadata(value,depth=0){
  if(depth>4)return '[redacted-depth]';
  if(value===null||value===undefined)return value;
  if(typeof value==='string')return value.length>1000?`${value.slice(0,1000)}…`:'[redacted]';
  if(typeof value!=='object')return value;
  if(Array.isArray(value))return value.slice(0,32).map(v=>redactMetadata(v,depth+1));
  const out={};
  for(const [key,val] of Object.entries(value)){
    if(SENSITIVE_KEY.test(key))continue;
    out[String(key).slice(0,80)]=redactMetadata(val,depth+1);
  }
  const encoded=JSON.stringify(out);
  if(new TextEncoder().encode(encoded).length<=MAX_METADATA_BYTES)return out;
  return {truncated:true,keys:Object.keys(out).slice(0,24)};
}

export function auditRetentionDays(env){
  const n=Number(env?.AUDIT_RETENTION_DAYS||DEFAULT_RETENTION_DAYS);
  return Number.isInteger(n)&&n>=30&&n<=3650?n:DEFAULT_RETENTION_DAYS;
}
