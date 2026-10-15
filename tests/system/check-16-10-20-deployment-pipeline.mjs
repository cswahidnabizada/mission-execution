import fs from 'node:fs';
import assert from 'node:assert/strict';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = fs.readFileSync('VERSION', 'utf8').trim();
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('RELEASE-MANIFEST.json', 'utf8'));
const contract = fs.readFileSync('docs/16.9.0-DEPLOYMENT-CONTRACT.md', 'utf8');
const release = fs.readFileSync('RELEASE.md', 'utf8');

assert.ok(version.localeCompare('16.10.20',undefined,{numeric:true})>=0, 'deployment pipeline contract must remain covered by later releases');
assert.equal(pkg.version, version, 'package version must match VERSION');
assert.equal(lock.version, version, 'lockfile root version must match VERSION');
assert.equal(lock.packages[''].version, version, 'lockfile package root must match VERSION');
assert.equal(manifest.version, version, 'release manifest must match VERSION');
assert.equal(pkg.scripts.deploy, 'npm run deploy:production', 'default deploy command must use the governed production script');
const production = pkg.scripts['deploy:production'];
const requiredInOrder = [
  'npm run build',
  'npm run check:release',
  'npm run check:production-certification',
  'npm run migrate:production',
  'wrangler deploy'
];
let cursor = -1;
for (const command of requiredInOrder) {
  const next = production.indexOf(command, cursor + 1);
  assert.ok(next > cursor, `production deployment must include ${command} in required order`);
  cursor = next;
}
assert.ok(contract.includes('npm run deploy'), 'deployment contract must name canonical deploy command');
assert.ok(contract.includes('Do not configure `npx wrangler deploy`'), 'deployment contract must forbid ungated raw deploy command');
assert.ok(release.includes(`# Mission Execution ${version}`), 'release notes must identify candidate');
console.log('16.10.20 deployment pipeline + release identity contract: PASS');
