import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const worker=path.join(root,"src","worker");
const mustContain=[
  ["repositories/mission.repository.js","AS owner_driver_id"],
  ["repositories/shared-mission.repository.js","AS owner_driver_id"],
  ["modules/intelligence/mission-context.js","m.owner_driver_id"],
  ["modules/intelligence/predictive-operations.engine.js","m.owner_driver_id"],
  ["security/permissions.js","mission.owner_driver_id"],
  ["modules/transitions/transition-safety.service.js","mission_active_assignment_projection"],
  ["modules/assignments/assignment.engine.js","mission?.owner_driver_id"],
  ["extensions/action-execution/secured-action-authorization.contract.js","mission.owner_driver_id"],
  ["extensions/operations-context/canonical-responsibility.contract.js","mission?.owner_driver_id"],
];
const failures=[];
for(const [rel,needle] of mustContain){
  const p=path.join(worker,rel); const s=fs.readFileSync(p,"utf8");
  if(!s.includes(needle))failures.push(`${rel}: missing ${needle}`);
}
const scanDirs=["extensions","modules","repositories","security"];
const legacyPatterns=[/mission_executor_assignments/g,/mission_tenant_driver_assignments/g,/\bmission\.driver_id\b/g,/\bm\.driver_id\b/g];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&e.name.endsWith(".js")){const rel=path.relative(worker,p).replaceAll("\\","/");const s=fs.readFileSync(p,"utf8").replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\n)\s*\/\/.*$/gm,'');for(const re of legacyPatterns){if(re.test(s)){failures.push(`${rel}: legacy assignment reference ${re}`);re.lastIndex=0;break;}}}}}
for(const d of scanDirs)walk(path.join(worker,d));
if(failures.length){console.error("Assignment convergence wave 2: FAIL");for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log("Assignment convergence wave 2: PASS");
