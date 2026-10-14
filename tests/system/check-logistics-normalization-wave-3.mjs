import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const requiredProjectionReaders=[
  'src/worker/repositories/mission.repository.js',
  'src/worker/repositories/network.repository.js',
  'src/worker/modules/public/public.service.js'
];
const bad=[];
for(const f of requiredProjectionReaders){
  const s=fs.readFileSync(path.join(root,f),'utf8');
  if(!/\b(?:FROM|JOIN|LEFT JOIN)\s+mission_canonical_projection\b/i.test(s)) bad.push(`${f}: missing canonical logistics projection source`);
}
const missionRepo=fs.readFileSync(path.join(root,'src/worker/repositories/mission.repository.js'),'utf8');
const readAuthority=(missionRepo.match(/FROM\s+mission_canonical_projection\s+m/gi)||[]).length;
if(readAuthority<2) bad.push('mission.repository.js: list/find read authorities are not both canonical projection backed');
const network=fs.readFileSync(path.join(root,'src/worker/repositories/network.repository.js'),'utf8');
if(/JOIN\s+missions\s+m\s+ON\s+m\.id=ni\.mission_id/i.test(network)) bad.push('network.repository.js: invitation mission read still joins legacy missions');
const pub=fs.readFileSync(path.join(root,'src/worker/modules/public/public.service.js'),'utf8');
if(/LEFT JOIN\s+missions\s+nextm/i.test(pub)) bad.push('public.service.js: next-location mission read still joins legacy missions');
if(bad.length){console.error('LOGISTICS NORMALIZATION WAVE 3 FAILED'); for(const x of bad) console.error(x); process.exit(1)}
console.log('LOGISTICS NORMALIZATION WAVE 3 PASS');
