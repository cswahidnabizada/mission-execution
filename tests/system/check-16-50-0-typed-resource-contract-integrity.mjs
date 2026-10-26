import assert from 'node:assert/strict';
import {REUSABLE_DATA_DEFINITIONS} from '../../src/worker/security/platform-reusable-data.service.js';
import {dataEntryDefinition,prepareDataEntry} from '../../src/worker/security/platform-data-entry.service.js';
import fs from 'node:fs';
const service=fs.readFileSync(new URL('../../src/worker/security/platform-data-entry.service.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../../public/assets/js/frontend/admin/resource-management.js',import.meta.url),'utf8');
assert.ok(Object.keys(REUSABLE_DATA_DEFINITIONS).length>0,'reusable resource contracts must exist');
for(const [type,definition] of Object.entries(REUSABLE_DATA_DEFINITIONS)){
  const contract=dataEntryDefinition(type);
  assert.ok(contract,`${type} must have a governed Data Entry contract`);
  for(const field of definition.fields||[])assert.ok(Object.hasOwn(contract.schema,field),`${type}.${field} must be accepted by the canonical server contract`);
  for(const field of contract.required||[])assert.ok(Object.hasOwn(contract.schema,field),`${type}.${field} required field must exist in its schema`);
}
assert.match(service,/unknownFields=Object\.keys\(input\)\.filter\(key=>!Object\.hasOwn\(definition\.schema,key\)\)/,'unknown fields must be rejected before normalization can silently discard them');
assert.match(service,/DATA_ENTRY_UNKNOWN_FIELDS/,'unknown-field failures must have a stable error code');
assert.match(service,/error\.details=\{entryType:type,unknownFields:unknownFields\.sort\(\),allowedFields:Object\.keys\(definition\.schema\)\.sort\(\)\}/,'unknown-field errors must explain the type contract');
await assert.rejects(()=>prepareDataEntry({}, {role:'platform_super_administrator',id:'test-actor'}, {entryType:'sector',payload:{code:'test-sector',name:'Test Sector',unexpectedField:'must-not-be-dropped'},purpose:'configuration',classification:'CONFIGURATION',idempotencyKey:'test-key'}), error=>error?.code==='DATA_ENTRY_UNKNOWN_FIELDS' && error?.details?.unknownFields?.includes('unexpectedField'));
assert.match(ui,/const resourceStatus=x=>String\(x\?\.status\?\?\(x\?\.active===0\?'inactive':x\?\.active===1\|\|x\?\.active===true\?'active':'unknown'\)\)/,'missing status must not be misreported as active');
console.log(`16.50.0 typed resource contract integrity: PASS (${Object.keys(REUSABLE_DATA_DEFINITIONS).length} reusable resource types)`);
