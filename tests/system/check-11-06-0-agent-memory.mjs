import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {appendAgentOutcomeEvent} from '../../src/worker/extensions/agentic-layer/agent-outcome-ledger.service.js';
import {getAgentOutcomeMemory,getExecutorOutcomeProfile,getOrganizationOutcomeProfile,getActionOutcomeProfiles} from '../../src/worker/extensions/agentic-layer/agent-memory.service.js';
import {appendAgentDecision} from '../../src/worker/extensions/agentic-layer/agentic-governance.service.js';

const root=process.cwd();
const schema=fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8');
const db=new DatabaseSync(':memory:');
db.exec(schema);
const env={DB:{prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {run(){return stmt.run(...args);},first(){return stmt.get(...args)||null;},all(){return {results:stmt.all(...args)};}};}}},batch(stmts){db.exec('BEGIN');try{for(const stmt of stmts)stmt.run();db.exec('COMMIT');return [];}catch(e){db.exec('ROLLBACK');throw e;}}}};

db.prepare(`INSERT INTO agentic_control_config(id,version,mode,autonomy_level,execution_enabled,policy_version,updated_by_role,updated_by_id) VALUES(1,1,'RECOMMEND_ONLY',1,0,'11.06.0-BASELINE','system','test')`).run();
db.prepare(`INSERT INTO companies(id,name) VALUES(7,'Memory Test Company'),(8,'Other Company')`).run();
const executorId=Number(db.prepare(`INSERT INTO public_executor_identities(login,email,display_name,password_hash,password_salt) VALUES('memory-exec@test.invalid','memory-exec@test.invalid','Memory Executor','x','x')`).run().lastInsertRowid);
db.prepare(`INSERT INTO public_executor_profiles(executor_id,registered_company_name,company_category,working_cities,working_zip_codes,mobile,description,country_code) VALUES(?,?,?,?,?,?,?,'DE')`).run(executorId,'Memory Executor GmbH','logistics','[]','[]','','');
db.prepare(`INSERT INTO missions(id,company_id,reference,status) VALUES(42,7,'MEMORY-42','Pending')`).run();
db.prepare(`INSERT INTO mission_assignments(company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,status,version,source_type) VALUES(7,42,'executor','executor',?,7,'active',1,'test')`).run(executorId);

db.exec(`CREATE TRIGGER agent_outcome_events_no_update BEFORE UPDATE ON agent_outcome_events BEGIN SELECT RAISE(ABORT, 'AGENT_OUTCOME_EVENT_APPEND_ONLY'); END; CREATE TRIGGER agent_outcome_events_no_delete BEFORE DELETE ON agent_outcome_events BEGIN SELECT RAISE(ABORT, 'AGENT_OUTCOME_EVENT_APPEND_ONLY'); END; CREATE TRIGGER agent_decision_events_no_update BEFORE UPDATE ON agent_decision_events BEGIN SELECT RAISE(ABORT, 'AGENT_DECISION_EVENT_APPEND_ONLY'); END; CREATE TRIGGER agent_decision_events_no_delete BEFORE DELETE ON agent_decision_events BEGIN SELECT RAISE(ABORT, 'AGENT_DECISION_EVENT_APPEND_ONLY'); END;`);

await appendAgentDecision(env,{decisionId:'mem-1',companyId:7,missionId:42,executorId,actionCode:'message',agentId:'test-agent',contextHash:'mem-context-1',intent:{goal:'progress'},plan:{steps:['message']}});
await appendAgentDecision(env,{decisionId:'mem-2',companyId:7,missionId:42,executorId,actionCode:'message',agentId:'test-agent',contextHash:'mem-context-2',intent:{goal:'progress'},plan:{steps:['message']}});
await appendAgentDecision(env,{decisionId:'mem-3',companyId:7,missionId:42,executorId,actionCode:'message',agentId:'test-agent',contextHash:'mem-context-3',intent:{goal:'progress'},plan:{steps:['message']}});
await appendAgentOutcomeEvent(env,{decisionId:'mem-1',companyId:7,missionId:42,executorId,actionCode:'message',contextHash:'mem-context-1',executionStatus:'EXECUTED',outcomeCode:'PROGRESSED',outcomeConfidence:'HIGH',occurredAt:'2026-09-27T20:00:00Z'});
await appendAgentOutcomeEvent(env,{decisionId:'mem-2',companyId:7,missionId:42,executorId,actionCode:'message',contextHash:'mem-context-2',executionStatus:'EXECUTED',outcomeCode:'WORSENED',outcomeConfidence:'HIGH',occurredAt:'2026-09-27T20:01:00Z'});
await appendAgentOutcomeEvent(env,{decisionId:'mem-3',companyId:7,missionId:42,executorId,actionCode:'message',contextHash:'mem-context-3',executionStatus:'UNKNOWN',outcomeCode:'UNKNOWN',outcomeConfidence:'LOW',occurredAt:'2026-09-27T20:02:00Z'});

const executor=await getExecutorOutcomeProfile(env,7,executorId);
assert.equal(executor.observedOutcomes,3);
assert.equal(executor.knownOutcomes,2);
assert.equal(executor.favorableOutcomes,1);
assert.equal(executor.adverseOutcomes,1);
assert.equal(executor.unknownOutcomes,1);
assert.equal(executor.favorableRate,0.5,'UNKNOWN must not enter favorable rate');
assert.equal(executor.executedEvents,2);

const org=await getOrganizationOutcomeProfile(env,7);
assert.equal(org.observedOutcomes,3);
assert.equal(org.favorableRate,0.5);

const actions=await getActionOutcomeProfiles(env,7,['message','navigate']);
assert.equal(actions.length,1);
assert.equal(actions[0].actionCode,'message');
assert.equal(actions[0].observedOutcomes,3);

const memory=await getAgentOutcomeMemory(env,{companyId:7,executorId,actionCodes:['message','navigate']});
assert.equal(memory.derivedOnly,true);
assert.equal(memory.organization.companyId,7);
assert.equal(memory.executor.executorId,executorId);
assert.equal(memory.actions.length,1);
assert.equal(memory.learningBoundary.noAuthorizationInference,true);

await assert.rejects(()=>appendAgentOutcomeEvent(env,{decisionId:'mem-1',companyId:8,missionId:42,executorId,actionCode:'message',contextHash:'mem-context-1',executionStatus:'EXECUTED',outcomeCode:'PROGRESSED'}),e=>e.code==='AGENT_OUTCOME_TENANT_MISMATCH');
await assert.rejects(()=>appendAgentOutcomeEvent(env,{decisionId:'mem-2',companyId:7,missionId:42,executorId,actionCode:'message',contextHash:'wrong',executionStatus:'EXECUTED',outcomeCode:'PROGRESSED'}),e=>e.code==='AGENT_OUTCOME_CONTEXT_HASH_MISMATCH');

const profileCount=db.prepare(`SELECT COUNT(*) count FROM agent_executor_outcome_profiles WHERE company_id=7 AND executor_id=?`).get(executorId).count;
assert.equal(profileCount,1);
const orgCount=db.prepare(`SELECT COUNT(*) count FROM agent_organization_outcome_profiles WHERE company_id=7`).get().count;
assert.equal(orgCount,1);
const actionCount=db.prepare(`SELECT COUNT(*) count FROM agent_action_outcome_profiles WHERE company_id=7 AND action_code='message'`).get().count;
assert.equal(actionCount,1);

// Derived profile rows are intentionally mutable projections; only the source ledger is append-only.

console.log('11.06.0 agent memory: PASS');
console.log('Executor, organization and action profiles are derived atomically from the append-only outcome ledger; UNKNOWN is excluded from favorable rates and tenant boundaries are enforced.');
