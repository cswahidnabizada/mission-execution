import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const fail=[]; const ok=(c,m)=>c?void 0:fail.push(m);
const client=read("public/assets/js/core/canonical-action-client.js");
const ui=read("public/assets/js/core/action-registry.js");
const dash=read("public/assets/js/extensions/canonical-dashboard-runtime.js");
const admin=read("public/admin.html");
const worker=read("src/worker/application/actions/action-registry.js");

ok(ui.includes("export function hasCanonicalAction"),"browser action registry must export hasCanonicalAction");
ok(!ui.includes("export function actionDefinition"),"browser action registry must remain identity-only");
ok(client.includes("import {hasCanonicalAction,normalizeActionId} from \"./action-registry.js\";"),"canonical action client must import only browser-safe registry exports");
ok(!client.includes("actionDefinition"),"canonical action client must not import/use server-only actionDefinition");
ok(client.includes("if(!hasCanonicalAction(normalized))"),"canonical action client must validate action identity with hasCanonicalAction");
ok(!dash.includes("actionDefinition"),"tenant dashboard runtime must not depend on server-only actionDefinition");
const currentVersion=read("VERSION").trim();
ok(admin.includes(currentVersion),"tenant dashboard cache identity must be current");
ok(worker.includes("export function actionDefinition"),"server registry must retain authoritative actionDefinition");

if(fail.length){console.error(`10.31.93 module contract: FAIL (${fail.length})`);for(const x of fail)console.error(`- ${x}`);process.exit(1);}
console.log("10.31.93 module contract: PASS");
console.log("Browser/server Action Registry boundary: PASS");
console.log("Tenant canonical action client import contract: PASS");
