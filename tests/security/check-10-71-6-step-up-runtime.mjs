import assert from 'node:assert/strict';
import {createPlatformSuperAdminSession,createPlatformSuperAdminStepUpSession,readPlatformSuperAdminStepUp,readPlatformSuperAdministrator} from '../../src/worker/security/platform-super-administrator.js';

const SECRET='step-up-runtime-test-secret';
const env={PLATFORM_SUPER_ADMIN_SECRET:SECRET,PLATFORM_SUPER_ADMIN_SESSION_GENERATION:'17'};
const request=(path,cookie='')=>new Request(`https://onmissionok.test${path}`,{method:'POST',headers:{Cookie:cookie}});
const cookie=(name,value)=>`${name}=${encodeURIComponent(value)}`;

const sessionToken=await createPlatformSuperAdminSession(env,request('/api/platform/access/admin/login'));
const sessionCookie=cookie('onmission_platform_super_admin',sessionToken);
const sessionReq=request('/api/platform/admin/platform-configurations/42/activate',sessionCookie);
const actor=await readPlatformSuperAdministrator(sessionReq,env);
assert.ok(actor?.nonce,'session must expose a nonce for step-up binding');

const scope='POST:/api/platform/admin/platform-configurations/42/activate';
const stepToken=await createPlatformSuperAdminStepUpSession(env,sessionReq,SECRET,scope);
const bothCookie=`${sessionCookie}; ${cookie('onmission_platform_super_admin_stepup',stepToken)}`;

assert.ok(await readPlatformSuperAdminStepUp(request('/api/platform/admin/platform-configurations/42/activate',bothCookie),env,scope),'same session + same route must verify');
assert.equal(await readPlatformSuperAdminStepUp(request('/api/platform/admin/platform-configurations/43/activate',bothCookie),env,'POST:/api/platform/admin/platform-configurations/43/activate'),null,'step-up must not cross resource scope');
assert.equal(await readPlatformSuperAdminStepUp(request('/api/platform/admin/platform-configurations/42/rollback',bothCookie),env,'POST:/api/platform/admin/platform-configurations/42/rollback'),null,'step-up must not cross action scope');

const secondSession=await createPlatformSuperAdminSession(env,request('/api/platform/access/admin/login'));
const secondCookie=`${cookie('onmission_platform_super_admin',secondSession)}; ${cookie('onmission_platform_super_admin_stepup',stepToken)}`;
assert.equal(await readPlatformSuperAdminStepUp(request('/api/platform/admin/platform-configurations/42/activate',secondCookie),env,scope),null,'step-up must not transfer between sessions');

const rotatedEnv={...env,PLATFORM_SUPER_ADMIN_SESSION_GENERATION:'18'};
assert.equal(await readPlatformSuperAdminStepUp(request('/api/platform/admin/platform-configurations/42/activate',bothCookie),rotatedEnv,scope),null,'session generation change must invalidate step-up');

console.log('10.71.6 Step-Up Runtime: PASS — session, generation, action and resource binding verified');
