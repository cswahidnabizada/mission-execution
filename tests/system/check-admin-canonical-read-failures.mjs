import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const version=readFileSync('VERSION','utf8').trim();
const file=readFileSync('public/assets/js/frontend/admin/oversight/product-factory.js','utf8');
const selectedBlock=file.slice(file.indexOf('const selectedLaunchWorkspace'),file.indexOf("box.innerHTML=`<div class=\"eyebrow\">SUPER ADMIN · BUILD"));
assert.ok(selectedBlock.length>0,'Product Factory selected canonical read block must exist');
assert.doesNotMatch(selectedBlock,/loadLaunchWorkspace\(selectedLaunchId\)\.catch\(\(\)=>null\)/,'launch workspace failure must not become null');
assert.doesNotMatch(selectedBlock,/product-health\?launchId=\$\{selectedLaunchId\}.*\.catch\(\(\)=>null\)/,'product health failure must not become null');
assert.doesNotMatch(selectedBlock,/lifecycle-health.*\.catch\(\(\)=>null\)/,'lifecycle failure must not become null');
assert.doesNotMatch(selectedBlock,/loadDependencyGraph\(selectedLaunchId\)\.catch\(\(\)=>null\)/,'dependency graph failure must not become null');
assert.match(selectedBlock,/const selectedLaunchWorkspace=selectedLaunchId\?await loadLaunchWorkspace\(selectedLaunchId\):null;/);
assert.match(selectedBlock,/const selectedHealth=selectedLaunchId\?await api\(`\/api\/platform\/admin\/product-health\?launchId=\$\{selectedLaunchId\}`\)\.then\(r=>r\.health\|\|\{\}\):null;/);
assert.match(selectedBlock,/const selectedLifecycle=selectedLaunchId\?await api\(`\/api\/platform\/admin\/country-product-launches\/\$\{selectedLaunchId\}\/lifecycle-health`\)\.then\(r=>r\.health\|\|\{\}\):null;/);
assert.match(selectedBlock,/const selectedGraph=selectedLaunchId\?await loadDependencyGraph\(selectedLaunchId\):null;/);

console.log(`Admin canonical read failure gate: PASS (${version})`);
console.log('Product Factory canonical workspace/health/lifecycle/dependency reads propagate failures to the explicit workspace error boundary.');
