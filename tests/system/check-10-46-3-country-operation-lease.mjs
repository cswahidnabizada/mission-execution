import fs from "node:fs";
const route=fs.readFileSync("src/worker/modules/admin-control/admin-build-data.routes.js","utf8");
const launch=fs.readFileSync("src/worker/modules/admin-control/admin-launch-config.routes.js","utf8");
const all=route+"\n"+launch;
if(/markPlatformAdminOperation(?:Executing|Verifying)\(env,operation\.operation\.id/.test(all)) throw new Error("Administrative operation lifecycle must pass the lease-bearing operation object, not only its id.");
for(const token of ["/api/platform/admin/countries","country-catalog:","markPlatformAdminOperationExecuting(env,operation.operation)","markPlatformAdminOperationVerifying(env,operation.operation)"]) if(!all.includes(token)) throw new Error(`country operation lease contract missing ${token}`);
console.log("10.50.0 country operation lease gate: PASS");
