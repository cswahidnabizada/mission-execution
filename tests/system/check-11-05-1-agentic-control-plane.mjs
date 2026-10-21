import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {appendAgentDecision,authorizeAgentExecution,updateAgenticControl,getAgenticControl} from '../../src/worker/extensions/agentic-layer/agentic-governance.service.js';

const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('VERSION').trim();
assert.ok(['11.06.0','11.07.0','11.08.0','11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.60','16.10.65','16.10.66','16.10.67','16.10.68','16.10.69','16.10.70','16.10.71','16.10.72','16.10.73','16.10.74','16.10.75','16.10.76','16.10.77','16.10.78','16.10.79','16.10.80','16.10.81','16.10.82','16.10.83','16.10.84','16.10.85','16.10.86','16.10.87','16.10.88','16.10.89','16.10.90','16.10.91','16.10.92','16.10.93','16.10.94'].includes(version));
assert.equal(JSON.parse(read('package.json')).version,version);

const schema=read('database/schema.current.sql');
const db=new DatabaseSync(':memory:');
db.exec(schema);
db.exec(`
CREATE TRIGGER agent_outcome_events_no_update BEFORE UPDATE ON agent_outcome_events BEGIN SELECT RAISE(ABORT, 'AGENT_OUTCOME_EVENT_APPEND_ONLY'); END;
CREATE TRIGGER agent_outcome_events_no_delete BEFORE DELETE ON agent_outcome_events BEGIN SELECT RAISE(ABORT, 'AGENT_OUTCOME_EVENT_APPEND_ONLY'); END;
CREATE TRIGGER agent_decision_events_no_update BEFORE UPDATE ON agent_decision_events BEGIN SELECT RAISE(ABORT, 'AGENT_DECISION_EVENT_APPEND_ONLY'); END;
CREATE TRIGGER agent_decision_events_no_delete BEFORE DELETE ON agent_decision_events BEGIN SELECT RAISE(ABORT, 'AGENT_DECISION_EVENT_APPEND_ONLY'); END;`);
db.prepare(`INSERT INTO agentic_control_config(id,version,mode,autonomy_level,execution_enabled,policy_version,updated_by_role,updated_by_id) VALUES(1,1,'RECOMMEND_ONLY',1,0,'11.06.0-BASELINE','system','test')`).run();
const env={DB:{prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {run(){return stmt.run(...args);},first(){return stmt.get(...args)||null;},all(){return {results:stmt.all(...args)};}};}}}}};

const migration=read('database/migrations/0126_agentic_control_plane.sql');
for(const token of ['agentic_control_config','agent_decision_events','AGENT_DECISION_EVENT_APPEND_ONLY'])assert(migration.includes(token),`missing ${token}`);
const governance=read('src/worker/extensions/agentic-layer/agentic-governance.service.js');
for(const token of ['RECOMMEND_ONLY','CONTROLLED_EXECUTION','appendAgentDecision','authorizeAgentExecution','AGENT_HIGH_IMPACT_REQUIRES_HUMAN_APPROVAL','AGENT_EXECUTION_DISABLED'])assert(governance.includes(token),`missing ${token}`);
const routes=read('src/worker/extensions/agentic-layer/agentic-control.routes.js');
for(const token of ['/api/platform/admin/agentic-control','/api/platform/admin/agentic-control/config','/api/agent/decisions','requirePlatformSuperAdminStepUp'])assert(routes.includes(token),`missing ${token}`);
const app=read('src/worker/app.js');assert(app.includes('registerAgenticControlRoutes'),'agentic control routes not wired');
const canonical=read('src/worker/application/actions/canonical-action.application.service.js');
for(const token of ['authorizeAgentExecution','AGENT_CONTEXT_HASH_REQUIRED','AGENT_CONTEXT_HASH_MISMATCH'])assert(canonical.includes(token),`missing execution gate ${token}`);
const registry=read('public/assets/js/frontend/admin/workspace-registry.js');assert(registry.includes("'agentic-control'"),'agentic control workspace missing');
const panel=read('public/assets/js/frontend/admin/panel-registry.js');assert(panel.includes('renderAgenticControl'),'agentic control renderer missing');

db.prepare(`INSERT OR IGNORE INTO companies(id,name) VALUES(7,'Test Company')`).run();
db.prepare(`INSERT OR IGNORE INTO jurisdiction_policies(code,country_code,framework_code,effective_version,status) VALUES('TEST-DE','DE','TEST','11.16.0','active')`).run();
db.prepare(`INSERT OR REPLACE INTO agent_company_autonomy_config(company_id,mode,autonomy_level,execution_enabled,kill_switch_reason,policy_version,updated_by_role,updated_by_id) VALUES(7,'CONTROLLED_EXECUTION',3,1,NULL,'11.16.0','system','test')`).run();
db.prepare(`INSERT OR REPLACE INTO agent_action_autonomy_policies(action_code,scope_type,scope_key,max_autonomy_level,execution_enabled,human_approval_required,verification_required,provider_required,recovery_policy,jurisdiction_mode,policy_version,active,updated_by_role,updated_by_id) VALUES('message','GLOBAL','*',3,1,0,1,0,'REASSESS','POLICY_REQUIRED','11.16.0',1,'system','test')`).run();

const decision=await appendAgentDecision(env,{decisionId:'ctl-safe-1',companyId:7,missionId:42,actionCode:'message',agentId:'test-agent',contextHash:'ctx-1',intent:{goal:'notify'},plan:{steps:['message']},confidence:'HIGH'});
assert.equal(decision.created,true);
assert.equal(decision.riskClass,'LOW_RISK');
assert.equal((await getAgenticControl(env)).executionEnabled,false);
await assert.rejects(()=>authorizeAgentExecution(env,{decisionId:'ctl-safe-1',companyId:7,missionId:42,actionCode:'message'}),e=>e.code==='AGENT_EXECUTION_DISABLED');

const enabled=await updateAgenticControl(env,{role:'platform_super_administrator',id:'admin-1'},{mode:'CONTROLLED_EXECUTION',autonomyLevel:3,executionEnabled:true,policyVersion:'11.06.0-CONTROLLED'},'req-1');
assert.equal(enabled.executionEnabled,true);
assert.equal(enabled.autonomyLevel,3);
const allowed=await authorizeAgentExecution(env,{decisionId:'ctl-safe-1',companyId:7,missionId:42,actionCode:'message',countryCode:'DE',sectorCode:'general'});
assert.equal(allowed.allowed,true);
assert.equal(allowed.control.autonomyLevel,3);

const high=await appendAgentDecision(env,{decisionId:'ctl-high-1',companyId:7,missionId:42,actionCode:'delete_mission',agentId:'test-agent',contextHash:'ctx-2',intent:{goal:'cleanup'},plan:{steps:['delete_mission']},confidence:'HIGH'});
assert.equal(high.riskClass,'HIGH_IMPACT');
await updateAgenticControl(env,{role:'platform_super_administrator',id:'admin-1'},{mode:'CONTROLLED_EXECUTION',autonomyLevel:5,executionEnabled:true,policyVersion:'11.06.0-CONTROLLED'},'req-2');
await assert.rejects(()=>authorizeAgentExecution(env,{decisionId:'ctl-high-1',companyId:7,missionId:42,actionCode:'delete_mission',countryCode:'DE',sectorCode:'general'}),e=>['AGENT_HIGH_IMPACT_REQUIRES_HUMAN_APPROVAL','AGENT_AUTONOMY_POLICY_DEFERRED'].includes(e.code));

await assert.rejects(()=>authorizeAgentExecution(env,{decisionId:'ctl-safe-1',companyId:8,missionId:42,actionCode:'message'}),e=>e.code==='AGENT_DECISION_TENANT_MISMATCH');
await assert.rejects(()=>authorizeAgentExecution(env,{decisionId:'ctl-safe-1',companyId:7,missionId:99,actionCode:'message'}),e=>e.code==='AGENT_DECISION_MISSION_MISMATCH');
await assert.rejects(()=>authorizeAgentExecution(env,{decisionId:'ctl-safe-1',companyId:7,missionId:42,actionCode:'navigate'}),e=>e.code==='AGENT_DECISION_ACTION_MISMATCH');

assert.throws(()=>db.prepare('UPDATE agent_decision_events SET action_code=? WHERE decision_id=?').run('navigate','ctl-safe-1'),/AGENT_DECISION_EVENT_APPEND_ONLY/);
assert.throws(()=>db.prepare('DELETE FROM agent_decision_events WHERE decision_id=?').run('ctl-safe-1'),/AGENT_DECISION_EVENT_APPEND_ONLY/);
assert.equal(db.prepare('SELECT COUNT(*) count FROM admin_control_audit_events WHERE resource_type=?').get('agentic_control').count,2);

console.log('11.05.1 agentic control plane compatibility: PASS');
