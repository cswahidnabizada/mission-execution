import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path";
const r=path.resolve(process.cwd()); const f=fs.readFileSync(path.join(r,"src/worker/application/actions/canonical-operational-journey.service.js"),"utf8");
assert.match(f,/CANONICAL_OPERATIONAL_JOURNEY_VERSION="10\.32\.12"/); assert.match(f,/READ_AUTHORITATIVE_TRUTH_THEN_REASSESS/); assert.match(f,/automaticExecution:false/); assert.match(f,/mutationReplay:false/); assert.match(f,/assign_driver/); assert.match(f,/confirm_delivery/);
console.log("10.32.11 canonical operational journeys: PASS");
