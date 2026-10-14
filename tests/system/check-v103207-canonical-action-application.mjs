import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd());
const app=fs.readFileSync(path.join(root,"src/worker/application/actions/canonical-action.application.service.js"),"utf8");
const route=fs.readFileSync(path.join(root,"src/worker/extensions/action-execution/secured-action-execution.routes.js"),"utf8");
const execRoute=fs.readFileSync(path.join(root,"src/worker/extensions/action-execution/canonical-action.routes.js"),"utf8");
const client=fs.readFileSync(path.join(root,"public/assets/js/core/canonical-action-client.js"),"utf8");
const runtime=fs.readFileSync(path.join(root,"public/assets/js/extensions/secured-action-execution.js"),"utf8");
const appJs=fs.readFileSync(path.join(root,"src/worker/app.js"),"utf8");

assert.match(app,/export async function prepareCanonicalAction/);
assert.match(app,/export async function executeCanonicalAction/);
assert.match(app,/actionDefinition\(normalizedCode\)/);
assert.match(app,/requireOperationalAction\(/);
assert.match(app,/resolveUserSituation\(/);
assert.match(app,/resolveActionTarget\(/);
assert.match(app,/evaluateSecuredActionAuthorization\(/);
assert.match(app,/router\.fetch\(targetRequest,env/);
assert.match(app,/X-Idempotency-Key/);
assert.match(app,/X-Mission-State-Token/);
assert.match(app,/authoritative_domain_service/);

assert.match(route,/prepareCanonicalAction\(/);
assert.doesNotMatch(route,/evaluateSecuredActionAuthorization\(/);
assert.doesNotMatch(route,/resolveActionTarget\(/);
assert.doesNotMatch(route,/function normalizeActionPayload/);

assert.match(execRoute,/\/api\/actions\/execute/);
assert.match(execRoute,/executeCanonicalAction\(/);
assert.match(client,/\/api\/actions\/execute/);
assert.doesNotMatch(client,/api\(target\.endpoint/);
assert.match(runtime,/\/api\/actions\/execute/);
assert.doesNotMatch(runtime,/executeSecuredActionTarget/);
assert.match(appJs,/registerCanonicalActionRoutes\(router\)/);

console.log("10.32.7 canonical action application pipeline: PASS");
