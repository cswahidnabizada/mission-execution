import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {appendAgentDecision} from '../../src/worker/extensions/agentic-layer/agentic-governance.service.js';
import {appendAgentOutcomeEvent} from '../../src/worker/extensions/agentic-layer/agent-outcome-ledger.service.js';
import {recalibrateAgentSignals,getAgentCalibration,AGENT_RECALIBRATION_VERSION} from '../../src/worker/extensions/agentic-layer/agent-recalibration.service.js';

const root=process.cwd();
const schema=fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8');
const db=new DatabaseSync(':memory:');db.exec(schema);
const env={DB:{prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {run(){return stmt.run(...args);},first(){return stmt.get(...args)||null;},all(){return {results:stmt.all(...args)};}};}}},batch(stmts){db.exec('BEGIN');try{for(const stmt of stmts)stmt.run();db.exec('COMMIT');return [];}catch(e){db.exec('ROLLBACK');throw e;}}}};
db.prepare(`INSERT INTO agentic_control_config(id,version,mode,autonomy_level,execution_enabled,policy_version,updated_by_role,updated_by_id) VALUES(1,1,'RECOMMEND_ONLY',1,0,'11.09.0-BASELINE','system','test')`).run();
db.exec(`CREATE TRIGGER agent_calibration_observations_no_update BEFORE UPDATE ON agent_calibration_observations BEGIN SELECT RAISE(ABORT, 'AGENT_CALIBRATION_OBSERVATION_APPEND_ONLY'); END; CREATE TRIGGER agent_calibration_observations_no_delete BEFORE DELETE ON agent_calibration_observations BEGIN SELECT RAISE(ABORT, 'AGENT_CALIBRATION_OBSERVATION_APPEND_ONLY'); END;`);

db.prepare(`INSERT INTO companies(id,name) VALUES(7,'Recalibration Test Company'),(8,'Other Company')`).run();
db.prepare(`INSERT INTO missions(id,company_id,reference,status) VALUES(42,7,'RECAL-42','In Progress'),(43,8,'OTHER-43','In Progress')`).run();

for(let i=1;i<=5;i++){
  const decisionId=`recal-good-${i}`;
  await appendAgentDecision(env,{decisionId,companyId:7,missionId:42,actionCode:'message',agentId:'recal-agent',contextHash:`ctx-${i}`,confidence:'HIGH',intent:{goal:'progress'},plan:{steps:['message']}});
  await appendAgentOutcomeEvent(env,{decisionId,companyId:7,missionId:42,actionCode:'message',contextHash:`ctx-${i}`,executionStatus:'EXECUTED',outcomeCode:'PROGRESSED',outcomeConfidence:'HIGH',occurredAt:`2026-09-27T20:0${i}:00Z`});
}
const unknownDecision='recal-unknown';
await appendAgentDecision(env,{decisionId:unknownDecision,companyId:7,missionId:42,actionCode:'message',agentId:'recal-agent',contextHash:'ctx-u',confidence:'HIGH',intent:{goal:'progress'},plan:{steps:['message']}});
await appendAgentOutcomeEvent(env,{decisionId:unknownDecision,companyId:7,missionId:42,actionCode:'message',contextHash:'ctx-u',executionStatus:'UNKNOWN',outcomeCode:'UNKNOWN',outcomeConfidence:'LOW',occurredAt:'2026-09-27T20:06:00Z'});

const first=await recalibrateAgentSignals(env,{companyId:7,limit:100});
assert.equal(first.status,'COMPLETED');
assert.equal(first.version,AGENT_RECALIBRATION_VERSION);
assert.equal(first.processedEvents,6);
assert.equal(first.newObservations,6);
assert.equal(first.profilesUpdated,2);

let profiles=await getAgentCalibration(env,{companyId:7,scopeType:'ACTION',limit:10});
assert.equal(profiles.length,1);
let p=profiles[0];
assert.equal(p.sampleCount,6);
assert.equal(p.knownCount,5);
assert.equal(p.correctCount,5);
assert.equal(p.incorrectCount,0);
assert.equal(p.unknownCount,1);
assert.equal(p.inconclusiveCount,0);
assert.equal(p.accuracy,1);
assert.equal(p.deferenceState,'TRUSTED');
assert.equal(p.derivedOnly,true);
assert.equal(p.noAuthorizationInference,true);

const second=await recalibrateAgentSignals(env,{companyId:7,limit:100});
assert.equal(second.newObservations,0,'recalibration must be idempotent');
assert.equal(second.processedEvents,0);

const adverseDecision='recal-adverse';
await appendAgentDecision(env,{decisionId:adverseDecision,companyId:7,missionId:42,actionCode:'message',agentId:'recal-agent',contextHash:'ctx-a',confidence:'HIGH',intent:{goal:'progress'},plan:{steps:['message']}});
await appendAgentOutcomeEvent(env,{decisionId:adverseDecision,companyId:7,missionId:42,actionCode:'message',contextHash:'ctx-a',executionStatus:'EXECUTED',outcomeCode:'WORSENED',outcomeConfidence:'HIGH',occurredAt:'2026-09-27T20:07:00Z'});
const third=await recalibrateAgentSignals(env,{companyId:7,limit:100});
assert.equal(third.newObservations,1);
profiles=await getAgentCalibration(env,{companyId:7,scopeType:'ACTION',limit:10});
p=profiles[0];
assert.equal(p.sampleCount,7);
assert.equal(p.knownCount,6);
assert.equal(p.correctCount,5);
assert.equal(p.incorrectCount,1);
assert.equal(p.accuracy,0.8333);
assert.equal(p.deferenceState,'CAUTION');

const org=await getAgentCalibration(env,{companyId:7,scopeType:'ORGANIZATION',limit:10});
assert.equal(org.length,1);
assert.equal(org[0].companyId,7);
assert.equal(org[0].noAuthorizationInference,true);

const other=await getAgentCalibration(env,{companyId:8,scopeType:'ACTION'});
assert.equal(other.length,0);
const cross=db.prepare(`SELECT COUNT(*) AS count FROM agent_calibration_observations WHERE company_id=8`).get().count;
assert.equal(cross,0);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM agent_calibration_runs WHERE company_id=7`).get().count,3);

assert.throws(()=>db.prepare(`UPDATE agent_calibration_observations SET evaluation_class='INCORRECT' WHERE decision_id=?`).run('recal-good-1'),/AGENT_CALIBRATION_OBSERVATION_APPEND_ONLY/);
assert.throws(()=>db.prepare(`DELETE FROM agent_calibration_observations WHERE decision_id=?`).run('recal-good-1'),/AGENT_CALIBRATION_OBSERVATION_APPEND_ONLY/);

console.log('11.09.0 recalibration: PASS');
console.log('Outcome-derived reliability is tenant-scoped, append-only at observation level, sample-aware, conservative about UNKNOWN/blocked execution, and advisory-only.');
