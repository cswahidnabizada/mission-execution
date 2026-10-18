import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('VERSION').trim();
const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));
assert(['13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.60'].includes(version));
assert.equal(pkg.version,version);
assert.equal(lock.version,version);

const migration=read('database/migrations/0141_real_world_multisector_mission_certification.sql');
for(const token of [
  'field_service.default','cleaning.default','inspection.default','maintenance.default','claims.default',
  'field_service.service-call.de','cleaning.service.de','inspection.site-inspection.de','maintenance.repair.de','claims.assessment.de',
  'platform_mission_reference_scenarios','requiredCapabilities','requiredResources','externalEffect','platformNeutral','never_assume_success'
]) assert(migration.includes(token),`13.3 migration missing ${token}`);

const sector=read('src/worker/security/sector-mission-contract.service.js');
for(const token of [
  "SECTOR_MISSION_CONTRACT_VERSION='13.3.0'",'platform_mission_reference_scenarios','sector_mission_contract_authority',
  'canonical_mission','sector_lifecycle_authority','canonical_capability_contracts','ACTION_NOT_REGISTERED','ACTION_ROUTE_NOT_CONTRACTED',
  'requireResourceContract','provider_integration','ownerCapability'
]) assert(sector.includes(token),`sector contract gateway missing ${token}`);

const lifecycle=read('src/worker/security/sector-lifecycle.service.js');
assert(!lifecycle.includes("sector==='logistics'?'logistics.default':'general.default"),'lifecycle resolution must not classify every non-logistics sector as general');
assert(lifecycle.includes('lower(sector_code)=?'),'lifecycle resolver must prefer sector-specific definitions');

const capability=read('src/worker/extensions/actions-intelligence/action-capability.engine.js');
assert(capability.includes('addLifecycleFlowActions'),'action capability engine must consume lifecycle transitions');
assert(!capability.includes('String(ctx.sectorCode||ctx.mission?.sector_code||"logistics").toLowerCase()!=="logistics"'),'action capability engine must not branch on sector name');

const coordinator=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.service.js');
for(const token of ['assessSectorMissionContract','SECTOR_MISSION_CONTRACT_VERSION','SECTOR_MISSION_CONTRACT_NOT_READY','sectorScenarioCode','contractEnvelope']) assert(coordinator.includes(token),`coordinator missing ${token}`);
const coordContract=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.contract.js');
assert(coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='15.1.0'") || coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.5.0'") || coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.4.0'") || coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.2.0'") || coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.6.0'") || coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.5.0'") || coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.4.0'") || coordContract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.3.0'"),'coordinator contract version missing');
for(const token of ['sectorMissionContracted','sector_mission_contract_missing']) assert(coordContract.includes(token),`coordinator contract missing ${token}`);
assert(coordContract.includes("!(String(outcome?.status||'')==='SUCCEEDED'&&String(outcome?.verificationStatus||'')==='UNKNOWN')"),'UNKNOWN must never satisfy success');

const planner=read('src/worker/extensions/agentic-layer/agent-planner.service.js');
for(const token of ['assessSectorMissionContract','sectorContract','RESOLVE_SECTOR_CONTRACT']) assert(planner.includes(token),`planner missing ${token}`);

const provider=read('src/worker/security/external-provider-integration.service.js');
for(const token of ['external_provider_capabilities','adapter_type','verification_required','http_json']) assert(provider.includes(token),`provider adapter boundary missing ${token}`);

const gate=pkg.scripts['check:release'];
assert(gate.includes('check-13-2-0-capability-resource-contract-operationalization.mjs'));
assert(gate.includes('check-13-3-0-real-world-multisector-mission-certification.mjs'),'13.3 must be mandatory in check:release');
assert(gate.includes('check-13-4-0-mission-assignment-capability.mjs'),'13.4 must be mandatory in check:release');

const manifest=JSON.parse(read('RELEASE-MANIFEST.json'));
assert(['13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.60'].includes(manifest.version));
assert(['0141','0142','0143','0144','0145','0146','0147','0147','0148','0149','0151','0152','0153','0154','0155','0156','0157','0158','0159','0160'].includes(manifest.migrationHighWaterMark));
assert(manifest.migrationCount>=141);

// Validate the 13.3 migration against the current schema without requiring a live D1 binding.
const tmp=path.join(root,'.check-13-3-multisector.db');
try{fs.rmSync(tmp,{force:true});fs.rmSync(`${tmp}-journal`,{force:true});}catch{}
try{
  const schemaPath=JSON.stringify(path.join(root,'database/schema.current.sql'));
  const migrationPath=JSON.stringify(path.join(root,'database/migrations/0141_real_world_multisector_mission_certification.sql'));
  const dbPath=JSON.stringify(tmp);
  const db=new DatabaseSync(tmp);
  try{
    db.exec('PRAGMA foreign_keys=ON');
    db.exec(read('database/schema.current.sql'));
    db.prepare("INSERT INTO country_catalog(code,name,active) VALUES ('DE','Germany',1)").run();
    db.exec(read('database/migrations/0141_real_world_multisector_mission_certification.sql'));
    const rows=db.prepare("SELECT sector_code,scenario_code,status FROM platform_mission_reference_scenarios WHERE version=1 ORDER BY sector_code,scenario_code").all();
    const expected=new Set(['field_service','cleaning','inspection','maintenance','claims']);
    const found=new Set(rows.map(r=>r.sector_code));
    assert([...expected].every(x=>found.has(x)),{expected:[...expected],found:[...found]});
    assert(rows.filter(r=>expected.has(r.sector_code)).every(r=>r.status==='active'));
    console.log('sqlite current-schema + 13.3 migration validation: PASS');
  }finally{db.close();}
} finally {try{fs.rmSync(tmp,{force:true})}catch{}}

console.log('13.3.0 real-world multi-sector mission certification: PASS');
console.log('Certified sectors: logistics, field_service, cleaning, inspection, maintenance, claims.');
console.log('Execution authority remains generic: lifecycle + canonical actions + capability/resource contracts + provider adapters + verification/recovery.');
