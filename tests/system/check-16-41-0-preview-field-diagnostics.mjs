import fs from 'node:fs';
import assert from 'node:assert/strict';
const route=fs.readFileSync('src/worker/modules/admin-control/admin-build-data.routes.js','utf8');
assert.match(route,/submittedFields:Object\.keys\(previewRequest\?\.payload\|\|\{\}\)\.slice\(0,80\)/,'preview response should expose bounded field names');
assert.match(route,/stage:'preview'/,'preview stage must be explicit');
assert.match(route,/details:e\?\.details&&typeof e\.details==='object'\?e\.details:null/,'structured details must be preserved');
assert.doesNotMatch(route,/submittedValues|payloadValues/,'preview diagnostics must not echo field values');
console.log('16.41.0 preview field diagnostics contract: PASS');
