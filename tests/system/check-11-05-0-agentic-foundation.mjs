import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {appendAgentOutcomeEvent} from '../../src/worker/extensions/agentic-layer/agent-outcome-ledger.service.js';
import {appendAgentDecision} from '../../src/worker/extensions/agentic-layer/agentic-governance.service.js';
import {allActionDefinitions} from '../../src/worker/application/actions/action-registry.js';

const root=process.cwd();
const schema=fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8');
const db=new DatabaseSync(':memory:');
db.exec(schema);
const env={DB:{prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {run(){return stmt.run(...args);},first(){return stmt.get(...args)||null;},all(){return {results:stmt.all(...args)};}};}}},batch(stmts){db.exec('BEGIN');try{for(const stmt of stmts)stmt.run();db.exec('COMMIT');return [];}catch(e){db.exec('ROLLBACK');throw e;}}}};
db.prepare(`INSERT INTO agentic_control_config(id,version,mode,autonomy_level,execution_enabled,policy_version,updated_by_role,updated_by_id) VALUES(1,1,'RECOMMEND_ONLY',1,0,'11.05.1-BASELINE','system','test')`).run();
db.exec(`CREATE TRIGGER agent_outcome_events_no_update BEFORE UPDATE ON agent_outcome_events BEGIN SELECT RAISE(ABORT, 'AGENT_OUTCOME_EVENT_APPEND_ONLY'); END; CREATE TRIGGER agent_outcome_events_no_delete BEFORE DELETE ON agent_outcome_events BEGIN SELECT RAISE(ABORT, 'AGENT_OUTCOME_EVENT_APPEND_ONLY'); END; CREATE TRIGGER agent_decision_events_no_update BEFORE UPDATE ON agent_decision_events BEGIN SELECT RAISE(ABORT, 'AGENT_DECISION_EVENT_APPEND_ONLY'); END; CREATE TRIGGER agent_decision_events_no_delete BEFORE DELETE ON agent_decision_events BEGIN SELECT RAISE(ABORT, 'AGENT_DECISION_EVENT_APPEND_ONLY'); END;`);

db.prepare(`INSERT INTO companies(id,name) VALUES(7,'Test Company')`).run();
const execId=db.prepare(`INSERT INTO public_executor_identities(login,email,display_name,password_hash,password_salt) VALUES('exec@test.invalid','exec@test.invalid','Test Executor','x','x')`).run().lastInsertRowid;
db.prepare(`INSERT INTO public_executor_profiles(executor_id,registered_company_name,company_category,working_cities,working_zip_codes,mobile,description,country_code) VALUES(?,?,?,?,?,?,?,'DE')`).run(Number(execId),'Test Executor GmbH','logistics','[]','[]','','');
db.prepare(`INSERT INTO missions(id,company_id,reference,status) VALUES(42,7,'TEST-42','Pending')`).run();
db.prepare(`INSERT INTO mission_assignments(company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,status,version,source_type) VALUES(7,42,'executor','executor',?,7,'active',1,'test')`).run(Number(execId));

const actionCatalog=allActionDefinitions();
// 11.05.1 requires every outcome to correspond to a recorded agent decision.
await appendAgentDecision(env,{decisionId:'decision-1',companyId:7,missionId:42,executorId:Number(execId),actionCode:actionCatalog[0].code,agentId:'test-agent',contextHash:'ctx-hash',intent:{goal:'progress'},plan:{steps:[actionCatalog[0].code]}});
await appendAgentDecision(env,{decisionId:'decision-2',companyId:7,missionId:42,executorId:Number(execId),actionCode:actionCatalog[1].code,agentId:'test-agent',contextHash:'ctx-hash-2',intent:{goal:'progress'},plan:{steps:[actionCatalog[1].code]}});
assert.equal(actionCatalog.length,64,'Agentic layer must see the complete governed canonical action catalog');
assert(actionCatalog.every(a=>a.canonical!==false),'Agent catalog contains non-canonical actions');

const first=await appendAgentOutcomeEvent(env,{decisionId:'decision-1',companyId:7,missionId:42,executorId:Number(execId),actionCode:actionCatalog[0].code,contextVersion:'1.0',contextHash:'ctx-hash',intent:{goal:'progress'},plan:{steps:[actionCatalog[0].code]},authorization:{decision:'ALLOW'},executionStatus:'EXECUTED',outcomeCode:'PROGRESSED',outcomeConfidence:'HIGH',evidence:[{type:'canonical_state_change'}]});
assert.equal(first.created,true);
assert.equal(first.idempotent,false);

await assert.rejects(()=>appendAgentOutcomeEvent(env,{decisionId:'decision-1',companyId:7,missionId:42,actionCode:actionCatalog[0].code,contextVersion:'1.0',contextHash:'different',executionStatus:'FAILED',outcomeCode:'UNKNOWN'}),e=>e.code==='AGENT_OUTCOME_CONTEXT_HASH_MISMATCH');
const retry=await appendAgentOutcomeEvent(env,{decisionId:'decision-1',companyId:7,missionId:42,actionCode:actionCatalog[0].code,contextVersion:'1.0',contextHash:'ctx-hash',executionStatus:'FAILED',outcomeCode:'UNKNOWN'});
assert.equal(retry.idempotent,true,'Decision IDs must be idempotent when the bound request matches');
assert.equal(retry.eventHash,first.eventHash);

const row=db.prepare('SELECT * FROM agent_outcome_events WHERE decision_id=?').get('decision-1');
assert.equal(row.company_id,7);
assert.equal(row.mission_id,42);
assert.equal(row.outcome_code,'PROGRESSED');
assert.equal(row.previous_event_hash,null);
assert.ok(row.event_hash);

assert.throws(()=>db.prepare('UPDATE agent_outcome_events SET outcome_code=? WHERE decision_id=?').run('WORSENED','decision-1'),/AGENT_OUTCOME_EVENT_APPEND_ONLY/);
assert.throws(()=>db.prepare('DELETE FROM agent_outcome_events WHERE decision_id=?').run('decision-1'),/AGENT_OUTCOME_EVENT_APPEND_ONLY/);

const secondEvent=await appendAgentOutcomeEvent(env,{decisionId:'decision-2',companyId:7,missionId:42,actionCode:actionCatalog[1].code,contextVersion:'1.0',contextHash:'ctx-hash-2',executionStatus:'BLOCKED',outcomeCode:'BLOCKED',outcomeConfidence:'MEDIUM'});
const row2=db.prepare('SELECT previous_event_hash,event_hash FROM agent_outcome_events WHERE decision_id=?').get('decision-2');
assert.equal(row2.previous_event_hash,first.eventHash,'Outcome ledger must preserve per-company hash chain');
assert.ok(secondEvent.eventHash);

const contextSource=fs.readFileSync(path.join(root,'src/worker/extensions/agentic-layer/agentic-context.service.js'),'utf8');
for(const required of ['getForSession','resolveMissionAccess','orchestrateMissionFlow','actionContractForMissionIntelligence','coordinateMissionEngines','buildMissionContext'])assert(contextSource.includes(required),`Agent context missing canonical source: ${required}`);
assert(contextSource.includes("derivedOnly:true"));
assert(contextSource.includes('getAgenticControl'));
assert(contextSource.includes('agentExecutionEligible'));
assert(contextSource.includes('highImpactAutonomy:false'));
assert(contextSource.includes("authorizationRequired:true"));
assert(contextSource.includes("verificationRequired:true"));

const routes=fs.readFileSync(path.join(root,'src/worker/extensions/agentic-layer/agentic-layer.routes.js'),'utf8');
assert(routes.includes('agent\\/context\\/missions'));
assert(routes.includes('agent\\/outcomes'));
const execution=fs.readFileSync(path.join(root,'src/worker/application/actions/canonical-action.application.service.js'),'utf8');
assert(execution.includes('appendOutcomeFromCanonicalExecution'));
assert(execution.includes('X-ON-Agent-Decision-ID'));

console.log('11.05.0/11.05.1 agentic foundation compatibility: PASS');
console.log('Context surface is derived from canonical mission/action authorities; outcome ledger is append-only and hash chained.');
