import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const fail=[];const ok=(c,m)=>c?void 0:fail.push(m);
const dash=read("public/assets/js/extensions/canonical-dashboard-runtime.js");
const actions=read("public/assets/js/core/canonical-workspace-actions.js");
const map=read("src/worker/application/actions/action-service-map.js");
const registry=read("src/worker/application/actions/action-registry.js");
const client=read("public/assets/js/core/canonical-action-client.js");
const admin=read("public/admin.html");

ok(dash.includes("workspaceActions"),"tenant runtime must consume canonical workspace action model");
ok(dash.includes("data-queue-action"),"work queue must expose executable canonical actions");
ok(dash.includes("data-network-action"),"network queue must expose executable canonical actions");
ok(dash.includes("data-person-manage"),"people workspace must expose canonical Manage entry point");
ok(dash.includes("executeCanonicalObjectAction"),"workspace actions must execute through canonical action client");
ok(actions.includes("toggle_driver_status"),"workspace action model must support driver status");
ok(actions.includes("suspend_trust"),"workspace action model must support trust suspension");
ok(actions.includes("accept_trust"),"workspace action model must support trust acceptance");
ok(actions.includes("archive_customer"),"workspace action model must support customer archive");
ok(map.includes('toggle_driver_status:route("people"'),"driver status must have canonical service route");
ok(map.includes('body:ctx=>({active:Boolean(ctx.payload?.active)})'),"driver status route must carry canonical active payload");
ok(registry.includes('TOGGLE_DRIVER_STATUS:"toggle_driver_status"'),"driver status must remain canonical");
ok(client.includes('/api/actions/resolve-target'),"all workspace mutations must resolve through canonical server target");
ok(!dash.includes('await api(`/api/drivers/${id}/status`'),"tenant runtime must not directly mutate driver status");
ok(!dash.includes('await api(`/api/network/tenant-trust/'),"tenant runtime must not directly mutate trust relationships");
const currentVersion=read('VERSION').trim();
ok(admin.includes(currentVersion),"tenant dashboard cache identity must be current");

if(fail.length){console.error(`10.31.94 workspace convergence: FAIL (${fail.length})`);for(const x of fail)console.error(`- ${x}`);process.exit(1);}
console.log("10.31.94 workspace convergence: PASS");
console.log("People + Network + Work queues: canonical dynamic action surfaces");
console.log("Driver status + trust relationship mutations: canonical target execution");
console.log("Workspace action model: shared across tenant object surfaces");
