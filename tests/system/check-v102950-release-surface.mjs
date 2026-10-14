import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../..',import.meta.url).pathname;
const html=fs.readFileSync(`${root}/public/admin.html`,'utf8');
assert.ok(html.includes('dashboard-work-surface-102950.css?v=10.29.50&build=10.29.50'));
assert.ok(html.includes('dashboard-work-surface-102950.js?v=10.29.50&build=10.29.50'));
assert.ok(!html.includes('dashboard-work-surface-102949.js?v=10.29.49&build=10.29.49'));
console.log('10.29.50 release surface integrity gate: PASS');
