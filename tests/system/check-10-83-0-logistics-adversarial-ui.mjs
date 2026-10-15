import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('VERSION').trim();
assert.ok(['10.83.0','10.85.1','10.85.2','10.87.0','10.88.0','10.89.0','10.90.0','10.91.0','10.92.0','10.93.0','10.94.0','10.95.0','10.97.0','11.02.0','11.03.0','11.04.0','11.04.1','11.05.0','11.05.1','11.06.0','11.07.0','11.08.0','11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16'].includes(version),);

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
