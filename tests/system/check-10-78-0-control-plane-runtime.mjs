import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const version=readFileSync('VERSION','utf8').trim();
const versionAtLeast=(actual,minimum)=>{const a=String(actual).split('.').map(Number),b=String(minimum).split('.').map(Number);if(a.length!==3||b.length!==3||!a.every(Number.isInteger)||!b.every(Number.isInteger))return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return true;};
assert.ok(versionAtLeast(version, '10.78.0'),`VERSION is ${version}`);
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
