import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const dir=path.join(root,'database/migrations');
const files=fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort();
const failures=[];
const nums=files.map(x=>Number(x.slice(0,4)));
for(let i=0;i<nums.length;i++){const expected=i+1;if(nums[i]!==expected) failures.push(`migration sequence gap/duplicate at ${String(expected).padStart(4,'0')}`);}
for(const file of files){const sql=fs.readFileSync(path.join(dir,file),'utf8');if(!sql.trim()) failures.push(`empty migration: ${file}`);if(/\/mnt\/data\/(rebuild|work_|orig|build)/i.test(sql)) failures.push(`historical build path in migration: ${file}`);}
const latest=files.at(-1)||'';
if(!/^\d{4}_.+\.sql$/.test(latest)) failures.push(`unexpected migration high-water mark: ${latest}`);
if(!fs.existsSync(path.join(root,'database/schema.current.sql'))) failures.push('current schema snapshot missing');
if(failures.length){console.error('Migration contract gate: FAIL');for(const x of failures)console.error(`- ${x}`);process.exit(1)}
console.log(`Migration contract gate: PASS (${files.length} ordered migrations, high-water mark ${latest.slice(0,4)})`);
