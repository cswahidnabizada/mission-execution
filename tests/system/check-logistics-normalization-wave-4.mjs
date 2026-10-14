import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const bad=[];
const migration=read('database/migrations/0104_canonical_logistics_runtime_retirement_wave_4.sql');
for(const token of ['DROP TRIGGER IF EXISTS trg_mission_stops_legacy_projection','DROP TRIGGER IF EXISTS trg_mission_objects_legacy_projection','CREATE VIEW mission_canonical_projection']) if(!migration.includes(token)) bad.push(`0104 missing retirement contract: ${token}`);
if(/COALESCE\([^\n]*m\.(?:pickup_|delivery_|object_|weight_kg|volume_m3|pallet_count|vehicle_requirement|loading_type|unloading_type|matching_notes)/i.test(migration)) bad.push('0104 projection still falls back to legacy missions logistics columns');
const schema=read('database/schema.current.sql');
if(schema.includes('CREATE TRIGGER trg_mission_stops_legacy_projection')) bad.push('schema.current still declares legacy stop trigger');
if(schema.includes('CREATE TRIGGER trg_mission_objects_legacy_projection')) bad.push('schema.current still declares legacy object trigger');
if(schema.includes('COALESCE(ps.company_name,m.pickup_company)')||schema.includes('COALESCE(o.object_type,m.object_type)')) bad.push('schema.current projection still has legacy logistics fallback');
const files=[
 'src/worker/repositories/mission-access-code.repository.js',
 'src/worker/modules/missions/missions.service.js'
];
for(const f of files){const s=read(f);if(/(?:FROM|JOIN|LEFT JOIN)\s+missions\s+m\b/i.test(s)&&/(pickup_|delivery_|object_|weight_kg|volume_m3|pallet_count|vehicle_requirement|loading_type|unloading_type|matching_notes)/i.test(s))bad.push(`${f}: legacy mission logistics read remains`);}
const all=[];
for(const dir of ['src/worker']){const walk=d=>{for(const ent of fs.readdirSync(path.join(root,d),{withFileTypes:true})){const rel=path.join(d,ent.name);if(ent.isDirectory())walk(rel);else if(ent.name.endsWith('.js'))all.push(rel)}};walk(dir)}
for(const f of all){const s=read(f);if(/(?:FROM|JOIN|LEFT JOIN)\s+missions\s+m\b[\s\S]{0,1200}(?:pickup_company|pickup_address|pickup_street|pickup_zip_code|pickup_city|delivery_company|delivery_address|delivery_street|delivery_zip_code|delivery_city|object_type|object_description|weight_kg|volume_m3|pallet_count|vehicle_requirement|loading_type|unloading_type|matching_notes)/i.test(s))bad.push(`${f}: possible legacy logistics SQL source`);}
if(bad.length){console.error('LOGISTICS NORMALIZATION WAVE 4 FAILED');for(const x of bad)console.error(x);process.exit(1)}
console.log(`LOGISTICS NORMALIZATION WAVE 4 PASS (legacy logistics runtime adapters retired; frozen columns remain)`) 
