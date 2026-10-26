import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui=fs.readFileSync(new URL('../../public/assets/js/frontend/admin/resource-management.js',import.meta.url),'utf8');
const service=fs.readFileSync(new URL('../../src/worker/security/platform-data-entry.service.js',import.meta.url),'utf8');
assert.match(ui,/classification:\(\['CANONICAL','REFERENCE','CONFIGURATION','OPERATIONAL','USER_GENERATED','IMPORTED','SAMPLE','TEST','DRAFT','SENSITIVE'\]/);
assert.doesNotMatch(ui,/classification:d\.risk===['\"]high['\"]\?'GOVERNED':'PLATFORM'/);
assert.match(service,/DATA_ENTRY_CLASSIFICATIONS/);
console.log('16.47.0 resource create classification contract: PASS');
