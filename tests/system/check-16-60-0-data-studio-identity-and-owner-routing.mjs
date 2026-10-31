import assert from 'node:assert/strict';import fs from 'node:fs';
const root=new URL('../../',import.meta.url);
const studio=fs.readFileSync(new URL('public/assets/js/frontend/admin/data-studio.js',root),'utf8');
const resources=fs.readFileSync(new URL('public/assets/js/frontend/admin/resource-management.js',root),'utf8');
assert.match(studio,/IMMUTABLE_EDIT_FIELDS=new Set\(\['id','code','role_code','canonical_resource_id','tenant_id','tenantId','company_id','companyId','countryCode','country_code'/,'immutable identity and scope must be omitted from client mutation payload');
assert.match(studio,/if\(safeJson\(value\)!==safeJson\(original\)\)payload\[field\]=value/,'updates must submit only dirty fields');
assert.match(resources,/canonicalType\(r\.type\)==='product_definition'[\s\S]*?OWNER_WORKSPACE/,'product definitions must bypass unsupported generic Data Studio inspection');
assert.match(resources,/OPEN PRODUCT FACTORY/,'product definition must route to its owning workspace');
console.log('16.60.0 identity omission and owner routing: PASS');
