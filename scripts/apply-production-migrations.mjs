import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const configPath=path.join(root,'wrangler.jsonc');
const config=fs.readFileSync(configPath,'utf8');
const match=config.match(/"database_name"\s*:\s*"([^"]+)"/);
const database=process.env.ONMISSION_D1_DATABASE||match?.[1];
if(!database) throw new Error('ONMISSION_D1_DATABASE is required when wrangler.jsonc has no D1 database_name.');
const migrations=fs.readdirSync(path.join(root,'database','migrations')).filter(x=>x.endsWith('.sql')).sort();
const highWater=migrations.at(-1)?.slice(0,4)||'0000';
console.log(`Applying ON Mission production D1 migrations through ${highWater} to ${database}...`);
const result=spawnSync('npx',['wrangler','d1','migrations','apply',database,'--remote'],{stdio:'inherit',env:process.env});
if(result.status!==0)process.exit(result.status??1);
console.log(`Production D1 migration application complete through ${highWater}.`);
