import assert from 'node:assert/strict';
import {executeOwnerLifecycleCommand,getOwnerLifecycleOperation} from '../../src/worker/security/owner-lifecycle-adapters.service.js';

class FakeD1 {
 constructor(){this.operations=new Map();this.sector={code:'logistics',name:'Logistics',description:'German logistics',active:0,created_at:'2026-01-01',updated_at:'2026-11-01T10:00:00.000Z'};this.productDependency=null;this.policyDependency=null;this.mutations=0;this.audits=0;}
 prepare(sql){const db=this;let args=[];return {bind(...values){args=values;return this;},async first(){
  if(sql.includes('FROM platform_owner_lifecycle_operations WHERE idempotency_key=?'))return db.operations.get(String(args[0]))||null;
  if(sql.includes('FROM platform_reusable_sectors WHERE code=?'))return {...db.sector};
  if(sql.includes('FROM platform_product_definitions'))return db.productDependency;
  if(sql.includes('FROM sector_policies'))return db.policyDependency;
  return null;
 },async all(){return {results:[]};},async run(){
  if(sql.includes('INSERT OR IGNORE INTO platform_owner_lifecycle_operations')){const key=String(args[0]);if(db.operations.has(key))return {meta:{changes:0}};db.operations.set(key,{idempotency_key:key,operation_hash:String(args[1]),resource_type:String(args[2]),resource_id:String(args[3]),command:String(args[4]),status:'IN_PROGRESS',result_json:'{}',actor_type:String(args[5]),actor_id:args[6],request_id:args[7]});return {meta:{changes:1}};}
  if(sql.includes('UPDATE platform_reusable_sectors SET active=')){if(db.sector.updated_at!==String(args[2]))return {meta:{changes:0}};db.sector={...db.sector,active:Number(args[0]),updated_at:'2026-11-01T10:01:00.000Z'};db.mutations++;return {meta:{changes:1}};}
  if(sql.includes("UPDATE platform_owner_lifecycle_operations SET status='COMPLETED'")){const key=String(args[1]);const row=db.operations.get(key);if(row){row.status='COMPLETED';row.result_json=String(args[0]);row.completed_at='2026-11-01T10:01:00.000Z';}return {meta:{changes:row?1:0}};}
  if(sql.includes('UPDATE platform_owner_lifecycle_operations SET status=?')){const status=String(args[0]),key=String(args.at(-1)),row=db.operations.get(key);if(row){row.status=status;row.error_code=String(args[1]);row.error_message=String(args[2]);}return {meta:{changes:row?1:0}};}
  if(sql.includes('INSERT INTO admin_control_audit_events')){db.audits++;return {meta:{changes:1}};}
  return {meta:{changes:1}};
 }};}
}
const actor={role:'platform_super_administrator',id:'admin-1'};
const db=new FakeD1(),env={DB:db};
const input={resourceType:'sector',resourceId:'logistics',command:'activate',expectedUpdatedAt:db.sector.updated_at,idempotencyKey:'adversarial-sector-activate-1'};
const first=await executeOwnerLifecycleCommand(env,actor,input,'request-1');
assert.equal(first.success,true);assert.equal(first.verified,true);assert.equal(db.sector.active,1);assert.equal(db.mutations,1);assert.equal(db.audits,1);
const replay=await executeOwnerLifecycleCommand(env,actor,input,'request-2');
assert.equal(replay.reused,true);assert.equal(db.mutations,1);assert.equal(db.audits,1);
const operation=await getOwnerLifecycleOperation(env,input.idempotencyKey);assert.equal(operation.status,'COMPLETED');assert.equal(operation.result.success,true);
await assert.rejects(()=>executeOwnerLifecycleCommand(env,actor,{...input,command:'deactivate'},'request-3'),e=>e.code==='OWNER_LIFECYCLE_IDEMPOTENCY_CONFLICT');

const staleDb=new FakeD1();const staleEnv={DB:staleDb};
await assert.rejects(()=>executeOwnerLifecycleCommand(staleEnv,actor,{...input,idempotencyKey:'adversarial-stale',expectedUpdatedAt:'stale-revision'},'request-stale'),e=>e.code==='OWNER_LIFECYCLE_STALE_RESOURCE');
assert.equal(staleDb.mutations,0);

const dependencyDb=new FakeD1();dependencyDb.sector.active=1;dependencyDb.policyDependency={code:'logistics-policy'};
await assert.rejects(()=>executeOwnerLifecycleCommand({DB:dependencyDb},actor,{...input,command:'deactivate',idempotencyKey:'adversarial-dependency',expectedUpdatedAt:dependencyDb.sector.updated_at},'request-dependency'),e=>e.code==='SECTOR_HAS_ACTIVE_PRODUCT_DEPENDENCIES');
assert.equal(dependencyDb.mutations,0);

const interruptedDb=new FakeD1();interruptedDb.operations.set('adversarial-interrupted',{idempotency_key:'adversarial-interrupted',operation_hash:'matching',status:'IN_PROGRESS',result_json:'{}'});
await assert.rejects(()=>executeOwnerLifecycleCommand({DB:interruptedDb},actor,{...input,idempotencyKey:'adversarial-interrupted'},'request-interrupted'),e=>e.code==='OWNER_LIFECYCLE_IDEMPOTENCY_CONFLICT'||e.code==='OWNER_LIFECYCLE_RECOVERY_REQUIRED');
assert.equal(interruptedDb.mutations,0);
console.log('16.87.0 owner lifecycle adversarial contract: PASS (idempotent replay, key conflict, stale revision, dependency guard, interrupted operation fail-closed)');
