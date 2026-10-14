import fs from 'node:fs';
import assert from 'node:assert/strict';
import {applySecurityHeaders} from '../../src/worker/security/request-security.js';

const read=p=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
assert.equal(read('VERSION').trim(),'10.38.12');
assert.equal(pkg.version,'10.38.12');

const security=read('src/worker/security/request-security.js');
const auth=read('src/worker/modules/admin-control/admin-control.routes.js');
const session=read('src/worker/security/platform-super-administrator.js');

assert(security.includes("response.headers.get('Set-Cookie')"),'security wrapper must preserve Set-Cookie with a portable fallback');
assert(auth.includes("onmission_platform_super_admin=${superToken}"),'Super Admin login must issue the canonical cookie');
assert(session.includes("const COOKIE='onmission_platform_super_admin'"),'session verifier must read the canonical cookie');
assert(session.includes('PLATFORM_SUPER_ADMIN_SECRET'),'session must remain signed by the platform secret');

const original=new Response(JSON.stringify({success:true}),{status:200,headers:{'Content-Type':'application/json'}});
original.headers.set('Set-Cookie','onmission_platform_super_admin=test-token; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=1800');
const secured=applySecurityHeaders(original,{isApi:true,isHttps:true});
assert.equal(secured.headers.get('Set-Cookie'),'onmission_platform_super_admin=test-token; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=1800');

console.log('10.38.12 Super Admin cookie/session preservation: PASS');
