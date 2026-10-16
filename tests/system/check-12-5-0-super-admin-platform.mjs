import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const version=read('VERSION').trim();
assert.ok(['12.5.0','12.5.1','12.5.2','12.5.3','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35'].includes(version));
const explorer=read('src/worker/security/platform-resource-explorer.service.js');
const resources=read('public/assets/js/frontend/admin/resource-management.js');
const bridge=read('public/assets/js/frontend/admin/resource-explorer.js');
const registry=read('public/assets/js/frontend/admin/workspace-registry.js');
const shell=read('public/assets/js/frontend/admin/shell.js');
// Canonical detail reads must not rehydrate a selected record through the search/list projection.
assert.match(explorer,/async function readReusableExact\(env,type,id\)/);
assert.match(explorer,/readReusableExact\(env,type,id\)/);
assert.doesNotMatch(explorer,/if\(reusableTypes\.has\(type\)\)\{const projection=await listReusableData/);
// Resource Explorer is no longer a second UI surface; it is only a compatibility action bridge.
assert.match(bridge,/canonical UI is the Resources workspace/);
assert.match(bridge,/workspace:'resource-management'/);
assert.match(bridge,/export async function runResourceAction/);
assert.match(bridge,/export async function restoreResource/);
// Resource workspace actions perform governed mutations instead of reopening a drawer/no-op.
assert.match(resources,/runResourceAction\(r,action\)/);
assert.match(resources,/restoreResource\(r,r\.trashState\?\.id\)/);
assert.doesNotMatch(resources,/if\(action==='restore'\)\{openResourceExplorer/);
// One canonical resource workspace; legacy data surfaces are not primary navigation entries.
assert.match(registry,/key:'resources'/);
assert.match(registry,/Resource Management/);
assert.match(shell,/resourceAliases=new Set\(\['data-entry','data-catalog','data-studio','data-control','trash'\]\)/);
console.log('12.5.0 Super Admin platform convergence: PASS');
console.log('Canonical detail read, single Resources workspace, governed action execution, and legacy-surface convergence are structurally certified.');
