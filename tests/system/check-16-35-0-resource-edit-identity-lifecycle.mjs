import assert from 'node:assert/strict';
import fs from 'node:fs';
const ds=fs.readFileSync('src/worker/security/platform-data-studio.service.js','utf8');
const explorer=fs.readFileSync('src/worker/security/platform-resource-explorer.service.js','utf8');
assert.match(ds,/Preview and commit must validate the same canonical identity/);
assert.match(ds,/if\(immutableCodeTypes\.has\(resourceType\)\)[\s\S]*?input\.code=resourceType==='product_country'\?canonicalCode\.toUpperCase\(\):canonicalCode/);
assert.match(explorer,/stoppableTypes\.has\(type\)\?\['STOP'\]:\[\]/);
assert.match(explorer,/Trash\/purge stay unavailable until a type-specific dependency-safe deletion contract exists/);
console.log('16.35.0 canonical edit identity and lifecycle capability contracts: PASS');
