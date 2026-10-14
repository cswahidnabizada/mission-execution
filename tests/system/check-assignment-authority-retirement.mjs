import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const worker=path.join(root,'src','worker');
const forbidden=[/mission_executor_assignments/g,/mission_tenant_driver_assignments/g,/\bmission\.driver_id\b/g,/\bm\.driver_id\b/g,/UPDATE missions SET[^\n]*\bdriver_id\b/gi,/INSERT INTO missions[^\n]*\bdriver_id\b/gi];
const failures=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&e.name.endsWith('.js')){const rel=path.relative(worker,p).replaceAll('\\','/');const s=fs.readFileSync(p,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\n)\s*\/\/.*$/gm,'');for(const re of forbidden){if(re.test(s)){failures.push(`${rel}: retired assignment authority reference ${re}`);re.lastIndex=0;break;}}}}}
walk(worker);
const authority=fs.readFileSync(path.join(worker,'security','mission-assignment-authority.service.js'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\n)\s*\/\/.*$/gm,'');
if(/canonicalAssignmentProjectionStatements[\s\S]*mission_executor_assignments/.test(authority)) failures.push('canonical assignment authority still writes executor legacy projection');
if(/canonicalAssignmentProjectionStatements[\s\S]*mission_tenant_driver_assignments/.test(authority)) failures.push('canonical assignment authority still writes tenant-driver legacy projection');
if(failures.length){console.error('Assignment authority retirement: FAIL');for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Assignment authority retirement: PASS');
