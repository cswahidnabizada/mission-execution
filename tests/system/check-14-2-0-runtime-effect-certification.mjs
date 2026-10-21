import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {certifyMissionJourney,CANONICAL_MISSION_JOURNEY,MISSION_CERTIFICATION_VERSION} from '../../src/worker/extensions/mission-execution-coordinator/mission-certification.service.js';
import {transitionExecutionIntent,EXECUTION_INTENT_VERSION,EXECUTION_EFFECT_INTEGRITY_VERSION} from '../../src/worker/extensions/execution-engine/execution-intent.service.js';

const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('VERSION').trim();
const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));
assert.ok(['14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.60','16.10.65','16.10.66','16.10.67','16.10.68','16.10.69','16.10.70','16.10.71','16.10.72','16.10.73','16.10.74','16.10.75','16.10.76','16.10.77','16.10.78','16.10.79','16.10.80','16.10.81','16.10.82','16.10.83','16.10.84','16.10.85','16.10.86','16.10.87','16.10.88','16.10.89','16.10.90','16.10.91','16.10.92','16.10.93','16.10.94'].includes(version));
assert.equal(pkg.version,version);
assert.equal(lock.version,version);
assert.equal(lock.packages[''].version,version);

const contract=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.contract.js');
assert(contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='15.1.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.5.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.4.0'"));
assert(contract.includes("'OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT_SITUATION'"));
assert(!contract.includes("'POLICY_CHECK'"),'Legacy POLICY_CHECK must not remain in the canonical journey.');

const coordinator=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.service.js');
for(const token of ["phase('EVALUATE'","phase('ACCEPT'","phase('PREPARE'","phase('ASSIGN'","phase('EFFECT'","CANONICAL_EFFECT_COMMITTED","learnFromAgentOutcomes"]) assert(coordinator.includes(token),`coordinator missing ${token}`);
assert(!coordinator.includes("phase('POLICY_CHECK'"),'Coordinator must emit canonical EVALUATE, not legacy POLICY_CHECK.');

const cert=read('src/worker/extensions/mission-execution-coordinator/mission-certification.service.js');
for(const token of ['MISSION_CERTIFICATION_VERSION','GERMANY_LOGISTICS','mission_authority','mission_execution_intents','mission_evidence_events','agent_execution_recovery_events','agent_learning_observations','unknownEffectNotSuccess']) assert(cert.includes(token),`certification authority missing ${token}`);
assert.deepEqual(CANONICAL_MISSION_JOURNEY,['OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT_SITUATION']);
assert(['14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.60','16.10.65','16.10.66'].includes(MISSION_CERTIFICATION_VERSION));
assert.equal(EXECUTION_INTENT_VERSION,'12.9.0');
assert.equal(EXECUTION_EFFECT_INTEGRITY_VERSION,'14.2.0');

const routes=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.routes.js');
assert(routes.includes('/certification'),'Mission certification route missing.');
const loop=read('src/worker/extensions/mission-execution-coordinator/mission-operating-loop.service.js');
assert(loop.includes('certifyMissionJourney'),'Operating loop must expose certification as a read-only projection.');
const ui=read('public/assets/ui/canonical-mission-workspace.js');
assert(ui.includes('MISSION JOURNEY'),'Mission Workspace must surface the canonical journey without creating another workspace.');

const db=new DatabaseSync(':memory:');
db.exec(read('database/schema.current.sql'));
const env={DB:{prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {run(){return stmt.run(...args);},first(){return stmt.get(...args)||null;},all(){return {results:stmt.all(...args)};}};}}}}};
db.prepare("INSERT INTO companies(id,name) VALUES(1,'Germany Logistics Certification')").run();
db.prepare("INSERT INTO country_catalog(code,name,active) VALUES('DE','Germany',1)").run();
const product=db.prepare("INSERT INTO platform_product_definitions(product_key,name,description,country_code,sector_code,status,definition_version,created_by_type,created_by_id) VALUES('de-logistics-cert','DE Logistics','Certification product','DE','logistics','active',1,'test','14.2.0') RETURNING id").get();
const lifecycle=db.prepare("INSERT INTO platform_lifecycle_definitions(lifecycle_key,name,country_code,sector_code,status,initial_state_code,created_by_type,created_by_id,product_definition_id) VALUES('de-logistics-cert','DE Logistics Lifecycle','DE','logistics','active','Pending','test','14.2.0',?) RETURNING id").get(product.id);
db.prepare("INSERT INTO missions(id,company_id,reference,status,state_version,country_code,sector_code,objective,responsibility_mode,mission_context_json,product_definition_id,lifecycle_definition_id,lifecycle_state_code) VALUES(1001,1,'DE-CERT-1001','Completed',12,'DE','logistics','Deliver object safely','tenant','{\"object\":\"parcel\",\"priority\":\"standard\"}',?,?, 'Completed')").run(product.id,lifecycle.id);
db.prepare("INSERT INTO mission_objects(company_id,mission_id,sequence_no,object_type,description) VALUES(1,1001,1,'parcel','Certification parcel')").run();
db.prepare("INSERT INTO mission_stops(company_id,mission_id,sequence_no,stop_type,city,evidence_required) VALUES(1,1001,1,'pickup','Hamburg',1),(1,1001,2,'delivery','Berlin',1)").run();
db.prepare("INSERT INTO mission_plans(plan_key,company_id,mission_id,context_hash,state_token,objective_json,plan_json,plan_hash,status,source_version,created_by_type,created_by_id) VALUES('cert-plan',1,1001,'ctx-1','v:12','{}','{\"recommendedAction\":{\"actionCode\":\"confirm_delivery\"}}','plan-1','ACCEPTED','14.0.0','test','14.2.0')").run();
db.prepare("INSERT INTO mission_plan_evaluations(evaluation_key,company_id,mission_id,plan_id,plan_hash,context_hash,state_token,status,evaluation_hash,evidence_json,decision_json,source_version,created_by_type,created_by_id) VALUES('cert-eval',1,1001,1,'plan-1','ctx-1','v:12','ACCEPTABLE','eval-1','{\"truthFresh\":true}','{\"summary\":\"safe\"}','14.0.0','test','14.2.0')").run();
db.prepare("INSERT INTO mission_assignments(company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,status,version,source_type,source_id) VALUES(1,1001,'executor','executor',501,1,'active',2,'test','assign-1')").run();
db.prepare("INSERT INTO agent_execution_attempts(attempt_id,idempotency_key,decision_id,company_id,mission_id,executor_id,action_code,action_version,actor_type,actor_id,authorization_json,request_hash,observed_effect_json,status,verification_status,context_hash,state_token_before,state_token_after,assignment_id,assignment_version,effect_hash) VALUES('attempt-1','idem-1','decision-1',1,1001,501,'confirm_delivery','14.0.0','agent','501','{\"authorized\":true,\"decision\":\"ALLOW\"}','req-1','{\"canonicalEffect\":true,\"status\":\"delivered\"}','SUCCEEDED','VERIFIED','ctx-1','v:12','v:13',1,2,'effect-1')").run();
db.prepare("INSERT INTO mission_execution_intents(intent_id,attempt_id,company_id,mission_id,action_code,action_version,idempotency_key,request_hash,state_token_before,execution_mode,status,verification_json,recovery_json) VALUES('intent-1','attempt-1',1,1001,'confirm_delivery','14.0.0','idem-1','req-1','v:12','INTERNAL','CANONICAL_EFFECT_COMMITTED','{\"canonicalVerified\":true}','{}')").run();
db.prepare("INSERT INTO mission_evidence_events(mission_id,company_id,evidence_type,event_code,actor_type,actor_id,metadata_json) VALUES(1001,1,'evidence','DELIVERY_PROOF','executor',501,'{\"verified\":true}')").run();
db.prepare("INSERT INTO mission_outcome_assessments(outcome_id,assessment_key,company_id,mission_id,assignment_id,attempt_id,outcome_code,confidence,verification_status,objective_hash,evidence_json,execution_summary_json,recovery_summary_json,next_situation_json,decision_reason_json,source_version,occurred_at) VALUES('out-1','out-key',1,1001,1,'attempt-1','ACHIEVED','HIGH','VERIFIED','obj-1','[{\"type\":\"delivery\"}]','{}','{}','{\"state\":\"NEXT_SITUATION_READY\"}','[]','14.0.0',CURRENT_TIMESTAMP)").run();
db.prepare("INSERT INTO mission_next_situations(continuity_id,continuity_key,company_id,mission_id,sequence_no,outcome_code,state,reason_code,action_code,assignment_id,assignment_version,attempt_id,context_hash,context_json,occurred_at) VALUES('next-1','next-key',1,1001,1,'ACHIEVED','NEXT_SITUATION_READY','MISSION_OUTCOME','confirm_arrival',1,2,'attempt-1','ctx-next','{}',CURRENT_TIMESTAMP)").run();
db.prepare("INSERT INTO agent_learning_observations(learning_id,event_id,decision_id,company_id,mission_id,action_code,outcome_code,reward_score,evidence_quality,prediction_confidence,learning_weight,observation_version,occurred_at,learning_hash) VALUES('learn-1','event-1','decision-1',1,1001,'confirm_delivery','RESOLVED',1.0,'HIGH','HIGH',1.0,'14.0.0',CURRENT_TIMESTAMP,'learn-hash')").run();
db.prepare("INSERT INTO canonical_domain_registry(code,label,layer,description) VALUES('platform','Platform','platform','Test domain')").run();
db.prepare("INSERT INTO canonical_capability_registry(code,label,domain_code,description) VALUES('execution','Execution','platform','Canonical execution')").run();
db.prepare("INSERT INTO canonical_capability_contracts(capability_code,purpose) VALUES('execution','Canonical execution contract')").run();

const certified=await certifyMissionJourney(env,{companyId:1,missionId:1001,profile:'GERMANY_LOGISTICS'});
assert(['14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.60','16.10.65','16.10.66'].includes(certified.version));
assert.equal(certified.status,'PASS',JSON.stringify(certified.checks));
assert.equal(certified.controls.effectEvidenceRequired,true);
assert.equal(certified.checks.find(x=>x.phase==='EFFECT_EVIDENCE')?.status,'PASS');
assert.equal(certified.checks.find(x=>x.phase==='OUTCOME_EFFECT_ALIGNMENT')?.status,'PASS');
const phaseNames=certified.journey.map(x=>x.phase);
assert.equal(phaseNames.filter(x=>x==='PREPARE').length,1,'PREPARE must be emitted exactly once.');
assert.equal(phaseNames.filter(x=>x==='ASSIGN').length,1,'ASSIGN must be emitted exactly once.');
for(const phase of CANONICAL_MISSION_JOURNEY) assert.equal(certified.journey.find(x=>x.phase===phase)?.status,'PASS',`phase ${phase} was not PASS`);

await assert.rejects(()=>certifyMissionJourney(env,{companyId:2,missionId:1001}),e=>e.code==='MISSION_NOT_FOUND_OR_ACCESS_DENIED');
db.prepare("UPDATE mission_execution_intents SET status='EXTERNAL_UNKNOWN',verification_json='{}' WHERE intent_id='intent-1'").run();
const unknown=await certifyMissionJourney(env,{companyId:1,missionId:1001,profile:'JOURNEY'});
assert.notEqual(unknown.status,'PASS');
assert.equal(unknown.journey.find(x=>x.phase==='EFFECT')?.status,'UNKNOWN');
assert.notEqual(unknown.journey.find(x=>x.phase==='VERIFY')?.status,'PASS');
assert.equal(unknown.controls.unknownEffectNotSuccess,true);
assert.equal(unknown.checks.find(x=>x.phase==='EFFECT_EVIDENCE')?.status,'UNKNOWN');

db.prepare("UPDATE mission_execution_intents SET status='READY_FOR_CANONICAL_COMMIT',verification_json='{}' WHERE intent_id='intent-1'").run();
db.prepare("UPDATE agent_execution_attempts SET effect_hash=NULL,observed_effect_json='{}',state_token_after=NULL WHERE attempt_id='attempt-1'").run();
await assert.rejects(
  ()=>transitionExecutionIntent(env,'intent-1',{status:'CANONICAL_EFFECT_COMMITTED',canonicalResult:{success:true},verification:{canonical:true}}),
  e=>e.code==='CANONICAL_EFFECT_EVIDENCE_REQUIRED'
);

db.close();
console.log('14.2.0 Germany Logistics Mission Certification: PASS');
console.log('Canonical phases certified:',CANONICAL_MISSION_JOURNEY.join(' → '));
console.log('Adversarial controls: tenant isolation, unknown effect non-success, effect evidence fence, effect/verification separation.');
