/* ON Mission 11.04.0 — Super Admin Operating System UI replacement gate. */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const registry=fs.readFileSync('public/assets/js/frontend/admin/workspace-registry.js','utf8');
const shell=fs.readFileSync('public/assets/js/frontend/admin/shell.js','utf8');
const palette=fs.readFileSync('public/assets/js/frontend/admin/command-palette.js','utf8');
const runtime=fs.readFileSync('public/assets/js/frontend/admin/admin-runtime.js','utf8');
const os=fs.readFileSync('public/assets/js/frontend/admin/operating-system.js','utf8');
const service=fs.readFileSync('src/worker/modules/admin-control/super-admin-operating-system.service.js','utf8');
const routes=fs.readFileSync('src/worker/modules/admin-control/super-admin-operating-system.routes.js','utf8');

for(const required of ['COMMAND','RESOURCES','RELEASE','LAUNCH','OPERATE','GOVERN','RECOVER'])assert.ok(registry.includes(`label:'${required}'`),`missing navigation group ${required}`);
for(const required of ['overview','resource-management','product-publisher','release-center','launch-center','companies','roles','missions','human-platform','security','recovery-reconciliation'])assert.ok(registry.includes(`'${required}'`)||registry.includes(`['${required}`),`missing workspace ${required}`);
assert.ok(shell.includes('READ-ONLY')&&shell.includes('NORMAL'),'Safe Mode control missing');
assert.ok(runtime.includes('READ_ONLY_MODE_ACTIVE'),'Safe Mode mutation guard missing');
assert.ok(runtime.includes("/api/platform/admin/")&&runtime.includes('step-up'),'server-backed admin mutation boundary preserved');
assert.ok(palette.includes('/api/platform/admin/resource-search'),'Command Palette does not search canonical resources');
assert.ok(palette.includes('openResourceExplorer'),'Resource result opens the unified Resource Explorer');
assert.ok(os.includes('Canonical Action Matrix')&&os.includes('Release Center')&&os.includes('Launch Journey'),'Operating System projections incomplete');
assert.ok(routes.includes('/api/platform/admin/operating-system')&&routes.includes('/api/platform/admin/resource-search')&&routes.includes('/api/platform/admin/action-matrix'),'Operating System routes incomplete');
assert.ok(service.includes('readOnlyProjection:true')&&service.includes('authoritative:false'),'Operating System must declare projection boundary');
assert.ok(service.includes('ACTION_REGISTRY')&&service.includes('ACTION_SERVICE_MAP'),'Operating System must derive action inventory canonically');
assert.ok(!service.includes('INSERT INTO')&&!service.includes('UPDATE ')&&!service.includes('DELETE FROM'),'Operating System must not add a shadow mutation authority');
assert.ok(shell.includes('sa-primary-nav')&&shell.includes('sa-sidebar')&&shell.includes('sa-workspace-header'),'new Super Admin layout shell is missing');
assert.ok(!shell.includes('control-journey-bar')&&!shell.includes('control-plane-map')&&!shell.includes('admin-command-shell'),'retired Control Plane layout must not remain in the live shell');
console.log('11.04.0 Super Admin Operating System UI replacement gate: PASS');
