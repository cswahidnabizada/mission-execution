import assert from 'node:assert/strict';import fs from 'node:fs';
const root=new URL('../../',import.meta.url);
const studio=fs.readFileSync(new URL('public/assets/js/frontend/admin/data-studio.js',root),'utf8');
const resources=fs.readFileSync(new URL('public/assets/js/frontend/admin/resource-management.js',root),'utf8');
assert.ok(studio.includes("if(el.dataset.field==='code'||el.dataset.field==='role_code')return"),'immutable identity must be omitted from client mutation payload');
assert.match(resources,/canonicalType\(r\.type\)==='product_definition'[\s\S]*?OWNER_WORKSPACE/,'product definitions must bypass unsupported generic Data Studio inspection');
assert.match(resources,/OPEN PRODUCT FACTORY/,'product definition must route to its owning workspace');
console.log('16.60.0 identity omission and owner routing: PASS');
