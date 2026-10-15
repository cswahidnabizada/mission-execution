import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const version=readFileSync('VERSION','utf8').trim();
assert.ok(['10.78.0','10.79.0','10.81.0','10.82.0','10.83.0','10.85.1','10.85.2','10.87.0','10.88.0','10.89.0','10.90.0','10.91.0','10.92.0','10.93.0','10.94.0','10.95.0','10.97.0','11.02.0','11.03.0','11.04.0','11.04.1','11.05.0','11.05.1','11.06.0','11.07.0','11.08.0','11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16'].includes(version),`VERSION is ${version}`);
const admin=readFileSync('public/assets/js/frontend/admin/admin.js','utf8');
const context=readFileSync('public/assets/js/frontend/admin/oversight/context.js','utf8');
const shell=readFileSync('public/assets/js/frontend/admin/shell.js','utf8');
const registry=readFileSync('public/assets/js/frontend/admin/workspace-registry.js','utf8');
const panels=readFileSync('public/assets/js/frontend/admin/oversight-panels.js','utf8');
const panelRegistry=readFileSync('public/assets/js/frontend/admin/panel-registry.js','utf8');
const entry=readFileSync('public/platform/access/admin/index.html','utf8');
const command=readFileSync('public/assets/js/frontend/admin/command-center.js','utf8');

assert.match(admin,/import \{setAdminShow\} from '\.\/oversight\/context\.js\?v=\d+\.\d+\.\d+'/,'Bootstrap must import the canonical navigation binder directly');
assert.match(admin,/setAdminShow\(show\)/,'Bootstrap must bind the canonical controller navigation before any workspace renders');
assert.match(admin,/configureAdminPanelShow\(show\)/,'Workspace registry must receive the same canonical navigation authority');
assert.match(context,/Canonical admin navigation is unavailable/,'Missing navigation must fail closed');
assert.match(shell,/data-view="product-publisher"/,'Shell must expose the product build journey');
assert.match(shell,/data-view="product-verification"/,'Shell must expose the product proof journey');
assert.match(shell,/data-view="product-health"/,'Shell must expose the live product operating journey');
assert.match(shell,/data-view="system-health"/,'Shell must expose platform control/health');
assert.match(shell,/data-view="backup-recovery"/,'Shell must expose recovery/continuity');
assert.match(shell,/Build → release → operate → govern → recover/,'Shell must communicate the Control Plane operating model');
assert.match(entry,/admin\.js\?v=\d+\.\d+\.\d+/,'Production admin entry must load a versioned release module');
assert.match(command,/Canonical admin navigation is unavailable/,'Command Center must fail explicitly when its canonical dependency is missing');

const keys=[...registry.matchAll(/\['([^']+)','([^']+)'/g)].map(m=>m[2]);
const routeKeys=[...panels.matchAll(/(?:^|\n)\s*['"]?([a-z0-9-]+)['"]?\s*:/g)].map(m=>m[1]);
for(const key of keys){ const dataGovernance=['data-entry','trash','data-control'].includes(key); assert.ok(routeKeys.includes(key)||dataGovernance||key==='overview',`Workspace ${key} must have a canonical renderer route`); }
for(const key of ['data-entry','trash','data-control']) assert.match(panelRegistry,new RegExp(`(?:['\"]${key}['\"]|${key})\\s*:`),`${key} must remain routed through the canonical data-governance authority`);
console.log(`10.78.x Control Plane runtime architecture gate: PASS (${keys.length} registered workspace routes)`);
console.log('Canonical navigation is explicitly bound at bootstrap; product journey, recovery and workspace composition are structurally covered.');
