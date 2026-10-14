import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const failures=[];
const migration=fs.readFileSync(path.join(root,'database/migrations/0101_assignment_projection_views.sql'),'utf8');
if(!/CREATE VIEW IF NOT EXISTS mission_active_assignment_projection/i.test(migration)) failures.push('canonical assignment projection view missing');
if(!/FROM mission_assignments\s*\nWHERE status='active'/i.test(migration)) failures.push('projection does not derive from mission_assignments active rows');
for(const file of ['src/worker/repositories/mission.repository.js','src/worker/repositories/executor.repository.js','src/worker/repositories/shared-mission.repository.js','src/worker/repositories/notification.repository.js','src/worker/repositories/driver-workspace.repository.js','src/worker/repositories/awareness.repository.js']){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  if(!text.includes('mission_active_assignment_projection')) failures.push(`${file} does not consume canonical assignment projection`);
}
for(const file of ['src/worker/repositories/shared-mission.repository.js','src/worker/repositories/driver.repository.js']){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  if(/DELETE FROM mission_active_assignment_projection/i.test(text)) failures.push(`${file} attempts to mutate read-only canonical assignment projection`);
}
if(failures.length){console.error('Canonical assignment projection gate: FAIL');for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Canonical assignment projection gate: PASS');
