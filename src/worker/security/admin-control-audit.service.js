function safeMetadata(metadata){
  const safe={};
  for(const [k,v] of Object.entries(metadata||{})){
    if(/password|secret|token|cookie|email|phone|address|registration/i.test(k))continue;
    safe[String(k).slice(0,80)]=typeof v==='string'?v.slice(0,240):v;
  }
  return safe;
}
export function prepareAdminControlAudit(env,{actor,action,resourceType,resourceId=null,targetCompanyId=null,requestId=null,metadata=null}){
  return env.DB.prepare(`INSERT INTO admin_control_audit_events(event_id,actor_role,action,resource_type,resource_id,target_company_id,request_id,metadata) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),String(actor?.role||'platform_administrator'),String(action||'unknown').slice(0,160),String(resourceType||'unknown').slice(0,80),resourceId,targetCompanyId,requestId,JSON.stringify(safeMetadata(metadata)));
}
export async function auditAdminControl(env,args){await prepareAdminControlAudit(env,args).run();}
