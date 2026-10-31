/* ON Mission 16.66.0 — canonical resource relationship authority.
 * Relationships reference existing canonical identities; this service never creates endpoint assets.
 * It deliberately supports only inspectable canonical resources until each owner is registered.
 */
import {RELEASE_VERSION} from '../core/release.js';
import {canonicalAll,canonicalFirst} from '../core/canonical-db.js';
import {inspectDataStudioRecord} from './platform-data-studio.service.js';
import {prepareCriticalAudit,completeCriticalAudit} from './critical-audit.service.js';

export const PLATFORM_RESOURCE_RELATIONSHIP_VERSION=`${RELEASE_VERSION}-resource-relationships`;
const fail=(message,status=400,code=message,details=null)=>Object.assign(new Error(message),{status,code,details});
const clean=(v,max=120)=>String(v??'').trim().slice(0,max);
const ALLOWED_TYPES=new Set([
  'country_blueprint','product_country','sector','language','currency','region','classification',
  'policy','residency','retention','consent','role','capability','responsibility','storage','provider',
  'component','page','feature','configuration','guidance','plan','eligibility','pricing',
  'sector_lifecycle','translation_bundle','country','tenant','user','ui','content','product','product_definition'
]);
const RELATION_TYPES=new Set(['depends_on']);
function identity(type,id){return `${type}:${id}`;}
function scopeOf(resourceType,record={}){
  const raw=record.record||record;
  const tenant=resourceType==='tenant'?(raw.id??null):(raw.tenant_id??raw.tenantId??raw.company_id??raw.companyId??null);
  const country=raw.country_code??raw.countryCode??raw.country_code_iso??(['product_country','country'].includes(resourceType)?raw.code:null);
  return {tenant:tenant==null||tenant===''?null:String(tenant),country:country==null||country===''?null:String(country).toUpperCase()};
}
function assertScope(a,b){
  if(a.tenant&&b.tenant&&a.tenant!==b.tenant)throw fail('RESOURCE_RELATIONSHIP_TENANT_SCOPE_MISMATCH',409,'RESOURCE_RELATIONSHIP_TENANT_SCOPE_MISMATCH');
  if(a.country&&b.country&&a.country!==b.country)throw fail('RESOURCE_RELATIONSHIP_MARKET_SCOPE_MISMATCH',409,'RESOURCE_RELATIONSHIP_MARKET_SCOPE_MISMATCH');
}
async function resolveEndpoint(env,type,id){
  type=clean(type);id=clean(id,240);
  if(!ALLOWED_TYPES.has(type)||!id)throw fail('RESOURCE_RELATIONSHIP_ENDPOINT_INVALID',422,'RESOURCE_RELATIONSHIP_ENDPOINT_INVALID',{resourceType:type});
  if(type==='product'||type==='product_definition'){
    const record=await canonicalFirst(env,`SELECT id,product_key,name,country_code,sector_code,status,definition_version FROM platform_product_definitions WHERE id=? LIMIT 1`,[Number(id)],'resource_relationship.product_definition');
    if(!record)throw fail('RESOURCE_RELATIONSHIP_ENDPOINT_NOT_FOUND',404,'RESOURCE_RELATIONSHIP_ENDPOINT_NOT_FOUND');
    return {resourceType:'product_definition',resourceId:String(record.id),displayName:record.name||record.product_key||`Product ${id}`,authority:'Product Definition Authority',scope:{tenant:null,country:record.country_code?String(record.country_code).toUpperCase():null}};
  }
  const inspected=await inspectDataStudioRecord(env,{resourceType:type,resourceId:id});
  return {resourceType:type,resourceId:id,displayName:inspected.record.displayName,authority:inspected.record.authority,scope:scopeOf(type,inspected.record.record)};
}
async function validate(env,input){
  const relationType=clean(input?.relationType||'depends_on');
  if(!RELATION_TYPES.has(relationType))throw fail('RESOURCE_RELATIONSHIP_TYPE_UNSUPPORTED',422,'RESOURCE_RELATIONSHIP_TYPE_UNSUPPORTED');
  const from=await resolveEndpoint(env,input?.from?.resourceType,input?.from?.resourceId);
  const to=await resolveEndpoint(env,input?.to?.resourceType,input?.to?.resourceId);
  if(identity(from.resourceType,from.resourceId)===identity(to.resourceType,to.resourceId))throw fail('RESOURCE_RELATIONSHIP_SELF_REFERENCE',409,'RESOURCE_RELATIONSHIP_SELF_REFERENCE');
  assertScope(from.scope,to.scope);
  if(relationType==='depends_on'&&input.action!=='remove'){
    const rows=await canonicalAll(env,`SELECT from_resource_type,from_resource_id,to_resource_type,to_resource_id FROM platform_resource_relationships WHERE status='active' AND relation_type='depends_on' LIMIT 5001`,[],'resource_relationship.cycle_check');
    if(rows.length>5000)throw fail('RESOURCE_RELATIONSHIP_GRAPH_LIMIT_EXCEEDED',503,'RESOURCE_RELATIONSHIP_GRAPH_LIMIT_EXCEEDED');
    const graph=new Map();
    for(const row of rows){const key=identity(row.from_resource_type,row.from_resource_id);if(!graph.has(key))graph.set(key,[]);graph.get(key).push(identity(row.to_resource_type,row.to_resource_id));}
    const start=identity(to.resourceType,to.resourceId),target=identity(from.resourceType,from.resourceId),seen=new Set(),stack=[start];
    while(stack.length){const current=stack.pop();if(current===target)throw fail('RESOURCE_RELATIONSHIP_CYCLE_BLOCKED',409,'RESOURCE_RELATIONSHIP_CYCLE_BLOCKED');if(seen.has(current))continue;seen.add(current);for(const next of graph.get(current)||[])stack.push(next);}
  }
  return {relationType,from,to};
}
export async function previewResourceRelationship(env,input={}){
  const validated=await validate(env,input);
  return {success:true,valid:true,version:PLATFORM_RESOURCE_RELATIONSHIP_VERSION,operation:input.action==='remove'?'REMOVE':'CONNECT',relationship:validated,impact:{createsCanonicalAssets:0,changesCanonicalAssets:0,edgeOnly:true},requiresStepUp:true};
}
export async function listResourceRelationships(env,{resourceType,resourceId}={}){
  const type=clean(resourceType),id=clean(resourceId,240);
  if(!type||!id)throw fail('RESOURCE_RELATIONSHIP_RESOURCE_REQUIRED',400,'RESOURCE_RELATIONSHIP_RESOURCE_REQUIRED');
  await resolveEndpoint(env,type,id);
  const canonicalType=type==='product'?'product_definition':type;
  const rows=await canonicalAll(env,`SELECT id,from_resource_type,from_resource_id,to_resource_type,to_resource_id,relation_type,status,reason,created_at,updated_at,created_by,request_id FROM platform_resource_relationships WHERE status='active' AND ((from_resource_type=? AND from_resource_id=?) OR (to_resource_type=? AND to_resource_id=?)) ORDER BY id DESC LIMIT 500`,[canonicalType,id,canonicalType,id],'resource_relationship.list');
  return {success:true,version:PLATFORM_RESOURCE_RELATIONSHIP_VERSION,resource:{resourceType:type,resourceId:id},relationships:rows};
}
async function acquireRelationshipLease(env){
  const token=crypto.randomUUID();
  const row=await env.DB.prepare(`INSERT INTO platform_resource_relationship_leases(lock_key,lease_token,expires_at)
    VALUES('global',?,datetime('now','+30 seconds'))
    ON CONFLICT(lock_key) DO UPDATE SET lease_token=excluded.lease_token,expires_at=excluded.expires_at
    WHERE platform_resource_relationship_leases.expires_at<=CURRENT_TIMESTAMP
    RETURNING lease_token`).bind(token).first();
  if(!row?.lease_token)throw fail('RESOURCE_RELATIONSHIP_MUTATION_BUSY',409,'RESOURCE_RELATIONSHIP_MUTATION_BUSY');
  return token;
}
async function releaseRelationshipLease(env,token){
  await env.DB.prepare(`DELETE FROM platform_resource_relationship_leases WHERE lock_key='global' AND lease_token=?`).bind(token).run();
}
export async function commitResourceRelationship(env,actor,input={}){
  const leaseToken=await acquireRelationshipLease(env);
  let auditId=null;
  try{
    // Revalidate under a single global relationship mutation lease so concurrent
    // opposite-direction commits cannot both pass cycle detection.
    const action=input.action==='remove'?'remove':'connect';
    const validated=await validate(env,input);
    const reason=clean(input.reason,500);
    if(reason.length<8)throw fail('RESOURCE_RELATIONSHIP_REASON_REQUIRED',422,'RESOURCE_RELATIONSHIP_REASON_REQUIRED');
    const requestId=clean(input.requestId||'',160);
    if(!requestId)throw fail('RESOURCE_RELATIONSHIP_REQUEST_ID_REQUIRED',400,'RESOURCE_RELATIONSHIP_REQUEST_ID_REQUIRED');
    auditId=await prepareCriticalAudit(env,{session:actor,action:`platform.resource_relationship.${action}`,resourceType:'resource_relationship',resourceId:`${validated.from.resourceType}:${validated.from.resourceId}->${validated.to.resourceType}:${validated.to.resourceId}`,requestId,metadata:{relationType:validated.relationType,reason}});
    const status=action==='remove'?'removed':'active';
    await env.DB.prepare(`INSERT INTO platform_resource_relationships(from_resource_type,from_resource_id,to_resource_type,to_resource_id,relation_type,status,reason,created_by,request_id,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(from_resource_type,from_resource_id,to_resource_type,to_resource_id,relation_type)
      DO UPDATE SET status=excluded.status,reason=excluded.reason,created_by=excluded.created_by,request_id=excluded.request_id,updated_at=CURRENT_TIMESTAMP`).bind(
        validated.from.resourceType,validated.from.resourceId,validated.to.resourceType,validated.to.resourceId,validated.relationType,status,reason,String(actor?.id||actor?.email||'platform-admin'),requestId
      ).run();
    const row=await env.DB.prepare(`SELECT * FROM platform_resource_relationships WHERE from_resource_type=? AND from_resource_id=? AND to_resource_type=? AND to_resource_id=? AND relation_type=? LIMIT 1`).bind(validated.from.resourceType,validated.from.resourceId,validated.to.resourceType,validated.to.resourceId,validated.relationType).first();
    const verified=Boolean(row&&row.status===status&&row.reason===reason);
    const audit=await completeCriticalAudit(env,auditId,{success:true});
    return {success:true,committed:true,verified:verified&&(!audit?.status||audit.status==='complete'),evidenceStatus:verified&&(!audit?.status||audit.status==='complete')?'complete':'pending_reconciliation',relationship:row,version:PLATFORM_RESOURCE_RELATIONSHIP_VERSION};
  }catch(error){
    if(auditId){try{await completeCriticalAudit(env,auditId,{success:false,errorCode:error?.code||'RESOURCE_RELATIONSHIP_COMMIT_FAILED'});}catch{}}
    throw error;
  }finally{
    try{await releaseRelationshipLease(env,leaseToken);}catch{}
  }
}
