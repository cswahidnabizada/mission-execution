import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {humanPlatformDefaultConfiguration,createHumanPlatformDraft,validateHumanPlatform,authorizeHumanPlatform,activateHumanPlatform} from '../../src/worker/modules/admin-control/human-platform-control.service.js';
import {publishHumanPlatform,verifyHumanPlatform,getHumanPlatformReleaseLedger,resolveHumanPlatformSimulation,runHumanPlatformTestLab} from '../../src/worker/modules/admin-control/human-platform-final.service.js';

const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('database/schema.current.sql','utf8'));
const env={DB:{batch(stmts){const tx=db.exec('BEGIN');try{for(const st of stmts){const q=st.__sql||'';if(q)db.prepare(q).run(...st.__params);else throw new Error('batch statement missing');}db.exec('COMMIT');return Promise.resolve({});}catch(e){try{db.exec('ROLLBACK')}catch{};throw e;}},prepare(sql){
  const make=(params)=>({
    first(){return Promise.resolve(db.prepare(sql).get(...params)||null)},
    all(){return Promise.resolve({results:db.prepare(sql).all(...params)})},
    run(){const r=db.prepare(sql).run(...params);return Promise.resolve({meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)},last_row_id:Number(r.lastInsertRowid)})}
  });
  const stmt={...make([]),__sql:sql,bind(...params){const x=make(params);return {...x,__sql:sql,__params:params}}};
  return stmt;
}}};
const actor={role:'platform_super_administrator',id:'runtime-harness'};
const base=humanPlatformDefaultConfiguration();
base.canonicalDestinations[0].label='Today';
const draft=await createHumanPlatformDraft(env,actor,{payload:base,reason:'11.02 runtime certification'},'runtime-draft-1');
assert.equal(draft.status,'draft');
const validated=await validateHumanPlatform(env,actor,Number(draft.id),'runtime-validate-1');
assert.equal(validated.status,'validated');
const authorized=await authorizeHumanPlatform(env,actor,Number(draft.id),'runtime-authorize-1');
assert.equal(authorized.status,'validated');
await assert.rejects(()=>activateHumanPlatform(env,actor,Number(draft.id),'runtime-activate-before-publish',{expectedActiveConfigId:null,expectedActiveVersion:null}),e=>e.code==='HUMAN_PLATFORM_RELEASE_NOT_PUBLISHED');
await publishHumanPlatform(env,actor,Number(draft.id),'runtime-publish-1');
await assert.rejects(()=>activateHumanPlatform(env,actor,Number(draft.id),'runtime-activate-before-verify',{expectedActiveConfigId:null,expectedActiveVersion:null}),e=>e.code==='HUMAN_PLATFORM_RELEASE_NOT_VERIFIED');
const lab=await runHumanPlatformTestLab(env,{configurationId:Number(draft.id)});
assert.equal(lab.summary.status,'PASS');
const verified=await verifyHumanPlatform(env,actor,Number(draft.id),'runtime-verify-1');
assert.equal(verified.stage,'VERIFIED');
const live=await activateHumanPlatform(env,actor,Number(draft.id),'runtime-activate-1',{expectedActiveConfigId:null,expectedActiveVersion:null});
assert.equal(live.configuration.status,'active');
const sim=await resolveHumanPlatformSimulation(env,{configurationId:Number(draft.id)});
assert.equal(sim.productionMutation,false);assert.equal(sim.governance.tenantDataExcluded,true);assert.equal(sim.readiness,'READY');
const ledger=await getHumanPlatformReleaseLedger(env);
assert.equal(ledger.active.stage,'LIVE');
assert.equal(ledger.releases[0].stage,'LIVE');
console.log('11.02.0 runtime lifecycle harness: PASS');
console.log('Draft → Validated → Authorized → Published → Verified → Live enforced; pre-verification activation blocked; simulation remained non-mutating.');
