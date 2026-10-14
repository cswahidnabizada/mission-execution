import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const fail=[]; const ok=(condition,msg)=>condition?void 0:fail.push(msg);
const files=p=>fs.readdirSync(path.join(root,p),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(p,e.name)):[path.join(p,e.name)]);
const dash=read("public/assets/js/extensions/canonical-dashboard-runtime.js");
const driver=read("public/assets/js/pages/my-driver.js");
const client=read("public/assets/js/core/canonical-action-client.js");
const map=read("src/worker/application/actions/action-service-map.js");
const route=read("src/worker/extensions/actions-intelligence/actions-intelligence.routes.js");
const registry=read("src/worker/application/actions/action-registry.js");
const ui=read("public/assets/js/core/action-registry.js");

ok(client.includes("/api/actions/resolve-target"),"canonical action client must resolve targets through the server");
ok(client.includes("executeCanonicalObjectAction"),"canonical object executor missing");
ok(route.includes("api\\/actions\\/resolve-target"),"server canonical target resolver missing");
ok(route.includes("resolveActionTarget"),"server target resolver must use Action Service Map");
ok(map.includes('edit_driver_operational_profile'),"operational profile action missing from service map");
ok(registry.includes('EDIT_DRIVER_OPERATIONAL_PROFILE:"edit_driver_operational_profile"'),"operational profile action missing from server registry");
ok(ui.includes('edit_driver_operational_profile'),"operational profile action missing from frontend registry");

const forbidden=[
  'await api(`/api/drivers/${id}`,jsonOptions',
  'await api(`/api/drivers/${id}/status`,jsonOptions',
  'await api(`/api/drivers/${id}/credentials`,jsonOptions',
  'await api(`/api/network/customers/${id}`,jsonOptions',
  'await api(`/api/network/customers/${id}/locations`,jsonOptions',
  'await api(`/api/network/tenants/${id}/trust`',
  'await api(`/api/network/tenant-trust/${num(r.id)'
];
for(const pattern of forbidden)ok(!dash.includes(pattern),`legacy direct mutation remains in canonical dashboard: ${pattern}`);
for(const pattern of forbidden)ok(!driver.includes(pattern),`legacy direct mutation remains in driver page: ${pattern}`);

const legacy=[
 "canonical-action-experience-103035.js","canonical-action-experience-103037.js","canonical-action-experience-103038.js",
 "canonical-action-experience-103039.js","canonical-action-experience-103040.js","operational-contexts-103014.js",
 "operational-contexts-103016.js","operational-contexts-103017.js","operational-contexts-103030.js",
 "operational-contexts-103033.js","secured-action-execution-103033.js","dashboard-domain-contexts-103034.js"
];
const all=files("public").map(x=>path.basename(x));
for(const name of legacy)ok(!all.includes(name),`legacy frontend runtime file still exists: ${name}`);
for(const name of legacy)ok(!files("public").some(f=>fs.readFileSync(path.join(root,f),"utf8").includes(name)),`legacy runtime reference remains: ${name}`);

const html=files("public").filter(f=>f.endsWith(".html"));
for(const f of html){const s=read(f);ok(!/10\.31\.(8[0-9]|90|91)/.test(s),`stale frontend cache version in ${f}`);}

// The object action set must stay fully represented by the service map.
const actionNames=[...registry.matchAll(/^\s{2}([A-Z0-9_]+):"([a-z0-9_]+)",?$/gm)].map(m=>m[2]);
for(const code of ["edit_driver","edit_driver_operational_profile","toggle_driver_status","remove_driver","request_trust","accept_trust","reject_trust","suspend_trust","add_customer_location","archive_customer"])
  ok(actionNames.includes(code),`server registry missing ${code}`), ok(map.includes(`  ${code}:`),`service map missing ${code}`);

if(fail.length){console.error(`10.31.92 regression: FAIL (${fail.length})`);for(const x of fail)console.error(`- ${x}`);process.exit(1);}
console.log("10.31.92 regression: PASS");
console.log("Canonical frontend runtime: one object-action execution client");
console.log("Legacy action/context facades: removed after reference proof");
console.log("People + Network mutation paths: canonical target resolution");
