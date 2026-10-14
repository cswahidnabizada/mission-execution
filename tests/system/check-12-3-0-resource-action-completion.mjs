import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime=fs.readFileSync('public/assets/js/frontend/admin/admin-runtime.js','utf8');
const explorer=fs.readFileSync('public/assets/js/frontend/admin/resource-explorer.js','utf8');
const studio=fs.readFileSync('public/assets/js/frontend/admin/data-studio.js','utf8');
const governance=fs.readFileSync('public/assets/js/frontend/admin/data-governance.js','utf8');
const shell=fs.readFileSync('public/assets/js/frontend/admin/shell.js','utf8');
const service=fs.readFileSync('src/worker/security/platform-resource-explorer.service.js','utf8');
const control=fs.readFileSync('src/worker/security/platform-data-control.service.js','utf8');
const routes=fs.readFileSync('src/worker/modules/admin-control/admin-build-data.routes.js','utf8');
const trash=fs.readFileSync('src/worker/security/platform-trash.service.js','utf8');

assert(runtime.includes("X-ONM-Explicit-Governed-Action']!=='1'"),'Safe mode must allow only explicitly governed UI mutations through the frontend boundary.');
assert(explorer.includes('ensureStepUp'),'Resource Explorer mutations must require Super Admin step-up.');
assert(explorer.includes("X-ONM-Explicit-Governed-Action':'1'"),'Resource Explorer mutations must explicitly declare governed intent.');
assert(explorer.includes('data-action="restore"'),'Resource Explorer must expose restore for quarantined records.');
assert(explorer.includes('/api/platform/admin/trash/'),'Resource Explorer restore must use the canonical Trash authority.');
assert(explorer.includes("workspace:'data-studio'"),'Component edits must converge on Data Studio.');
assert(explorer.includes("'data-control'"),'Direct lifecycle-managed records must converge on Data Control.');
assert(studio.includes('X-ONM-Explicit-Governed-Action'),'Data Studio writes must declare governed intent.');
assert(governance.includes("X-ONM-Explicit-Governed-Action"),'Data Control / Trash UI writes must declare governed intent.');
assert(shell.includes('state.dataStudioSelection') && shell.includes('state.dataControlSelection'),'Shell must preserve the selected Resource Explorer record when handing off to canonical workspaces.');
assert(service.includes('trashState') && service.includes("actions.push('RESTORE')"),'Resource Explorer must project active Trash state and restore capability.');
assert(control.includes("requirePlatformSuperAdminStepUp" ) || routes.includes("requirePlatformSuperAdminStepUp"),'Critical mutations must remain Super Admin step-up protected.');
assert(routes.includes('/api/platform/admin/trash/'),'Canonical Trash restore/purge routes must remain available.');
assert(trash.includes('TENANT_PURGE_REQUIRES_PRIVACY_ERASURE'),'Tenant permanent erasure must remain behind the canonical privacy erasure authority.');
assert(!explorer.includes('DELETE FROM') && !explorer.includes('UPDATE ') && !explorer.includes('INSERT INTO'),'Resource Explorer frontend must not become a second mutation authority.');
console.log('12.3.0 Super Admin Resource Action Completion: PASS');
