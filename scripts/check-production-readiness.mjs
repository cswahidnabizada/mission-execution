import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const requiredIndexes=[
  ["idx_missions_company_status_updated","database/migrations/0036_production_query_indexes.sql"],
  ["idx_missions_company_date","database/migrations/0036_production_query_indexes.sql"],
  ["idx_mission_status_history_mission_status_time","database/migrations/0036_production_query_indexes.sql"],
  ["idx_public_requests_company_mission_status_updated","database/migrations/0036_production_query_indexes.sql"],
  ["idx_executor_assignments_company_mission_status","database/migrations/0036_production_query_indexes.sql"],
  ["idx_tenant_access_owner_mission_status","database/migrations/0036_production_query_indexes.sql"],
  ["idx_tenant_driver_assignment_mission_owner_access","database/migrations/0036_production_query_indexes.sql"]
];
const checks=[];
const migration=fs.readFileSync(path.join(root,"database/migrations/0036_production_query_indexes.sql"),"utf8");
for(const [name] of requiredIndexes)checks.push([`production index ${name}`,new RegExp(`CREATE INDEX IF NOT EXISTS ${name}\\b`).test(migration)]);
const transition=fs.readFileSync(path.join(root,"src/worker/modules/transitions/mission-transition.service.js"),"utf8");
checks.push(["canonical lifecycle transition advances state_version",/SET status=\?,lifecycle_state_code=\?,state_version=state_version\+1/.test(transition)]);
checks.push(["canonical lifecycle transition is compare-and-set",/WHERE id=\? AND company_id=\? AND status=\?/.test(transition)]);
checks.push(["canonical lifecycle transition writes status history",/INSERT INTO mission_status_history/.test(transition)]);
checks.push(["production migration is present",fs.existsSync(path.join(root,"database/migrations/0036_production_query_indexes.sql"))]);
checks.push(["architecture guard is part of health",/check:architecture/.test(fs.readFileSync(path.join(root,"package.json"),"utf8"))]);
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(!ok)failed++;}
if(failed){console.error(`Production readiness audit failed: ${failed} check(s)`);process.exit(1);}
console.log("Production readiness architecture/data checks: PASS");
console.log("NOTE: production D1 migration 0036 must be applied before relying on the new indexes.");
console.log("NOTE: cumulative protected-baseline artifacts remain a separate release-gate concern.");
