import assert from 'node:assert/strict';
import {classifyMarketReadiness} from '../../src/worker/security/market-readiness-reconciliation.js';
import fs from 'node:fs';

const preview = classifyMarketReadiness({
  operations: [
    {domain:'country',identity:'DE',operation:'CREATE'},
    {domain:'content',identity:'privacy-notice-de',operation:'UPDATE'},
    {domain:'sector',identity:'logistics',operation:'REUSE'}
  ],
  conflicts: [{code:'MARKET_CONTENT_SCOPE_CONFLICT',identity:'privacy-notice-de',message:'Content is scoped to a different country.'}]
});
assert.equal(preview.readOnly, true);
assert.equal(preview.safeToApply, false);
assert.equal(preview.issues.length, 2);
assert.equal(preview.issues[0].state, 'REQUIRES_GOVERNED_CREATE');
assert.equal(preview.issues[0].owner, 'Product Country Catalog');
assert.equal(preview.issues[1].state, 'BLOCKED');
assert.equal(preview.issues[1].category, 'SCOPE_CONFLICT');
assert.match(preview.issues[1].nextStep, /owning authority/i);
assert.equal(preview.counts.BLOCKED, 1);
assert.equal(preview.counts.REQUIRES_GOVERNED_CREATE, 1);
const clean = classifyMarketReadiness({operations:[{domain:'sector',identity:'logistics',operation:'REUSE'}],conflicts:[]});
assert.equal(clean.safeToApply,true);
assert.equal(clean.issues.length,0);
const service = fs.readFileSync(new URL('../../src/worker/security/market-factory.service.js', import.meta.url),'utf8');
assert.match(service,/classifyMarketReadiness\(\{operations,conflicts\}\)/);
assert.match(service,/issues:reconciliation\.issues/);
const ui = fs.readFileSync(new URL('../../public/assets/js/frontend/admin/market-factory.js', import.meta.url),'utf8');
assert.match(ui,/Issues and next governed steps/);
assert.match(ui,/This is not a runtime or launch certification/);
console.log('16.10.29 Product & Market Readiness Reconciliation: PASS');
