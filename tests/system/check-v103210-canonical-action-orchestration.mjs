import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path";
const r=path.resolve(process.cwd()); const f=fs.readFileSync(path.join(r,"src/worker/application/actions/canonical-action-orchestration.service.js"),"utf8");
assert.match(f,/CANONICAL_ACTION_ORCHESTRATION_VERSION="10\.32\.12"/); assert.match(f,/automaticExecution:false/); assert.match(f,/automaticMutationReplay:false/); assert.match(f,/VERIFY_AND_REASSESS/); assert.match(f,/STOP_AND_REASSESS/);
console.log("10.32.10 canonical action orchestration: PASS");
