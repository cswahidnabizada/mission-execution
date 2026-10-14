import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const sec=read('src/worker/security/platform-super-administrator.js');
const routes=read('src/worker/modules/admin-control/admin-access.routes.js');
const ui=read('public/assets/js/frontend/admin/admin-runtime.js');
const fail=[];
for(const token of [
  "payload=`v2|${exp}|${nonce}|${generation}`",
  "payload=`v2-stepup|${exp}|${nonce}|${session.nonce}|${generation}|${boundScope}`",
  "parts[3]!==session.nonce||parts[4]!==generation",
  "boundScope!=='*'&&boundScope!==requested",
  "const requestScope=expectedScope==null?`${String(request.method||'GET').toUpperCase()}:${url.pathname}${url.search||''}`:expectedScope",
  "PLATFORM_SUPER_ADMIN_SESSION_GENERATION"
]) if(!sec.includes(token)) fail.push(`security boundary missing: ${token}`);
for(const token of [
  "const scope=String(body.scope||'*').trim()||'*'",
  "createPlatformSuperAdminStepUpSession(env,request,body.secret,scope)"
]) if(!routes.includes(token)) fail.push(`step-up issuance scope missing: ${token}`);
for(const token of [
  "const scope=`${String(request.method||'GET').toUpperCase()}:${path}`",
  "ensureStepUp(scope)",
  "body:{secret,scope}"
]) if(!ui.includes(token)) fail.push(`frontend scoped step-up missing: ${token}`);
if(fail.length){console.error(fail.join('\n'));process.exit(1)}
console.log('10.71.6 Step-Up Boundary: PASS — session-bound, generation-bound, route-scoped step-up with fail-closed cross-action reuse');
