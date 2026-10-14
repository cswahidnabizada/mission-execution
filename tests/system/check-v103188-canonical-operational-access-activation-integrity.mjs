import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const cache=read('src/worker/security/operational-access-cache.js');
const gate=read('src/worker/security/operational-gate.service.js');
const activation=read('src/worker/security/activation.service.js');
const review=read('src/worker/security/activation-review.service.js');
const situation=read('src/worker/security/user-situation.service.js');
const migration=read('database/migrations/0057_operational_access_leases.sql');
assert.match(migration,/CREATE TABLE IF NOT EXISTS operational_access_leases/);
assert.match(migration,/CHECK \(action_count >= 0 AND action_count <= 10\)/);
assert.match(cache,/OPERATIONAL_ACCESS_VERSION='1\.1\.0'/);
assert.match(cache,/UPDATE operational_access_leases SET action_count=action_count\+1/);
assert.match(cache,/action_count<\?/);
assert.match(cache,/No database means there is no authoritative concurrency primitive/);
assert.match(gate,/A refreshed lease is never sufficient by itself/);
assert.match(gate,/used=await consumeOperationalAccess\(env,token\);/);
assert.match(activation,/reconcileActivationReviewRequests/);
assert.match(activation,/nextTask\(\{situation,classification,reviewRequests\}\)/);
assert.match(activation,/review_request/);
assert.match(review,/reconcileActivationReviewRequests/);
assert.match(review,/field==='restriction'/);
assert.match(review,/field==='billing'/);
assert.match(situation,/FRESH_AUTHORITY_ACTIONS/);
assert.match(situation,/remove_driver/);
assert.match(situation,/complete_mission/);
assert.match(situation,/situation\.commercialRestrictions\.driverLimitReached/);
assert.match(situation,/situation\.commercialRestrictions\.missionLimitReached/);
assert.doesNotMatch(cache,/const next=\{\.\.\.current,actionCount:Number\(current\.actionCount\|\|0\)\+1\};/);
const cacheModule=await import('../../src/worker/security/operational-access-cache.js');
const calls=[];
const kv=new Map();
const env={
  KV_BINDING:{
    async get(k){return kv.get(k)||null},
    async put(k,v){kv.set(k,v)},
    async delete(k){kv.delete(k)}
  },
  DB:{
    prepare(sql){
      return {
        bind(...args){return {
          async run(){
            calls.push({sql,args});
            if(sql.startsWith('INSERT INTO operational_access_leases')){dbRow={token_hash:args[0],issued_at:args[1],expires_at:args[2],action_count:0};return {meta:{changes:1}};}
            if(sql.startsWith('UPDATE operational_access_leases')){
              if(dbRow && dbRow.token_hash===args[0] && dbRow.expires_at>args[1] && dbRow.action_count<args[2]){dbRow.action_count++;return {meta:{changes:1}};}
              return {meta:{changes:0}};
            }
            if(sql.startsWith('DELETE FROM operational_access_leases')){dbRow=null;return {meta:{changes:1}};}
            return {meta:{changes:0}};
          },
          async first(){return dbRow?{...dbRow}:null}
        }}
      }
    }
  }
};
let dbRow=null;
await cacheModule.writeOperationalAccess(env,'lease-test',{decision:'ALLOW',readyToGo:true});
for(let i=0;i<10;i++)assert.ok(await cacheModule.consumeOperationalAccess(env,'lease-test'),`lease action ${i+1} must be consumed`);
assert.equal(await cacheModule.consumeOperationalAccess(env,'lease-test'),null,'11th action must be rejected without refresh');
assert.equal(dbRow.action_count,10,'authoritative D1 count must remain exactly 10');
await cacheModule.clearOperationalAccess(env,'lease-test');
console.log('10.31.88 canonical operational access + activation integrity: PASS');
