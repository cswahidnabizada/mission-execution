import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
assert.ok(['11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54'].includes(read('VERSION').trim()));
assert.ok(['11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54'].includes(JSON.parse(read('package.json')).version));
assert.ok(['11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54'].includes(JSON.parse(read('package-lock.json')).version));
const migration=read('database/migrations/0132_mission_reference_scenarios.sql');
for(const token of ['platform_mission_reference_scenarios','general.mission.execution','logistics.pickup-delivery.de','country_code','sector_code','steps_json','exception_contract_json','verification_contract_json','DE','logistics']) assert(migration.includes(token),`missing reference contract token: ${token}`);
const schema=read('database/schema.current.sql');
assert(schema.includes('CREATE TABLE platform_mission_reference_scenarios'),'reference scenario table missing from current schema');
const service=read('src/worker/extensions/agentic-layer/mission-reference.service.js');
for(const token of ['MISSION_REFERENCE_VERSION','resolveMissionReferenceScenario','assessMissionReference','canonical_mission','canonical_assignment','canonical_action_application_service','unknownMustRemainUnknown']) assert(service.includes(token),`missing reference service contract: ${token}`);
const routes=read('src/worker/extensions/agentic-layer/agentic-layer.routes.js');
assert(routes.includes('/api/agent/reference/scenarios'));
assert(routes.includes('agent\\/reference\\/missions'));
const planner=read('src/worker/extensions/agentic-layer/agent-planner.service.js');
assert(planner.includes('assessMissionReference'));
assert(planner.includes('REFERENCE_SCENARIO_AUTHORITY_UNAVAILABLE'));
const ui=read('public/assets/ui/canonical-mission-workspace.js');
for(const token of ['/api/agent/reference/missions/${id}','REFERENCE MISSION','Sector-neutral execution','referenceMission']) assert(ui.includes(token),`missing workspace reference contract: ${token}`);
const css=read('public/assets/css/extensions/canonical-mission-workspace.css');
for(const token of ['11.14 Reference Mission','cmw-reference-card','cmw-reference-grid']) assert(css.includes(token),`missing reference styling: ${token}`);
assert(!service.includes('Only logistics'));
// Validate the new migration against SQLite with only its direct dependency tables.
const tmp=path.join(root,'.check-11-14-reference.db');
try{
  const migrationPath=JSON.stringify(path.join(root,'database/migrations/0132_mission_reference_scenarios.sql'));
  const dbPath=JSON.stringify(tmp);
  const db=new DatabaseSync(tmp);
  try{
    db.exec("CREATE TABLE country_catalog(code TEXT PRIMARY KEY); CREATE TABLE platform_lifecycle_definitions(id INTEGER PRIMARY KEY,lifecycle_key TEXT,version INTEGER); INSERT INTO country_catalog(code) VALUES ('DE'); INSERT INTO platform_lifecycle_definitions(id,lifecycle_key,version) VALUES (1,'general.default',1),(2,'logistics.default',1);");
    db.exec(read('database/migrations/0132_mission_reference_scenarios.sql'));
    const rows=db.prepare("SELECT scenario_code,country_code,sector_code,status FROM platform_mission_reference_scenarios ORDER BY id").all();
    assert.equal(rows[0].scenario_code,'general.mission.execution');
    assert.equal(rows[1].scenario_code,'logistics.pickup-delivery.de');
    assert.equal(rows[1].country_code,'DE');
    assert.equal(rows[1].sector_code,'logistics');
    assert(rows.every(r=>r.status==='active'));
    console.log('sqlite migration seed validation: PASS');
  }finally{db.close();}
} finally {try{fs.rmSync(tmp,{force:true})}catch{}}
console.log('11.14.0 reference mission: PASS');
console.log('The reference scenario is data-driven, Germany-first for the launch workflow, and remains outside canonical mission truth and execution authority.');
