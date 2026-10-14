import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const policy=JSON.parse(fs.readFileSync(path.join(root,"database/data-integrity-policy.json"),"utf8"));
const files=[path.join(root,"database/schema.current.sql"),...fs.readdirSync(path.join(root,"database/migrations")).filter(x=>x.endsWith(".sql")).sort().map(x=>path.join(root,"database/migrations",x))];
const targets={
  drivers:{source:"src/worker/repositories/driver.repository.js"},
  companies:{sources:["src/worker/modules/account/account.service.js","src/worker/security/platform-data-control.service.js","src/worker/security/platform-trash.service.js"]},
  missions:{sources:["src/worker/modules/missions/missions.service.js","src/worker/repositories/public.repository.js","src/worker/repositories/file.repository.js","src/worker/modules/account/account.service.js","src/worker/security/platform-data-control.service.js","src/worker/security/platform-trash.service.js"]},
  public_executor_identities:{source:"src/worker/modules/account/account.service.js"}
};
function refsFor(target){
  const out=new Set();
  for(const file of files){
    const sql=fs.readFileSync(file,"utf8");
    const create=/CREATE TABLE(?: IF NOT EXISTS)?\s+([A-Za-z0-9_]+)\s*\(([^;]*?)\);/gis;
    let m;
    while((m=create.exec(sql))){if(m[1].endsWith("_new"))continue;if(new RegExp(`REFERENCES\\s+${target}\\s*\\(\\s*id\\s*\\)`,`i`).test(m[2]))out.add(m[1]);}
    const alter=new RegExp(`ALTER TABLE\\s+([A-Za-z0-9_]+)\\s+ADD COLUMN[^;]*?REFERENCES\\s+${target}\\s*\\(\\s*id\\s*\\)`,`gis`);
    while((m=alter.exec(sql)))out.add(m[1]);
  }
  return [...out].map(name=>name.endsWith("_v2")&&policy[target]?.[name.slice(0,-3)]?name.slice(0,-3):name);
}
let failed=false;
for(const [target,config] of Object.entries(targets)){
  const actual=[...new Set(refsFor(target))].sort();
  const declared=policy[target]||{};
  const missing=actual.filter(name=>!declared[name]);
  if(missing.length){console.error(`DATA INTEGRITY POLICY FAILURE: new ${target}(id) foreign-key table(s) have no policy: ${missing.join(", ")}`);failed=true;continue;}
  const sourcePaths=config.sources||[config.source];
  const source=sourcePaths.map(x=>fs.readFileSync(path.join(root,x),"utf8")).join("\n");
  const uncovered=Object.entries(declared).filter(([,behavior])=>behavior!=="dropped_legacy_table").map(([name])=>name).filter(name=>!source.includes(name));
  if(uncovered.length){console.error(`DATA INTEGRITY POLICY FAILURE: ${target} cleanup does not mention declared table(s): ${uncovered.join(", ")}`);failed=true;continue;}
  console.log(`${target} deletion policy OK (${actual.join(", ")})`);
}
if(failed){console.error("Update database/data-integrity-policy.json and the matching controlled deletion path before deploying.");process.exit(1);}
