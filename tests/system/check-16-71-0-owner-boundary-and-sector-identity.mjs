import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(`../../${p}`,import.meta.url),'utf8');
const studio=read('src/worker/security/platform-data-studio.service.js');
const ui=read('public/assets/js/frontend/admin/resource-management.js');
const manifest=JSON.parse(read('RELEASE-MANIFEST.json'));
// Code-keyed assets may be projected with their canonical key exposed as id/resourceId.
// The server must compare against that owner-held identity, never an empty code field.
assert.ok(studio.includes("canonicalRecord.resourceId??canonicalRecord.resource_id??canonicalRecord.id??''"));
assert.ok(studio.includes("const canonicalCode=String(canonicalRecord.code??canonicalRecord.role_code??current.record.resourceId??''"));
// Product Definitions must never enter the generic Data Studio edit/commit path.
const guard=ui.indexOf("if(tab==='change'&&canonicalType(r.type)==='product_definition')");
const generic=ui.indexOf("if(tab==='change'){const mountId='resourceDataStudioMount'",guard);
assert.ok(guard>=0 && generic>guard);
const ownerBranch=ui.slice(guard,generic);
assert.ok(ownerBranch.includes("workspaceNavigator('product-publisher')"));
assert.ok(ownerBranch.includes('No generic preview or commit request was sent'));
assert.equal(manifest.version,'16.80.0');
console.log('16.72.0 owner boundary and Sector identity regression: PASS');
