import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime=fs.readFileSync('public/assets/js/frontend/admin/admin-runtime.js','utf8');
const access=fs.readFileSync('src/worker/modules/admin-control/admin-access.routes.js','utf8');
const mf=fs.readFileSync('src/worker/modules/admin-control/admin-build-data.routes.js','utf8');
const service=fs.readFileSync('src/worker/security/market-factory.service.js','utf8');
const mfUi=fs.readFileSync('public/assets/js/frontend/admin/market-factory.js','utf8');

assert.match(runtime,/status\?scope=\$\{encodeURIComponent\(scope\)\}/,'step-up status must be scope-aware');
assert.match(runtime,/rawApi\(`\/api\/platform\/access\/admin\/status\?scope=/,'verified step-up must check the requested mutation scope');
assert.match(access,/readPlatformSuperAdminStepUp\(request,env,scope\)/,'admin status must evaluate step-up against requested scope');
assert.match(access,/stepUpScope/,'admin status should expose the bound scope for diagnostics');
assert.match(mf,/\/api\/platform\/admin\/market-factory\/import/,'Market Factory import route must remain wired');
assert.match(mf,/requirePlatformSuperAdminStepUp\(request,env\)/,'Market Factory import must remain server-side step-up protected');
assert.match(mf,/sourceFormat==='zip-base64'/,'ZIP base64 intake must remain supported');
assert.match(mf,/format:'json'/,'JSON intake must remain supported');
assert.match(mfUi,/new FormData\(\)/,'ZIP upload should use native multipart intake');
assert.match(runtime,/isRawBody=opt\.body instanceof FormData/,'API transport must preserve multipart boundaries');
assert.match(service,/MARKET_FACTORY_VERSION=RELEASE_VERSION/,'Market Factory version must use canonical release authority');
console.log('16.2+ Market Factory step-up/import continuity: PASS');
