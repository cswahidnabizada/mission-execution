import assert from "node:assert/strict";
import fs from "node:fs";

const auth=fs.readFileSync("src/worker/modules/auth/auth.service.js","utf8");
const routes=fs.readFileSync("src/worker/modules/auth/auth.routes.js","utf8");
const verification=fs.readFileSync("public/verification.html","utf8");
const verificationJs=fs.readFileSync("public/assets/js/pages/verification.js","utf8");
const register=fs.readFileSync("public/register.html","utf8");
const registerJs=fs.readFileSync("public/assets/js/pages/register.js","utf8");
const app=fs.readFileSync("src/worker/app.js","utf8");
const widget=fs.readFileSync("public/assets/js/core/activation-module.js","utf8");
const service=fs.readFileSync("src/worker/modules/verification/verification.service.js","utf8");

assert.doesNotMatch(auth,/checkBalmCompany|balm-registration|tenant-registration:\$\{data\.registrationToken\}/);
assert.doesNotMatch(routes,/\/api\/auth\/tenant\/verify-balm/);
assert.doesNotMatch(app,/registerBalmRoutes|balm\.routes/);
assert.doesNotMatch(register,/CHECK BALM|BALM MATCH|BALM register|verify-balm/i);
assert.doesNotMatch(registerJs,/BALM|verify-balm|registrationToken/i);
assert.doesNotMatch(verification,/BALM|balm/i);
assert.doesNotMatch(verificationJs,/BALM|balm|\/api\/balm/i);
assert.doesNotMatch(widget,/BALM|balm/i);
assert.doesNotMatch(service,/"balm"|\bBALM\b/i);
console.log("PASS 10.31.57: registration/verification has no active BALM dependency");
