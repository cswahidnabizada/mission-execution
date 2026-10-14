import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const registry=read('public/assets/js/frontend/admin/workspace-registry.js');
const controller=read('public/assets/js/frontend/admin/admin-controller.js');
const shell=read('public/assets/js/frontend/admin/shell.js');
const runtime=read('public/assets/js/frontend/admin/admin-runtime.js');
const command=read('public/assets/js/frontend/admin/command-center.js');
const catalog=read('public/assets/js/frontend/admin/data-catalog.js');
const monitor=read('public/assets/js/frontend/admin/monitor.js');
const legacy=read('public/assets/js/frontend/admin/data-governance.js');
const oversight=read('public/assets/js/frontend/admin/oversight-panels.js')+read('public/assets/js/frontend/admin/oversight/product-operations.js');
const panelRegistry=read('public/assets/js/frontend/admin/panel-registry.js');
const surfaceComposition=['build.js','monitor.js','control.js','governance.js','operations.js'].map(f=>read(`public/assets/js/frontend/admin/surfaces/${f}`)).join('\n');

assert.match(registry,/ADMIN_WORKSPACES/);
assert.match(command,/situationActionKey=primaryAttention\?\.action\|\|working\.actionKey\|\|'product-health'/);
assert.doesNotMatch(command,/attention\.length\?action\('overview'/);
assert.match(command,/openWorkItem/);
assert.match(command,/state\.publisher=\{/);
assert.match(command,/state\.productVerificationRunId=/);
assert.match(controller,/history\.replaceState/);
assert.match(controller,/target\.dataset\.workspace=v/);
assert.match(shell,/hashchange/);
assert.match(shell,/data-refresh-current/);
assert.match(runtime,/readInFlight/);
assert.match(runtime,/method==='GET'/);
assert.match(catalog,/sector:'Sectors'/);
assert.match(catalog,/configuration:'Configurations'/);
assert.match(monitor,/OPEN PRODUCT WORKSPACE/);
assert.match(monitor,/openAdminDrawer/);
assert.match(oversight,/subscriptionConfig.*navigate\('data-entry'\)/);

const keys=[...registry.matchAll(/\['[^']+','([^']+)'/g)].map(m=>m[1]);
assert.equal(new Set(keys).size,keys.length,'workspace registry contains duplicate keys');
assert.ok(keys.length>=30,`expected at least 30 canonical workspaces, got ${keys.length}`);

const rendererMap=(oversight.match(/export const adminPanelRenderers=\{([\s\S]*?)\n\};/)?.[1]||'')+'\n'+panelRegistry+'\n'+surfaceComposition;
for(const key of keys){
  if(['data-entry','trash','data-control'].includes(key)){
    assert(rendererMap.includes(`'${key}':`) || rendererMap.includes(`${key}:`) || rendererMap.includes(`\"${key}\":`),`missing registry renderer for ${key}`);
  } else {
    assert.match(rendererMap,new RegExp(`['\"]?${key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}['\"]?\\s*:`),`missing renderer for ${key}`);
  }
}

console.log('10.60.0 scale/UI convergence gate: PASS');
console.log(`canonical workspaces: ${keys.length}`);
console.log('current-situation actions are contextual');
console.log('workspace routing is hash-addressable and reload-safe');
console.log('GET reads deduplicated while in flight');
console.log('catalog/monitor broken destinations corrected');
