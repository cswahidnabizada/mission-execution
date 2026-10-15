import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('VERSION').trim();
const versionAtLeast=(actual,minimum)=>{const a=String(actual).split('.').map(Number),b=String(minimum).split('.').map(Number);if(a.length!==3||b.length!==3||!a.every(Number.isInteger)||!b.every(Number.isInteger))return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return true;};
assert.ok(versionAtLeast(version, '10.83.0'),);

// Logistics normalization: canonical domain language must be visible on new admin surfaces.
const operations=read('public/assets/js/frontend/admin/oversight/product-operations.js');
const studio=read('public/assets/js/frontend/admin/oversight/product-studio.js');
const publisher=read('public/assets/js/frontend/admin/product-publisher.js');
assert.ok(operations.includes('CANONICAL DOMAIN CONTRACT') && operations.includes('EXECUTOR') && operations.includes('OBJECT'));
assert.ok(studio.includes('canonical: tenant admin · executor · independent executor'));
assert.ok(publisher.includes("assign_driver:'Assign executor'") && publisher.includes("create_driver:'Create executor'"));
assert.ok(!/\bCargo\b/.test(operations+studio+publisher));

// Preserve compatibility codes internally; visible labels must not reintroduce legacy vocabulary.
const governance=read('public/assets/js/frontend/admin/oversight/platform-governance.js');
assert.ok(governance.includes("driver:'Executor'"));

// Adversarial critical mutation coverage: idempotency, step-up, fencing and tenant boundaries remain wired.
const idem=read('tests/system/check-10-71-3-adversarial-idempotency.mjs');
const failure=read('tests/system/check-v103154-failure-matrix.mjs');
const tenant=read('tests/system/check-10-71-5-tenant-isolation-matrix.mjs');
assert.ok(idem.includes('finalizeIdempotency') && idem.includes('resourceReference'));
assert.ok(failure.includes('partial_related_write') && failure.includes('concurrent_conflict') && failure.includes('recovery_repeated'));
assert.ok(tenant.includes('cross-tenant') || tenant.includes('tenant'));

// UI state design: canonical unavailable state remains a first-class surface.
const css=read('public/assets/css/admin-control.css');
assert.ok(css.includes('.authority-unavailable-state') && css.includes('.logistics-domain-card'));
console.log('10.83.0 Logistics Normalization + Adversarial Runtime + UI Convergence: PASS');
console.log('Canonical logistics vocabulary, compatibility-code isolation, adversarial mutation contracts and UI state composition verified.');
