import fs from 'node:fs';import assert from 'node:assert/strict';
const h=fs.readFileSync('public/admin.html','utf8'),c=fs.readFileSync('public/assets/ui/canonical-ui-system.css','utf8');
for(const a of ['home','work','network','people','insights']) assert.match(h,new RegExp(`data-exp-area="${a}"`));
assert.match(h,/id="workQueueHost"/);assert.match(h,/id="workbench"/);assert.match(c,/\.exp-side/);assert.match(c,/\.work-shell/);
console.log('Canonical dashboard navigation + work shell: PASS');
