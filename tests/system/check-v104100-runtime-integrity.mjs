import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const checks=[];
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);checks.push(msg);};
const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
assert(version==='10.41.0','canonical release is 10.41.0');
const migration=fs.readFileSync(path.join(root,'database/migrations/0098_canonical_sector_lifecycle_and_logistics_domain.sql'),'utf8');
for(const token of ['platform_lifecycle_definitions','platform_lifecycle_states','platform_lifecycle_transitions','platform_product_sector_lifecycles','mission_stops','mission_objects','mission_assignment_events','mission_custody_events','mission_evidence_events'])assert(migration.includes(token),`migration contains ${token}`);
const mission=fs.readFileSync(path.join(root,'src/worker/modules/missions/missions.service.js'),'utf8');
assert(mission.includes("archived_at=CURRENT_TIMESTAMP"),'mission deletion is governed archival');
assert(!mission.includes('DELETE FROM mission_status_history'),'mission history is not destructively deleted by user mission deletion');
const driver=fs.readFileSync(path.join(root,'src/worker/repositories/driver.repository.js'),'utf8');
assert(!driver.includes("mission_tenant_driver_assignments SET status='removed'"),'driver removal no longer writes nonexistent assignment status');
const admin=fs.readFileSync(path.join(root,'src/worker/modules/admin-control/admin-control.service.js'),'utf8');
assert(!admin.includes('FROM platform_configurations'),'admin command center no longer references retired configuration table');
const assets=[];
function* walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())yield* walk(p);else yield p;}}
for(const f of walk(path.join(root,'public'))){if(!/\.(html|css|js)$/.test(f))continue;const t=fs.readFileSync(f,'utf8');if(t.includes('?v=10.38.13'))assets.push(path.relative(root,f));}
assert(!assets.length,'no stale 10.38.13 runtime asset query strings remain');
console.log(`10.41.0 runtime integrity: PASS (${checks.length} checks)`);
