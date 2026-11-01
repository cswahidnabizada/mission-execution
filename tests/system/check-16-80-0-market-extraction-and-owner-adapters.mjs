import fs from 'node:fs';
import assert from 'node:assert/strict';
import {listOwnerLifecycleAdapters,executeOwnerLifecycleCommand} from '../../src/worker/security/owner-lifecycle-adapters.service.js';
import {getGermanyLogisticsExtractionSnapshot} from '../../src/worker/security/market-extraction.service.js';

const adapters=listOwnerLifecycleAdapters();
assert.deepEqual(adapters.map(x=>x.resourceType),['sector','product_country','country_blueprint','product_definition','policy','configuration']);
for(const adapter of adapters){assert.ok(adapter.ownerAuthority);assert.ok(adapter.adapter);assert.ok(Array.isArray(adapter.supportedCommands));assert.ok(Array.isArray(adapter.unsupportedCommands));}
assert.ok(adapters.find(x=>x.resourceType==='product_definition').ownerAuthority==='Product Factory');
assert.ok(adapters.find(x=>x.resourceType==='sector').supportedCommands.includes('inspect'));
assert.ok(!adapters.find(x=>x.resourceType==='sector').supportedCommands.includes('activate'));
assert.ok(!adapters.find(x=>x.resourceType==='policy').supportedCommands.includes('activate'));
assert.ok(adapters.find(x=>x.resourceType==='product_country').supportedCommands.includes('deactivate'));
assert.ok(adapters.find(x=>x.resourceType==='configuration').supportedCommands.includes('activate'));
assert.ok(!adapters.find(x=>x.resourceType==='country_blueprint').supportedCommands.includes('prepare_for_launch'));
assert.ok(!adapters.find(x=>x.resourceType==='product_definition').supportedCommands.includes('compile'));
await assert.rejects(()=>executeOwnerLifecycleCommand({}, {}, {resourceType:'sector',resourceId:'logistics',command:'activate'},'test'),e=>e.code==='OWNER_LIFECYCLE_COMMAND_NOT_SUPPORTED');

const sql=[];
const db={prepare(query){return {bind(...args){return {first:async()=>{sql.push({query,args});return null;},all:async()=>({results:[]})}}}}};
const snapshot=await getGermanyLogisticsExtractionSnapshot({DB:db});
assert.equal(snapshot.market.key,'DE-logistics');
assert.equal(snapshot.extraction.mode,'CANONICAL_REFERENCE_ONLY');
assert.equal(snapshot.extraction.duplicateCreationAllowed,false);
assert.equal(snapshot.readiness.status,'BLOCKED');
assert.ok(snapshot.readiness.blockers.some(x=>x.code==='PRODUCT_COUNTRY_DE_MISSING'));
assert.ok(snapshot.rules.some(x=>x.includes('not a Market Package')));
const route=fs.readFileSync('src/worker/modules/admin-control/admin-build-data.routes.js','utf8');
assert.ok(route.includes('/api/platform/admin/resource-management/owner-lifecycle-adapters'));
assert.ok(route.includes('/api/platform/admin/market-factory/extraction/germany-logistics'));
console.log('16.80.0 market extraction and owner adapter contract: PASS (6 owners; unsupported transitions fail closed; extraction is read-only and duplicate-safe)');
