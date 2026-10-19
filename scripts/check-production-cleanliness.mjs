import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const version=fs.readFileSync('VERSION','utf8').trim();
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('RELEASE-MANIFEST.json','utf8'));
const nodeVersion=fs.readFileSync('.node-version','utf8').trim();
const nvmrc=fs.readFileSync('.nvmrc','utf8').trim();
assert.equal(version,pkg.version,'canonical VERSION must match the package release identity');
assert.equal(pkg.version,version,'package version must match VERSION');
assert.equal(lock.version,version,'lockfile version must match VERSION');
assert.equal(lock.packages[''].version,version,'lockfile root package version must match VERSION');
assert.equal(manifest.version,version,'release manifest version must match VERSION after generation');
assert.equal(nodeVersion,'24.18.0','Cloudflare Node pin must match supported runtime');
assert.equal(nvmrc,nodeVersion,'nvm and Cloudflare Node pins must match');
for(const stale of [
  'build15.py',
  'BUILD-STATUS.md',
  'NODE24-UPGRADE.md',
  'Mission-Execution-16.10.30-RELEASE-REPORT.txt',
  'Mission-Execution-16.10.31-RELEASE-REPORT.txt',
  'Mission-Execution-16.10.32-RELEASE-REPORT.txt',
  'Mission-Execution-16.10.33-RELEASE-REPORT.txt',
  'Mission-Execution-16.10.34-RELEASE-REPORT.txt',
  'Mission-Execution-16.10.35-RELEASE-REPORT.txt',
  'Mission-Execution-16.10.36-RELEASE-REPORT.txt'
]) assert.equal(fs.existsSync(stale),false,`obsolete root artifact remains: ${stale}`);
for(const required of ['README.md','RELEASE.md','RELEASE-REPORT.txt','VERSION','package.json','package-lock.json','wrangler.jsonc','_worker.js','database/schema.current.sql','database/migrations','src/worker','public','scripts','tests'])
  assert.equal(fs.existsSync(required),true,`required production artifact missing: ${required}`);
const ignore=fs.readFileSync('.gitignore','utf8');
for(const entry of ['.DS_Store','node_modules/','.wrangler/','.env','.dev.vars','*.log','*.tmp']) assert.ok(ignore.includes(entry),`.gitignore missing ${entry}`);
const migrationFiles=fs.readdirSync('database/migrations').filter(name=>name.endsWith('.sql')).sort();
assert.equal(migrationFiles.length,161,'migration count must match the current additive release');
assert.equal(migrationFiles.at(-1).slice(0,4),'0161','migration high-water mark must remain 0160');
const chain=pkg.scripts['check:release'];
assert.match(chain,/check-production-cleanliness\.mjs/,'cleanliness gate must run in the release suite');
console.log(`${version} production cleanliness and version convergence: PASS`);
