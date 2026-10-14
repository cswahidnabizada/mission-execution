import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
assert.match(read('VERSION').trim(),/^(?:10\.(8[5-9]|9\d)|(?:11\.0[23456789]|(?:11\.1[0-8]|12\.[0-9]+|13\.[0-9]+|14\.[0-9]+|15\.[0-9]+|13\.[0-9]+|14\.[0-9]+|15\.[0-9]+|16\.[0-9]+)))\./,`VERSION is ${read('VERSION').trim()}`);
const schema=read('database/schema.current.sql');
assert.match(schema,/CREATE TABLE "?missions"? \(/);
assert.match(schema,/CREATE TABLE \"?missions\"? \([^;]*\bdriver_id\b/);
assert.match(schema,/FOREIGN KEY\(driver_id\) REFERENCES drivers\(id\)/);
assert.doesNotMatch(schema,/CREATE INDEX idx_missions_company_driver_/);
assert.doesNotMatch(schema,/CREATE VIEW mission_canonical_projection AS[\s\S]*m\.driver_id/);
const worker=path.join(root,'src','worker');
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&e.name.endsWith('.js'))files.push(p);}}walk(worker);
const forbidden=[/\bmission\.driver_id\b/g,/\bm\.driver_id\b/g,/\bSELECT[^`\n]*\bdriver_id\b[^`\n]*\bFROM missions\b/gi,/\bUPDATE missions\b[^`\n]*\bdriver_id\b/gi,/\bINSERT INTO missions\b[^`\n]*\bdriver_id\b/gi];
for(const p of files){const s=fs.readFileSync(p,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\n)\s*\/\/.*$/gm,'');for(const re of forbidden)assert.doesNotMatch(s,re,`obsolete mission assignment reference: ${path.relative(worker,p)}`);}
const release=read('RELEASE.md');
for(const token of ['Final Obsolete Code / Schema Retirement','missions.driver_id','canonical assignment authority','Executor','Object','Control Plane'])assert.match(release,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
console.log('10.85.1 Final Obsolete Code/Schema Retirement (Runtime Authority): PASS');
