import fs from 'node:fs';import assert from 'node:assert/strict';
const h=fs.readFileSync('public/admin.html','utf8'),j=fs.readFileSync('public/assets/js/extensions/canonical-dashboard-runtime.js','utf8');
for(const id of ['workQueueHost','workbench','workQueueSearch']) assert.match(h,new RegExp(`id="${id}"`));
for(const area of ['home','work','network','people','insights']) assert.match(h,new RegExp(`data-exp-area="${area}"`));
for(const marker of ['contextQueueRows','renderContextQueue','openWork','loadNetwork','loadPeople']) assert.ok(j.includes(marker),marker);
console.log('10.30.27 Adaptive Context Queues & Object Workspace Focus: PASS');
