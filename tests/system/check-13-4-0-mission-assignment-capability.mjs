import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('VERSION').trim();
const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));
assert(['13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30'].includes(version));
assert(['13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30'].includes(pkg.version));
assert(['13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30'].includes(lock.version));

const migration=read('database/migrations/0142_mission_assignment_capability_and_subject_governance.sql');
for(const token of [
  'mission_assignment_subjects','mission_assignment_decisions','assignee_type IN (\'driver\',\'executor\',\'device\',\'robot\')',
  'status=\'verified\'','mission_assignment','assignment_subject','one_active_execution_assignment'
]) assert(migration.includes(token),`13.4 migration missing ${token}`);

const authority=read('src/worker/security/mission-assignment-authority.service.js');
for(const token of ['MISSION_ASSIGNMENT_AUTHORITY_VERSION','mission_assignments','ASSIGNEE_TYPES','device','robot','getAssignmentAuthorityHealth']) assert(authority.includes(token),`assignment authority missing ${token}`);

const capability=read('src/worker/extensions/mission-assignment/mission-assignment.capability.js');
for(const token of [
  'MISSION_ASSIGNMENT_CAPABILITY_VERSION','requireCapabilityOperation','assessMissionAssignment','assignMission','mission_assignment_decisions',
'canonicalAssignmentStatements','SHARE','REASSIGN','ESCALATE','MISSION_ASSIGNMENT_DECISION_REQUIRED'
]) assert(capability.includes(token),`mission assignment capability missing ${token}`);
assert(!capability.includes('INSERT INTO mission_assignments'), 'mission assignment capability must not bypass canonical assignment writer');

const contract=read('src/worker/extensions/mission-assignment/mission-assignment.contract.js');
for(const token of ['oneActiveExecutionAssignment','noAuthorityTransfer','unknownNeverMeansEligible']) assert(contract.includes(token),`assignment contract invariant missing ${token}`);

const routes=read('src/worker/modules/assignments/assignment.routes.js');
for(const token of ['/assignment-candidates','/assignment-recommendation','/assignment-commit','assignMission']) assert(routes.includes(token),`assignment route missing ${token}`);

const coordinator=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.service.js');
for(const token of ['assessMissionAssignment','MISSION_ASSIGNMENT_REQUIRED_BEFORE_EXECUTION','mission_assignment','assignment_subject']) assert(coordinator.includes(token),`coordinator assignment gate missing ${token}`);
const coordContract=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.contract.js');
assert(coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='15.1.0'") || coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.5.0'") || coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.2.0'") || coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.6.0'"),'coordinator version continuity missing'); for(const token of ['missionAssignmentContracted','mission_assignment_contract_missing']) assert(coordContract.includes(token),`coordinator 13.4 contract missing ${token}`);

const truth=read('src/worker/core/canonical-truth-registry.js');
assert(truth.includes('"mission.assignment"'), 'mission assignment must remain in canonical truth registry');
assert(!truth.includes('mission-assignment-capability'), 'assignment capability must not become a second truth authority');

const gate=pkg.scripts['check:release'];
assert(gate.includes('check-13-3-0-real-world-multisector-mission-certification.mjs'));
assert(gate.includes('check-13-4-0-mission-assignment-capability.mjs'),'13.4 must be mandatory in check:release');

const manifest=JSON.parse(read('RELEASE-MANIFEST.json'));
assert(['13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30'].includes(manifest.version));
assert(['0142','0143','0144','0145','0146','0147','0147','0148','0149','0151','0152','0153','0154','0155','0156','0157','0158','0159'].includes(manifest.migrationHighWaterMark));
assert([142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159].includes(manifest.migrationCount));

// Validate the resulting current schema with SQLite without requiring a live D1 binding.
const tmp=path.join(root,'.check-13-4-assignment.db');
try{
  const schemaPath=JSON.stringify(path.join(root,'database/schema.current.sql'));
  const dbPath=JSON.stringify(tmp);
  const db=new DatabaseSync(tmp);
  try{
    db.exec('PRAGMA foreign_keys=ON');
    db.exec(read('database/schema.current.sql'));
    db.prepare("INSERT INTO companies(name) VALUES('T')").run();
    const company=db.prepare('SELECT id FROM companies ORDER BY id DESC LIMIT 1').get().id;
    db.prepare("INSERT INTO missions(company_id,reference,status) VALUES(?,?,?)").run(company,'M','Pending');
    const mission=db.prepare('SELECT id FROM missions ORDER BY id DESC LIMIT 1').get().id;
    db.prepare("INSERT INTO mission_assignment_subjects(company_id,subject_type,subject_key,display_name,source_authority,status) VALUES(?,?,?,?,?,?)").run(company,'robot','r1','Robot 1','robot_registry','verified');
    const rid=db.prepare("SELECT id FROM mission_assignment_subjects WHERE subject_key='r1'").get().id;
    db.prepare("INSERT INTO mission_assignments(company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id) VALUES(?,?,?,?,?,?)").run(company,mission,'executor','robot',rid,company);
    const active=db.prepare("SELECT COUNT(*) AS count FROM mission_assignments WHERE mission_id=? AND status='active'").get(mission).count;
    assert.equal(active,1);
    console.log('sqlite current-schema assignment validation: PASS');
  }finally{db.close();}
} finally {try{fs.rmSync(tmp,{force:true})}catch{}}

console.log('13.4.0 mission assignment capability: PASS');
console.log('Assignment authority remains singular; humans, devices and robots are governed as execution subjects.');
