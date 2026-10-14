import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const version=readVersion();
const exists=(p)=>fs.existsSync(path.join(root,p));
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
function readVersion(){return fs.readFileSync(path.join(root,'VERSION'),'utf8').trim()}
assert(!exists('public/assets/js/frontend/admin/admin-legacy-panels.js'),'Legacy monolithic admin panel module must be retired');
assert(exists('public/assets/js/frontend/admin/panel-registry.js'),'Canonical panel registry missing');
assert(exists('public/assets/js/frontend/admin/oversight-panels.js'),'Oversight workspace module missing');
assert(exists('public/assets/js/frontend/admin/data-governance.js'),'Data governance workspace module missing');
const admin=read('public/assets/js/frontend/admin/admin.js');
assert(admin.includes(`panel-registry.js?v=${version}`),'Admin bootstrap must compose through the canonical panel registry');
const registry=read('public/assets/js/frontend/admin/panel-registry.js');
for(const token of ['renderDataEntry','renderDataControl','renderTrash','configureAdminPanelShow']) assert(registry.includes(token),`Panel registry missing ${token}`);
const governance=read('public/assets/js/frontend/admin/data-governance.js');
for(const token of ['renderDataEntry','renderDataControl','renderTrash','setGovernanceShow']) assert(governance.includes(token),`Governance module missing ${token}`);
console.log('10.71.4 admin decomposition: PASS');
