import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {appendAgentOutcomeEvent} from '../../src/worker/extensions/agentic-layer/agent-outcome-ledger.service.js';
import {appendAgentDecision} from '../../src/worker/extensions/agentic-layer/agentic-governance.service.js';
import {learnFromAgentOutcomes,getAgentLearningProfiles,resolveAgentOutcome} from '../../src/worker/extensions/agentic-layer/agent-learning.service.js';
const root=process.cwd();const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const db=new DatabaseSync(':memory:');db.exec(read('database/schema.current.sql'));
const env={DB:{prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {run(){return stmt.run(...args);},first(){return stmt.get(...args)||null;},all(){return {results:stmt.all(...args)};}};}}},batch(stmts){db.exec('BEGIN');try{for(const stmt of stmts)stmt.run();db.exec('COMMIT');return [];}catch(e){db.exec('ROLLBACK');throw e;}}}};
db.prepare("INSERT INTO companies(id,name) VALUES(7,'Learning Customer')").run();
db.prepare("INSERT INTO agentic_control_config(id,version,mode,autonomy_level,execution_enabled,policy_version,updated_by_role,updated_by_id) VALUES(1,1,'RECOMMEND_ONLY',1,0,'11.18.0-BASELINE','system','test')").run();
for(let i=1;i<=5;i++){
  const decisionId=`learn-${i}`;
  await appendAgentDecision(env,{decisionId,companyId:7,missionId:42,actionCode:'message',agentId:'learning-agent',contextHash:`ctx-${i}`,confidence:'HIGH',intent:{goal:'progress'},plan:{steps:['message']}});
  await appendAgentOutcomeEvent(env,{decisionId,companyId:7,missionId:42,actionCode:'message',contextHash:`ctx-${i}`,executionStatus:'EXECUTED',outcomeCode:i===5?'RESOLVED':'PROGRESSED',outcomeConfidence:'HIGH'});
}
const unknownDecision='learn-unknown';
await appendAgentDecision(env,{decisionId:unknownDecision,companyId:7,missionId:42,actionCode:'message',agentId:'learning-agent',contextHash:'ctx-u',confidence:'LOW',intent:{goal:'progress'},plan:{steps:['message']}});
await appendAgentOutcomeEvent(env,{decisionId:unknownDecision,companyId:7,missionId:42,actionCode:'message',contextHash:'ctx-u',executionStatus:'UNKNOWN',outcomeCode:'UNKNOWN',outcomeConfidence:'LOW'});
let result=await learnFromAgentOutcomes(env,{companyId:7,limit:100});assert.equal(result.status,'COMPLETED');assert.equal(result.newObservations,5);assert.equal(result.resolvedUnknowns,0);
let profiles=await getAgentLearningProfiles(env,{companyId:7,actionCode:'message'});assert.equal(profiles.length,1);assert.equal(profiles[0].knownCount,5);assert.equal(profiles[0].learningState,'IMPROVING');assert(profiles[0].learnedWeight>.75);
const resolution=await resolveAgentOutcome(env,{eventId:(await db.prepare("SELECT event_id FROM agent_outcome_events WHERE decision_id=?").get(unknownDecision)).event_id,resolvedOutcomeCode:'BLOCKED',resolutionReason:'Canonical verification established that the expected operational effect was not observed.',evidence:{source:'canonical-verification'},resolverType:'canonical',resolverId:'test'});assert.equal(resolution.created,true);
result=await learnFromAgentOutcomes(env,{companyId:7,limit:100});assert.equal(result.resolvedUnknowns,1);assert.equal(result.newObservations,1);
profiles=await getAgentLearningProfiles(env,{companyId:7,actionCode:'message'});assert.equal(profiles[0].knownCount,6);assert(profiles[0].adverseRate>0);
assert(read('database/migrations/0136_outcome_learning_loop.sql').includes('AGENT_LEARNING_OBSERVATION_APPEND_ONLY'));
assert(read('database/migrations/0136_outcome_learning_loop.sql').includes('AGENT_OUTCOME_RESOLUTION_APPEND_ONLY'));
console.log('11.18.0 outcome/learning runtime: PASS');
