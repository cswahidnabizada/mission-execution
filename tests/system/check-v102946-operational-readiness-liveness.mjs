import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../..',import.meta.url).pathname;
const js=fs.readFileSync(`${root}/public/assets/js/extensions/dashboard-work-surface-102946.js`,'utf8');
const contract=fs.readFileSync(`${root}/src/worker/extensions/operations-context/operational-readiness.contract.js`,'utf8');
for(const token of ['canonicalReadiness','WAIT / UNBLOCK','NEXT VALID STEP','Readiness','Waiting for','Unblock condition'])assert.ok(js.includes(token),`missing ${token}`);
for(const token of ['buildOperationalReadinessContract','waiting_without_known_condition','createsTruth:false','executesAction:false','authoritative:false'])assert.ok(contract.includes(token),`missing ${token}`);
console.log('10.29.46 operational readiness/liveness gate: PASS');
