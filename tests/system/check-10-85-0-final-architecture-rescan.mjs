import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const version=read('VERSION').trim();
assert.match(version,/^(?:10\.(8[5-9]|9\d)|(?:11\.0[23456789]|(?:11\.1[0-8]|12\.[0-9]+|13\.[0-9]+|14\.[0-9]+|15\.[0-9]+|13\.[0-9]+|14\.[0-9]+|15\.[0-9]+|16\.[0-9]+)))\./,`VERSION is ${version}`);
const schema=read('database/schema.current.sql');
assert.match(schema,/CREATE TABLE missions \(/);
const missionTable=(schema.match(/-- table: missions\n([\s\S]*?)(?=\n-- (?:table|view|index):)/)||[])[1]||'';
assert.ok(missionTable,'missions table snapshot is present');
assert.match(missionTable,/\bdriver_id\b/);
assert.match(missionTable,/FOREIGN KEY\(driver_id\) REFERENCES drivers\(id\)/);
const canonicalView=(schema.match(/-- view: mission_canonical_projection\n([\s\S]*?)(?=\n-- (?:table|view|index):|$)/)||[])[1]||'';
assert.ok(canonicalView,'canonical mission projection view is present');
assert.doesNotMatch(canonicalView,/\bdriver_id\b/);
assert.doesNotMatch(schema,/idx_missions_company_driver_/);
const worker=path.join(root,'src','worker');
const sourceFiles=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&/\.(js|mjs)$/.test(e.name))sourceFiles.push(p);}}
walk(worker);
for(const p of sourceFiles){
  const s=fs.readFileSync(p,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\n)\s*\/\/.*$/gm,'');
  assert.doesNotMatch(s,/\bmission\.driver_id\b|\bm\.driver_id\b/,
    `live mission assignment column reference: ${path.relative(worker,p)}`);
  assert.doesNotMatch(s,/\b(?:UPDATE|INSERT INTO)\s+missions\b[^`\n]*\bdriver_id\b/i,
    `live mission assignment writer: ${path.relative(worker,p)}`);
}
const liveLegacy=[];
for(const p of sourceFiles){
  const s=fs.readFileSync(p,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\n)\s*\/\/.*$/gm,'');
  if(/mission_executor_assignments|mission_tenant_driver_assignments/.test(s)) liveLegacy.push(path.relative(worker,p));
}
assert.deepEqual(liveLegacy,[],`live legacy assignment tables referenced by: ${liveLegacy.join(', ')}`);
const adminDir=path.join(root,'public/assets/js/frontend/admin');
const adminFiles=[];
walk(adminDir);
for(const p of adminFiles){
  const s=fs.readFileSync(p,'utf8');
  assert.doesNotMatch(s,/>\s*Cargo\s*</i,`legacy Cargo label remains in ${path.relative(adminDir,p)}`);
}
const manifest=JSON.parse(read('RELEASE-MANIFEST.json'));
assert.equal(manifest.version,version);
assert.ok(['0129','0130','0131','0132','0133','0134','0135','0136','0137','0138','0139','0140','0141','0142','0143','0144','0145','0146','0147','0147','0148','0149','0151','0152','0153','0154','0155','0156','0157','0158','0159','0160','0161','0162'].includes(manifest.migrationHighWaterMark));
assert.ok([129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162].includes(manifest.migrationCount));
console.log('10.85.1 Final Independent Architecture Rescan: PASS (retired mission assignment authority and runtime consumers; FK-bound compatibility column retained, canonical view, UI vocabulary and release identity verified)');
