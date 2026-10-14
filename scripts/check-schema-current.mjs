import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const schemaPath=path.join(root,'database/schema.current.sql');
if(!fs.existsSync(schemaPath)) throw new Error('database/schema.current.sql is missing');
if(fs.existsSync(path.join(root,'database/schema.sql'))) throw new Error('stale database/schema.sql remains');
const schema=fs.readFileSync(schemaPath,'utf8');
const stripComments=(text)=>text.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
const schemaSql=stripComments(schema);
const migrations=fs.readdirSync(path.join(root,'database/migrations')).filter(x=>x.endsWith('.sql')).sort();
const failures=[];
const tables=new Set([...schemaSql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:[\"']?)([A-Za-z0-9_]+)(?:[\"']?)/gi)].map(m=>m[1]));
const indexes=new Set([...schemaSql.matchAll(/CREATE (?:UNIQUE )?INDEX\s+(?:IF NOT EXISTS\s+)?(?:[\"']?)([A-Za-z0-9_]+)(?:[\"']?)/gi)].map(m=>m[1]));
const dropped=new Set();
for(const file of migrations){
  const sql=fs.readFileSync(path.join(root,'database/migrations',file),'utf8');
  for(const m of sql.matchAll(/DROP TABLE(?: IF EXISTS)?\s+([A-Za-z0-9_]+)/gi)) dropped.add(m[1]);
  for(const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([A-Za-z0-9_]+)/gi)) if(!m[1].endsWith('_new') && !m[1].endsWith('_v2') && !tables.has(m[1]) && !dropped.has(m[1])) failures.push(`table missing from current schema: ${m[1]} (${file})`);
  for(const m of sql.matchAll(/ALTER TABLE\s+([A-Za-z0-9_]+)\s+ADD COLUMN\s+([A-Za-z0-9_]+)/gi)) if(tables.has(m[1]) && !new RegExp(`\\b${m[2]}\\b`,'i').test(schema)) failures.push(`column missing from current schema: ${m[1]}.${m[2]} (${file})`);
}
for(const required of ['plans','subscriptions','subscription_policies','operational_access_leases','activation_review_requests']) if(!tables.has(required)) failures.push(`required current-state table missing: ${required}`);
if(!schema.includes('PRAGMA foreign_keys=ON;')) failures.push('foreign-key enforcement declaration missing');
if(failures.length){console.error('Current schema gate: FAIL');for(const x of failures.slice(0,40))console.error(`- ${x}`);process.exit(1)}
console.log(`Current schema gate: PASS (${tables.size} tables, ${indexes.size} indexes)`);
