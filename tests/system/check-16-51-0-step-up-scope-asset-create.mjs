import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../../public/assets/js/frontend/admin/resource-management.js',import.meta.url),'utf8');
const security=fs.readFileSync(new URL('../../src/worker/security/platform-super-administrator.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../../public/assets/js/frontend/admin/admin-runtime.js',import.meta.url),'utf8');
const explorer=fs.readFileSync(new URL('../../public/assets/js/frontend/admin/resource-explorer.js',import.meta.url),'utf8');
// Creation must not pass an opaque label to a route-bound step-up API.
assert.doesNotMatch(ui,/ensureStepUp\(`resource-create:\$\{type\}`\)/,'asset type labels are not valid step-up scopes');
assert.match(ui,/const commitPath=`\/api\/platform\/admin\/data-entry\/\$\{encodeURIComponent\(entry\.entry_id\)\}\/commit`;if\(!await ensureStepUp\(`POST:\$\{commitPath\}`\)\)return;const result=await api\(commitPath/,'step-up must be bound to the exact canonical commit route');
assert.match(security,/function normalizeStepUpScope\(scope\)/,'server must normalize and validate route-bound scopes');
assert.match(security,/if\(boundScope!==\'\*\'&&boundScope!==requested\)return null/,'step-up token must remain bound to the requested route');
assert.match(runtime,/PLATFORM_SUPER_ADMIN_STEP_UP_REQUIRED/,'runtime must request step-up only after the server identifies a protected route');
assert.doesNotMatch(explorer,/ensureStepUp\(`resource-[^`]*`\)/,'resource actions must not send opaque labels as route-bound step-up scopes');
assert.match(explorer,/ensureStepUp\(`POST:\$\{restorePath\}`\)/,'restore must bind step-up to the actual restore route');
assert.match(explorer,/ensureStepUp\(`POST:\$\{actionPath\}`\)/,'edit and lifecycle actions must bind step-up to their canonical route');
console.log('16.51.0 asset creation step-up scope regression: PASS');
