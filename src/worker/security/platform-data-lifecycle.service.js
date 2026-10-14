import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';
import {RELEASE_VERSION} from '../core/release.js';
export const PLATFORM_DATA_LIFECYCLE_VERSION=RELEASE_VERSION;
export const DATA_LIFECYCLE_STAGES=Object.freeze(['DRAFT','VALIDATED','COMMITTED','ACTIVE','RESTRICTED','QUARANTINED','RESTORED','PURGED','RETAINED','BLOCKED']);
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const json=v=>{try{return JSON.parse(String(v??'{}'))||{}}catch{return {}}};
const fail=(m,s=400,c=m)=>Object.assign(new Error(m),{status:s,code:c});
async function one(env,sql,...a){return canonicalFirst(env,sql,a,'platform_data_lifecycle')}
async function all(env,sql,...a){return canonicalAll(env,sql,a,'platform_data_lifecycle')}
export async function recordDataLifecycleEvent(env,{resourceType,resourceId,stage,previousStage=null,action='observe',actor=null,reasonCode='system',reason='',sourceEntryId=null,canonicalAuthority=null,dependencySnapshot={},legalHold=false,metadata={},requestId=null}={}){
  const type=clean(resourceType,100),id=String(resourceId??''),next=clean(stage,40).toUpperCase();
  if(!type||!id||!DATA_LIFECYCLE_STAGES.includes(next))throw fail('DATA_LIFECYCLE_EVENT_INVALID',422,'DATA_LIFECYCLE_EVENT_INVALID');
  const eventId=`dle_${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO platform_data_lifecycle_events(event_id,resource_type,resource_id,previous_stage,stage,action,reason_code,reason,source_entry_id,canonical_authority,dependency_snapshot_json,legal_hold,actor_type,actor_id,request_id,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(eventId,type,id,previousStage?clean(previousStage,40).toUpperCase():null,next,clean(action,60),clean(reasonCode,100),clean(reason,1000),sourceEntryId?clean(sourceEntryId,200):null,canonicalAuthority?clean(canonicalAuthority,160):null,JSON.stringify(dependencySnapshot||{}),legalHold?1:0,String(actor?.role||actor?.type||'system'),actor?.id==null?null:String(actor.id),requestId?clean(requestId,160):null,JSON.stringify(metadata||{})).run();
  return {eventId,resourceType:type,resourceId:id,stage:next,previousStage:previousStage?String(previousStage):null,action};
}
export async function ensureDataLifecycleEvent(env,args={}){
  const type=clean(args.resourceType,100),id=String(args.resourceId??''),action=clean(args.action||'observe',60),sourceEntryId=args.sourceEntryId?clean(args.sourceEntryId,200):null;
  if(!type||!id)throw fail('DATA_LIFECYCLE_RESOURCE_REQUIRED',400,'DATA_LIFECYCLE_RESOURCE_REQUIRED');
  const existing=await one(env,`SELECT event_id,stage,previous_stage,action FROM platform_data_lifecycle_events WHERE resource_type=? AND resource_id=? AND action=? AND (? IS NULL OR source_entry_id=?) ORDER BY id DESC LIMIT 1`,type,id,action,sourceEntryId,sourceEntryId);
  if(existing)return {eventId:existing.event_id,resourceType:type,resourceId:id,stage:existing.stage,previousStage:existing.previous_stage,action:existing.action,reused:true};
  return recordDataLifecycleEvent(env,args);
}

export async function getDataLifecycle(env,resourceType,resourceId,{limit=50}={}){
 const type=clean(resourceType,100),id=String(resourceId??'');
 if(!type||!id)throw fail('DATA_LIFECYCLE_RESOURCE_REQUIRED',400,'DATA_LIFECYCLE_RESOURCE_REQUIRED');
 const events=await all(env,`SELECT event_id,resource_type,resource_id,previous_stage,stage,action,reason_code,reason,source_entry_id,canonical_authority,dependency_snapshot_json,legal_hold,actor_type,actor_id,request_id,metadata_json,created_at FROM platform_data_lifecycle_events WHERE resource_type=? AND resource_id=? ORDER BY id DESC LIMIT ?`,type,id,Math.min(100,Math.max(1,Number(limit||50))));
 const normalized=events.map(x=>({...x,dependencySnapshot:json(x.dependency_snapshot_json),metadata:json(x.metadata_json),legalHold:Number(x.legal_hold)===1}));
 return {resourceType:type,resourceId:id,currentStage:normalized[0]?.stage||null,events:normalized};
}
export async function listDataLifecycleEvents(env,{resourceType='',resourceId='',limit=100}={}){
 const type=clean(resourceType,100),id=String(resourceId||'');
 const rows=await all(env,`SELECT event_id,resource_type,resource_id,previous_stage,stage,action,reason_code,reason,source_entry_id,canonical_authority,legal_hold,actor_type,actor_id,request_id,metadata_json,created_at FROM platform_data_lifecycle_events WHERE (?='' OR resource_type=?) AND (?='' OR resource_id=?) ORDER BY id DESC LIMIT ?`,type,type,id,id,Math.min(250,Math.max(1,Number(limit||100))));
 return rows.map(x=>({...x,metadata:json(x.metadata_json),legalHold:Number(x.legal_hold)===1}));
}
export function stageFromDataEntry(entry){
 if(!entry)return 'DRAFT';
 const s=String(entry.status||'').toLowerCase();
 if(s==='committed')return String(entry.canonical_status||'COMMITTED').toUpperCase()==='ACTIVE'?'ACTIVE':'COMMITTED';
 if(s==='validated')return 'VALIDATED';
 if(s==='rejected'||s==='cancelled')return 'BLOCKED';
 return 'DRAFT';
}
