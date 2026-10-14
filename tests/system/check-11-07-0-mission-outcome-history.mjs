import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {appendAgentDecision} from '../../src/worker/extensions/agentic-layer/agentic-governance.service.js';
import {appendAgentOutcomeEvent} from '../../src/worker/extensions/agentic-layer/agent-outcome-ledger.service.js';
import {getAgentMissionOutcomeHistory} from '../../src/worker/extensions/agentic-layer/mission-outcome-history.service.js';

const root=process.cwd();
const schema=fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8');
const db=new DatabaseSync(':memory:');
db.exec(schema);
const env={DB:{prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {run(){return stmt.run(...args);},first(){return stmt.get(...args)||null;},all(){return {results:stmt.all(...args)};}};}}},batch(stmts){db.exec('BEGIN');try{for(const stmt of stmts)stmt.run();db.exec('COMMIT');return [];}catch(e){db.exec('ROLLBACK');throw e;}}}};

db.prepare(`INSERT INTO agentic_control_config(id,version,mode,autonomy_level,execution_enabled,policy_version,updated_by_role,updated_by_id) VALUES(1,1,'RECOMMEND_ONLY',1,0,'11.07.0-BASELINE','system','test')`).run();
db.prepare(`INSERT INTO companies(id,name) VALUES(7,'History Test Company'),(8,'Other Company')`).run();
db.prepare(`INSERT INTO missions(id,company_id,reference,status,state_version,created_at,updated_at) VALUES(42,7,'HISTORY-42','In Progress',3,'2026-09-27T19:00:00Z','2026-09-27T20:05:00Z'),(43,8,'OTHER-43','Completed',4,'2026-09-27T19:00:00Z','2026-09-27T20:05:00Z')`).run();
db.prepare(`INSERT INTO mission_status_history(mission_id,status,created_at) VALUES(42,'Pending','2026-09-27T19:00:00Z'),(42,'In Progress','2026-09-27T19:05:00Z'),(42,'Blocked','2026-09-27T20:00:00Z'),(42,'In Progress','2026-09-27T20:04:00Z')`).run();
db.prepare(`INSERT INTO mission_event_ledger(event_key,transition_key,company_id,mission_id,action_code,outcome,actor_role,from_status,to_status,state_token_before,state_token_after,created_at,committed_at) VALUES('evt-1','tr-1',7,42,'start_mission','committed','admin','Pending','In Progress','v:1','v:2','2026-09-27T19:05:00Z','2026-09-27T19:05:01Z'),('evt-2','tr-2',7,42,'recover_mission','committed','admin','Blocked','In Progress','v:2','v:3','2026-09-27T20:04:00Z','2026-09-27T20:04:01Z')`).run();
db.prepare(`INSERT INTO mission_evidence_events(mission_id,company_id,evidence_type,event_code,actor_type,actor_id,metadata_json,created_at) VALUES(42,7,'proof','delivery_proof','executor',10,'{"fileId":99}','2026-09-27T20:04:02Z')`).run();
db.prepare(`INSERT INTO mission_exceptions(company_id,mission_id,exception_type,status,created_by_role,created_at,note) VALUES(7,42,'delay','resolved','admin','2026-09-27T20:00:01Z','Recovered')`).run();

await appendAgentDecision(env,{decisionId:'hist-1',companyId:7,missionId:42,actionCode:'message',agentId:'history-agent',contextHash:'ctx-1',intent:{goal:'resolve'},plan:{steps:['message']}});
await appendAgentDecision(env,{decisionId:'hist-2',companyId:7,missionId:42,actionCode:'message',agentId:'history-agent',contextHash:'ctx-2',intent:{goal:'recover'},plan:{steps:['message']}});
await appendAgentOutcomeEvent(env,{decisionId:'hist-1',companyId:7,missionId:42,actionCode:'message',contextHash:'ctx-1',executionStatus:'EXECUTED',outcomeCode:'WORSENED',outcomeConfidence:'HIGH',stateVersionBefore:2,stateVersionAfter:2,evidence:[{kind:'notice'}],occurredAt:'2026-09-27T20:00:00Z'});
await appendAgentOutcomeEvent(env,{decisionId:'hist-2',companyId:7,missionId:42,actionCode:'message',contextHash:'ctx-2',executionStatus:'EXECUTED',outcomeCode:'PROGRESSED',outcomeConfidence:'HIGH',stateVersionBefore:2,stateVersionAfter:3,evidence:[{kind:'recovery'}],occurredAt:'2026-09-27T20:04:00Z'});

const history=await getAgentMissionOutcomeHistory(env,{companyId:7,missionId:42,limit:20});
assert.equal(history.derivedOnly,true);
assert.equal(history.authoritative,false);
assert.equal(history.trajectory.length,2);
assert.equal(history.trajectory[0].outcome.code,'WORSENED');
assert.equal(history.trajectory[0].recovery.required,true);
assert.equal(history.trajectory[0].recovery.observed,true);
assert.equal(history.trajectory[1].outcome.code,'PROGRESSED');
assert.equal(history.nextSituation.status,'In Progress');
assert.equal(history.summary.unknownAgentOutcomes,0);
assert.ok(history.timeline.some(x=>x.kind==='TRANSITION'&&x.action==='recover_mission'));
assert.ok(history.timeline.some(x=>x.kind==='EVIDENCE'&&x.code==='delivery_proof'));
assert.ok(history.timeline.some(x=>x.kind==='EXCEPTION'&&x.status==='resolved'));
assert.equal(history.learningBoundary.noAuthorizationInference,true);

await assert.rejects(()=>getAgentMissionOutcomeHistory(env,{companyId:8,missionId:42}),e=>e.code==='AGENT_HISTORY_MISSION_NOT_FOUND');
await assert.rejects(()=>getAgentMissionOutcomeHistory(env,{companyId:7,missionId:43}),e=>e.code==='AGENT_HISTORY_MISSION_NOT_FOUND');

console.log('11.07.0 mission outcome history: PASS');
console.log('Mission trajectory composes canonical status/transition/evidence sources with verified agent outcomes; recovery signals are evidence-based and tenant scoped.');
