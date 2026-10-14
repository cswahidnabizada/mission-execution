import fs from 'node:fs'; import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url).pathname; const js=fs.readFileSync(root+'public/assets/js/extensions/dashboard-work-surface-102945.js','utf8');
for(const f of ['src/worker/extensions/action-execution/secured-action-authorization.contract.js','src/worker/extensions/action-execution/secured-action-execution.contract.js','src/worker/extensions/action-execution/secured-action-execution.routes.js','src/worker/modules/transitions/transition-safety.service.js']) assert.ok(fs.existsSync(root+f),`missing ${f}`);
assert.match(js,/secured-action-execution-102940\.js/); assert.match(js,/executeActionTarget/); console.log('PASS protected secured mutation/action boundaries');
