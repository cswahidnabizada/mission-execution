import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const source = read('public/assets/js/frontend/admin/market-factory.js');
const css = read('public/assets/css/frontend/admin.css');
const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('RELEASE-MANIFEST.json'));

assert.equal(read('VERSION').trim(), '16.98.0');
assert.equal(pkg.version, '16.98.0');
assert.equal(manifest.version, '16.98.0');
assert.match(source, /function bindStageConfiguration/);
assert.match(source, /\/api\/platform\/admin\/resource-search\?q=/);
for (const state of ['ALREADY_AVAILABLE','NEEDS_CONFIGURATION','REQUIRES_APPROVAL','BLOCKED','CANDIDATE_FOUND','NOT_FOUND_IN_SEARCH_SCOPE','AUTHORITY_UNAVAILABLE']) {
  assert.ok(source.includes(state), `Missing dependency state ${state}`);
}
assert.match(read('RELEASE.md'), /Search misses are explicitly labeled/);
assert.match(source, /CONFIRM & SAVE NEW VERSION/);
assert.match(source, /CANCEL/);
assert.match(source, /ensureStepUp\('POST:\/api\/platform\/admin\/market-factory\/import'\)/);
assert.match(source, /api\('\/api\/platform\/admin\/market-factory\/import'/);
assert.match(source, /state\.marketFactory\.selectedVersionId=Number\(created\.id\)/);
assert.match(source, /await refresh\(\)/);
assert.match(source, /Duplicate staged/);
assert.match(source, /Country ISO code must contain exactly two letters/);
assert.match(source, /A search miss is not proof/);
assert.match(css, /\.mf-dependency-preview/);
assert.match(read('RELEASE.md'), /16\.98\.0 — Unified Super Admin & Market Operations/);
assert.match(pkg.scripts['check:release'], /check-16-95-0-intelligent-market-dependency-resolution\.mjs/);
console.log('16.98.0 intelligent market dependency resolution: PASS');
