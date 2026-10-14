import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const bad=[];
const migration=read('database/migrations/0105_canonical_logistics_legacy_column_removal.sql');
const dropped=[
  'pickup_company','pickup_address','delivery_company','delivery_address',
  'pickup_access_from','pickup_access_to','delivery_access_from','delivery_access_to',
  'pickup_street','pickup_zip_code','pickup_city','delivery_street','delivery_zip_code','delivery_city',
  'pickup_latitude','pickup_longitude','delivery_latitude','delivery_longitude',
  'object_type','object_description','weight_kg','volume_m3','pallet_count',
  'vehicle_requirement','loading_type','unloading_type','matching_notes'
];
for(const c of dropped) if(!migration.includes(`ALTER TABLE missions DROP COLUMN ${c};`)) bad.push(`0105 missing DROP COLUMN ${c}`);
for(const idx of ['idx_missions_delivery_city','idx_missions_pickup_city','idx_missions_route_points']) if(!migration.includes(`DROP INDEX IF EXISTS ${idx};`)) bad.push(`0105 missing obsolete index removal ${idx}`);
const schema=read('database/schema.current.sql');
for(const c of dropped) if(new RegExp(`\\b${c}\\b`).test(schema.match(/CREATE TABLE missions \\([\\s\\S]*?\\);/)?.[0]||'')) bad.push(`schema.current still declares legacy missions.${c}`);
for(const idx of ['idx_missions_delivery_city','idx_missions_pickup_city','idx_missions_route_points']) if(schema.includes(`CREATE INDEX ${idx} ON missions`)) bad.push(`schema.current still declares ${idx}`);
const all=[];
const walk=d=>{for(const ent of fs.readdirSync(path.join(root,d),{withFileTypes:true})){const rel=path.join(d,ent.name);if(ent.isDirectory())walk(rel);else if(ent.name.endsWith('.js'))all.push(rel)}};
walk('src/worker');
for(const f of all){
  const s=read(f);
  if(/(?:FROM|JOIN|LEFT JOIN|UPDATE|INSERT INTO)\s+missions\b[\s\S]{0,1400}(?:pickup_company|pickup_address|pickup_street|pickup_zip_code|pickup_city|pickup_latitude|pickup_longitude|pickup_access_from|pickup_access_to|delivery_company|delivery_address|delivery_street|delivery_zip_code|delivery_city|delivery_latitude|delivery_longitude|delivery_access_from|delivery_access_to|object_type|object_description|weight_kg|volume_m3|pallet_count|vehicle_requirement|loading_type|unloading_type|matching_notes)/i.test(s)) bad.push(`${f}: runtime still references removed legacy logistics columns`);
}
for(const f of ['src/worker/repositories/mission-logistics.repository.js','src/worker/repositories/mission.repository.js']){
  if(!read(f).includes('mission_canonical_projection') && f.endsWith('mission-logistics.repository.js')) bad.push(`${f}: canonical projection missing`);
}
if(bad.length){console.error('LOGISTICS NORMALIZATION WAVE 5 FAILED');for(const x of bad)console.error(x);process.exit(1)}
console.log('LOGISTICS NORMALIZATION WAVE 5 PASS (legacy logistics columns physically retired)');
