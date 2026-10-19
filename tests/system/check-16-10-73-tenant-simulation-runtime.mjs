import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const migration=fs.readFileSync('database/migrations/0161_simulation_run_records.sql','utf8');
const db=new DatabaseSync(':memory:');
db.exec(migration);
const add=db.prepare(`INSERT INTO platform_simulation_runs(run_id,owner_scope,tenant_id,actor_id,scenario_id,scenario_version,executor_id,status,schema_version,run_json,content_sha256) VALUES(?,'tenant',?,?,?,?,?,?,?,?,?)`);
const run=(id,tenant)=>JSON.stringify({schema:'onmission.simulation-run.v1',runId:id,simulationOnly:true,realWorldEffects:false,productionMutation:false,deviceCommandSent:false,journey:[{stage:'OBSERVE'}],evidence:[]});
for(const [id,tenant] of [['sim-tenant-a-0001',101],['sim-tenant-b-0001',202]]){
 const json=run(id,tenant); add.run(id,tenant,`actor-${tenant}`,'normal','1','virtual-van','PASS','onmission.simulation-run.v1',json,'a'.repeat(64));
}
const tenantA=db.prepare("SELECT run_id FROM platform_simulation_runs WHERE owner_scope='tenant' AND tenant_id=? ORDER BY run_id").all(101);
const tenantB=db.prepare("SELECT run_id FROM platform_simulation_runs WHERE owner_scope='tenant' AND tenant_id=? ORDER BY run_id").all(202);
assert.deepEqual(tenantA.map(x=>x.run_id),['sim-tenant-a-0001']);
assert.deepEqual(tenantB.map(x=>x.run_id),['sim-tenant-b-0001']);
assert.throws(()=>db.exec("UPDATE platform_simulation_runs SET status='FAILED' WHERE run_id='sim-tenant-a-0001'"),/SIMULATION_RUNS_IMMUTABLE/);
assert.throws(()=>db.exec("DELETE FROM platform_simulation_runs WHERE run_id='sim-tenant-a-0001'"),/SIMULATION_RUNS_IMMUTABLE/);
db.close();
console.log('16.10.73 tenant-scope SQLite runtime smoke test: PASS');
