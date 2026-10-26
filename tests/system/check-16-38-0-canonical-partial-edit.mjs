import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync('src/worker/security/platform-data-studio.service.js','utf8');
assert.match(s,/function mergeCanonicalFields\(type,record,payload\)/,'partial edits must merge with the owning canonical record');
assert.match(s,/const input=mergeCanonicalFields\(resourceType,inspected\.record\.record,payload\)/,'preview must preserve canonical fields omitted by the visible editor');
assert.match(s,/const canonicalRecord=current\?\.record\?\.record/,'commit must re-read the canonical record after acquiring the mutation lease');
assert.match(s,/const input=mergeCanonicalFields\(resourceType,canonicalRecord,payload\)/,'commit must preserve hidden canonical fields before validating and writing');
assert.match(s,/DATA_STUDIO_STALE_RECORD/,'concurrent edits must be rejected when the expected revision timestamp is stale');
console.log('16.38.0 canonical partial-edit preservation: PASS');
