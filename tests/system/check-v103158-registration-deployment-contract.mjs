import assert from "node:assert/strict";
import fs from "node:fs";

const routes=fs.readFileSync("src/worker/modules/auth/auth.routes.js","utf8");
const service=fs.readFileSync("src/worker/modules/auth/auth.service.js","utf8");
const contract=fs.readFileSync("src/worker/extensions/action-experience/action-experience.contract.js","utf8");

assert.doesNotMatch(routes,/verifyTenantEligibility/);
assert.doesNotMatch(service,/verifyTenantEligibility/);
const catalog=contract.split("export function actionExperience")[0];
const wf=(catalog.match(/^[ \t]*withdraw_foryou\s*:/gm)||[]).length;
const wn=(catalog.match(/^[ \t]*withdraw_network\s*:/gm)||[]).length;
assert.equal(wf,1,"withdraw_foryou must have one catalog definition");
assert.equal(wn,1,"withdraw_network must have one catalog definition");
console.log("PASS 10.31.58: deployment contract + action experience warnings cleared");
