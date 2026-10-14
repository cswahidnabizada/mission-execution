import {auditAdminControl} from './admin-control-audit.service.js';

import { authorityUnavailable } from '../core/canonical-db.js';
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const json=(v,f={})=>{try{return JSON.parse(v||'null')??f}catch{return f}};
const fail=(message,status=409,code='PLATFORM_ADMIN_OPERATION_CONFLICT')=>{const e=new Error(message);e.status=status;e.code=code;return e};

function operationKey(actionCode,scopeKey,idempotencyKey){
  return `${clean(actionCode,120)}|${clean(scopeKey,240)}|${clean(idempotencyKey||crypto.randomUUID(),240)}`;
}

async function recoverExpired(env){
  await env.DB.prepare(`UPDATE platform_admin_operations SET status='expired',error_code='LEASE_EXPIRED',error_message='Administrative operation lease expired before completion',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE status IN ('preparing','executing','verifying') AND lease_expires_at<=CURRENT_TIMESTAMP`).run();
}

export async function beginPlatformAdminOperation(env,{actionCode,resourceType,resourceId=null,scopeKey,idempotencyKey=null,actor,requestId,expectedVersion=null,preconditions={},impact={},leaseSeconds=120}){
  await recoverExpired(env);
  const idem=clean(idempotencyKey,240)||null;
  if(idem){
    const existing=await env.DB.prepare(`SELECT * FROM platform_admin_operations WHERE action_code=? AND scope_key=? AND idempotency_key=? LIMIT 1`).bind(actionCode,scopeKey,idem).first();
    if(existing){
      return {reused:true,operation:normalize(existing),result:json(existing.result_json,{})};
    }
  }
  const key=operationKey(actionCode,scopeKey,idem);
  const leaseToken=crypto.randomUUID();
  try{
    const res=await env.DB.prepare(`INSERT INTO platform_admin_operations(operation_key,idempotency_key,action_code,resource_type,resource_id,scope_key,actor_type,actor_id,request_id,status,expected_version,preconditions_json,impact_json,lease_token,lease_version,lease_expires_at) VALUES(?,?,?,?,?,?,?,?,?,'preparing',?,?,?,?,?,datetime('now',? || ' seconds'))`).bind(key,idem,actionCode,resourceType,resourceId==null?null:String(resourceId),scopeKey,actor?.role||actor?.type||'platform_super_administrator',actor?.id==null?null:String(actor.id),requestId||null,expectedVersion==null?null:String(expectedVersion),JSON.stringify(preconditions||{}),JSON.stringify(impact||{}),leaseToken,1,String(Number(leaseSeconds))).run();
    const id=Number(res.meta?.last_row_id||res.last_row_id);
    const operation=await env.DB.prepare(`SELECT * FROM platform_admin_operations WHERE id=?`).bind(id).first();
    return {reused:false,operation:normalize(operation),result:null};
  }catch(e){
    if(/UNIQUE|constraint/i.test(String(e?.message||''))){
      const existing=await env.DB.prepare(`SELECT * FROM platform_admin_operations WHERE scope_key=? AND status IN ('preparing','executing','verifying') ORDER BY id DESC LIMIT 1`).bind(scopeKey).first();
      if(existing)throw fail('Another administrative operation is already executing for this scope',409,'PLATFORM_ADMIN_OPERATION_IN_PROGRESS');
      if(idem){const prior=await env.DB.prepare(`SELECT * FROM platform_admin_operations WHERE action_code=? AND scope_key=? AND idempotency_key=? LIMIT 1`).bind(actionCode,scopeKey,idem).first();if(prior)return {reused:true,operation:normalize(prior),result:json(prior.result_json,{})};}
    }
    throw e;
  }
}

function operationRef(ref,token=null){
  if(ref&&typeof ref==='object')return {id:Number(ref.id||0),token:String(ref.leaseToken||ref.lease_token||'')};
  return {id:Number(ref||0),token:String(token||'')};
}

export async function renewPlatformAdminOperationLease(env,ref,leaseSeconds=120){
  const r=operationRef(ref);if(!r.id||!r.token)throw fail('Administrative operation lease token is required',409,'PLATFORM_ADMIN_OPERATION_LEASE_REQUIRED');
  const updated=await env.DB.prepare(`UPDATE platform_admin_operations SET lease_expires_at=datetime('now',? || ' seconds'),lease_version=lease_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=? AND status IN ('preparing','executing','verifying') AND lease_expires_at>CURRENT_TIMESTAMP`).bind(String(Math.max(30,Number(leaseSeconds)||120)),r.id,r.token).run();
  if(Number(updated.meta?.changes||0)!==1)throw fail('Administrative operation lease is no longer owned',409,'PLATFORM_ADMIN_OPERATION_LEASE_LOST');
  return getPlatformAdminOperation(env,r.id);
}

export async function markPlatformAdminOperationExecuting(env,ref,preconditions={}){
  const r=operationRef(ref);if(!r.id||!r.token)throw fail('Administrative operation lease token is required',409,'PLATFORM_ADMIN_OPERATION_LEASE_REQUIRED');
  const updated=await env.DB.prepare(`UPDATE platform_admin_operations SET status='executing',preconditions_json=?,lease_expires_at=datetime('now','120 seconds'),lease_version=lease_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=? AND status='preparing' AND lease_expires_at>CURRENT_TIMESTAMP`).bind(JSON.stringify(preconditions||{}),r.id,r.token).run();
  if(Number(updated.meta?.changes||0)!==1)throw fail('Administrative operation lease is no longer owned',409,'PLATFORM_ADMIN_OPERATION_LEASE_LOST');
}
export async function markPlatformAdminOperationVerifying(env,ref,impact={}){
  const r=operationRef(ref);if(!r.id||!r.token)throw fail('Administrative operation lease token is required',409,'PLATFORM_ADMIN_OPERATION_LEASE_REQUIRED');
  const updated=await env.DB.prepare(`UPDATE platform_admin_operations SET status='verifying',impact_json=?,lease_expires_at=datetime('now','120 seconds'),lease_version=lease_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=? AND status IN ('preparing','executing') AND lease_expires_at>CURRENT_TIMESTAMP`).bind(JSON.stringify(impact||{}),r.id,r.token).run();
  if(Number(updated.meta?.changes||0)!==1)throw fail('Administrative operation lease is no longer owned',409,'PLATFORM_ADMIN_OPERATION_LEASE_LOST');
}
export async function completePlatformAdminOperation(env,ref,{result={},rollback={},status='succeeded'}={}){
  const r=operationRef(ref);if(!r.id||!r.token)throw fail('Administrative operation lease token is required',409,'PLATFORM_ADMIN_OPERATION_LEASE_REQUIRED');
  const updated=await env.DB.prepare(`UPDATE platform_admin_operations SET status=?,result_json=?,rollback_json=?,completed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=? AND status='verifying' AND lease_expires_at>CURRENT_TIMESTAMP`).bind(status,JSON.stringify(result||{}),JSON.stringify(rollback||{}),r.id,r.token).run();
  if(Number(updated.meta?.changes||0)!==1)throw fail('Administrative operation lease is no longer owned',409,'PLATFORM_ADMIN_OPERATION_LEASE_LOST');
  return getPlatformAdminOperation(env,r.id);
}
export async function failPlatformAdminOperation(env,ref,error,{rollback={}}={}){
  const r=operationRef(ref);if(!r.id||!r.token)throw fail('Administrative operation lease token is required',409,'PLATFORM_ADMIN_OPERATION_LEASE_REQUIRED');
  const updated=await env.DB.prepare(`UPDATE platform_admin_operations SET status='failed',error_code=?,error_message=?,rollback_json=?,completed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_token=? AND status IN ('preparing','executing','verifying')`).bind(clean(error?.code||'PLATFORM_ADMIN_OPERATION_FAILED',120),clean(error?.message||'Administrative operation failed',1000),JSON.stringify(rollback||{}),r.id,r.token).run();
  if(Number(updated.meta?.changes||0)!==1)throw fail('Administrative operation lease is no longer owned',409,'PLATFORM_ADMIN_OPERATION_LEASE_LOST');
  return getPlatformAdminOperation(env,r.id);
}
export async function getPlatformAdminOperation(env,id){const row=await env.DB.prepare(`SELECT * FROM platform_admin_operations WHERE id=?`).bind(Number(id)).first();return row?normalize(row):null;}
export async function listPlatformAdminOperations(env,{limit=50,scopeKey=null}={}){
  const n=Math.min(Math.max(Number(limit)||50,1),100);
  const rows=scopeKey?(await env.DB.prepare(`SELECT * FROM platform_admin_operations WHERE scope_key=? ORDER BY id DESC LIMIT ?`).bind(scopeKey,n).all()).results||[]:(await env.DB.prepare(`SELECT * FROM platform_admin_operations ORDER BY id DESC LIMIT ?`).bind(n).all()).results||[];
  return rows.map(normalize);
}
function normalize(r){return {...r,id:Number(r.id),leaseToken:r.lease_token||null,leaseVersion:Number(r.lease_version||1),preconditions:json(r.preconditions_json,{}),impact:json(r.impact_json,{}),result:json(r.result_json,{}),rollback:json(r.rollback_json,{})};}

export async function executePlatformAdminOperation(env,definition,execute){
  const begun=await beginPlatformAdminOperation(env,definition);
  if(begun.reused)return begun.result;
  const id=begun.operation.id;
  try{
    await markPlatformAdminOperationExecuting(env,begun.operation,definition.preconditions||{});
    const result=await execute({operationId:id});
    await markPlatformAdminOperationVerifying(env,begun.operation,result?.impact||{});
    const finalResult=await completePlatformAdminOperation(env,begun.operation,{result,rollback:result?.rollback||{}});
    try{await auditAdminControl(env,{actor:definition.actor,action:`admin.operation.${definition.actionCode}.succeeded`,resourceType:'platform_admin_operation',resourceId:id,requestId:definition.requestId,metadata:{scopeKey:definition.scopeKey,resourceType:definition.resourceType,resourceId:definition.resourceId}});}catch(error){throw authorityUnavailable('platform_admin_operation_audit',error);}
    return {...result,operation:finalResult};
  }catch(error){
    try{await failPlatformAdminOperation(env,begun.operation,error);}catch(recoveryError){throw authorityUnavailable('platform_admin_operation_recovery',recoveryError);}
    try{await auditAdminControl(env,{actor:definition.actor,action:`admin.operation.${definition.actionCode}.failed`,resourceType:'platform_admin_operation',resourceId:id,requestId:definition.requestId,metadata:{scopeKey:definition.scopeKey,errorCode:error?.code||null}});}catch(auditError){throw authorityUnavailable('platform_admin_operation_audit',auditError);}
    throw error;
  }
}
