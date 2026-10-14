import fs from 'node:fs'; import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url).pathname;
const js=fs.readFileSync(root+'public/assets/js/extensions/dashboard-work-surface-102945.js','utf8'); const html=fs.readFileSync(root+'public/admin.html','utf8');
assert.match(js,/resolveCanonicalNextAction/); assert.match(js,/convergenceReadiness/); assert.match(js,/closedLoop\?\.act\?\.code/); assert.match(js,/Supporting evidence/); assert.match(js,/secondary=unifiedActions\.filter/); assert.match(js,/\["open_mission","navigate"\]/); assert.match(js,/convergedDecision/);
assert.match(html,/dashboard-work-surface-102945\.css\?v=10\.29\.45&build=10\.29\.45/); assert.match(html,/dashboard-work-surface-102945\.js\?v=10\.29\.45&build=10\.29\.45/);
console.log('PASS 10.29.45 canonical decision convergence');
