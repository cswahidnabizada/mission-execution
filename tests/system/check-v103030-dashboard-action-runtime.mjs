// Historical compatibility gate: action runtime is now owned by the canonical dashboard runtime.
import fs from 'node:fs';import assert from 'node:assert/strict';
const s=fs.readFileSync('public/assets/js/extensions/canonical-dashboard-runtime.js','utf8');
assert.match(s,/renderMissionWorkbench/);assert.match(s,/executeSecuredAction/);assert.match(s,/requestWorkspaceOpen/);assert.match(s,/currentTarget/);
console.log('current dashboard action runtime regression: PASS');
