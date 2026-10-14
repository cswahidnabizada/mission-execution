import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {assessProductionMissionReadiness} from '../../src/worker/extensions/agentic-layer/agent-production-execution.service.js';
const root=process.cwd();const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const db=new DatabaseSync(':memory:');db.exec(read('database/schema.current.sql'));
const env={DB:{prepare(sql){
  const stmt=db.prepare(sql);
  return {bind(...args){
    return {run(){return stmt.run(...args);},first(){return stmt.get(...args)||null;},all(){return {results:stmt.all(...args)};}};
  }};
}}};
db.prepare("INSERT INTO companies(id,name) VALUES(77,'Production Pilot')").run();
db.prepare("INSERT INTO missions(id,company_id,reference,status,state_version,country_code,sector_code) VALUES(770,77,'P-770','Pending',1,'DE','logistics')").run();
db.prepare(`INSERT INTO agent_customer_pilot_profiles(pilot_id,company_id,country_code,sector_code,name,status,operating_mode,approved_action_codes_json,start_at,end_at) VALUES('pilot-770',77,'DE','logistics','DE Logistics Pilot','ACTIVE','CONTROLLED_EXECUTION','["confirm_arrival"]',datetime('now','-1 minute'),datetime('now','+1 hour'))`).run();
db.prepare(`INSERT INTO agent_pilot_mission_enrollments(pilot_id,company_id,mission_id,status,action_allowlist_json,operator_required) VALUES('pilot-770',77,770,'ENROLLED','["confirm_arrival"]',1)`).run();
let r=await assessProductionMissionReadiness(env,{companyId:77,missionId:770,actionCode:'confirm_arrival'}); assert.equal(r.ready,true);
r=await assessProductionMissionReadiness(env,{companyId:77,missionId:770,actionCode:'start_transit'});assert.equal(r.ready,false);assert(r.checks.some(x=>x.code==='ACTION_ALLOWLISTED'&&!x.ok));
db.prepare("UPDATE agent_customer_pilot_profiles SET operating_mode='RECOMMEND_ONLY' WHERE pilot_id='pilot-770'").run();
r=await assessProductionMissionReadiness(env,{companyId:77,missionId:770,actionCode:'confirm_arrival'});assert.equal(r.ready,false);assert(r.checks.some(x=>x.code==='PILOT_OPERATING_MODE'&&!x.ok));
assert(read('database/migrations/0137_first_production_mission_execution.sql').includes('AGENT_PRODUCTION_EXECUTION_APPEND_ONLY'));
console.log('12.1.0 production execution runtime: PASS');
