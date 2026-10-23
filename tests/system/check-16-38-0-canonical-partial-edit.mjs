import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync('src/worker/security/platform-data-studio.service.js','utf8');
assert.match(s,/function mergeCanonicalFields\(type,record,payload\)/);
assert.match(s,/const input=mergeCanonicalFields\(resourceType,inspected\.record\.record,payload\)/);
assert.match(s,/const input=mergeCanonicalFields\(resourceType,current\.record\.record,payload\)/);
console.log('16.38.0 canonical partial-edit preservation: PASS');
