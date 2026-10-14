import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../..',import.meta.url).pathname;
const html=fs.readFileSync(`${root}/public/admin.html`,'utf8');
assert.ok(html.includes('dashboard-work-surface-102953.js'));
assert.ok(html.includes('dashboard-work-surface-102953.css'));
assert.ok(!html.includes('dashboard-work-surface-102952.js'));
assert.ok(!html.includes('dashboard-work-surface-102952.css'));
console.log('10.29.53 release surface gate: PASS');
