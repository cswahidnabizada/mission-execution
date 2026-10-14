import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path";
const r=path.resolve(process.cwd()); const f=fs.readFileSync(path.join(r,"src/worker/application/actions/canonical-action-decision.service.js"),"utf8");
assert.match(f,/CANONICAL_ACTION_DECISION_VERSION="10\.32\.12"/); assert.match(f,/READY/); assert.match(f,/BLOCKED/); assert.match(f,/WAITING/); assert.match(f,/STALE/); assert.match(f,/UNAUTHORIZED/); assert.match(f,/UNAVAILABLE/); assert.match(f,/REQUIRES_INPUT/); assert.match(f,/automaticMutationReplay:false/); assert.match(f,/execution:\{permitted:false,requiresCanonicalApplicationService:true\}/);
console.log("10.32.9 canonical action decision/preparation: PASS");
