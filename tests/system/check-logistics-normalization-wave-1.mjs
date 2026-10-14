import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const migration=read('database/migrations/0102_canonical_logistics_authority_wave_1.sql');
const missionRepo=read('src/worker/repositories/mission.repository.js');
const logistics=read('src/worker/repositories/mission-logistics.repository.js');
const objects=read('src/worker/modules/objects/objects.service.js');

for(const token of ['mission_stops','mission_objects']) if(!migration.includes(token)) failures.push(`missing canonical logistics migration token: ${token}`);
if(!/canonicalLogisticsStatements/.test(missionRepo)) failures.push('mission repository does not write canonical logistics authority');
if(/INSERT INTO missions\s*\([\s\S]{0,1200}\b(pickup_company|pickup_address|delivery_company|object_type|weight_kg)\b/i.test(missionRepo)) failures.push('mission repository still writes legacy logistics columns');
if(/UPDATE missions\s+SET[\s\S]{0,1200}\b(pickup_company|pickup_address|delivery_company|object_type|weight_kg)\b/i.test(missionRepo)) failures.push('mission repository still updates legacy logistics columns');
if(!/canonicalFirst/.test(logistics)||!/canonicalAll/.test(logistics)) failures.push('canonical logistics service is not using canonical DB helpers');
if(/FROM missions WHERE company_id=\? AND object_type/.test(objects)) failures.push('object service still treats missions.object_type as authority');
if(!/listMissionObjects as listCanonicalMissionObjects/.test(objects)) failures.push('object service is not migrated to canonical object authority');
if(failures.length){console.error('Logistics normalization Wave 1: FAIL');for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Logistics normalization Wave 1: PASS');
