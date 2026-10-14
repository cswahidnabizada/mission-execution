import fs from "node:fs";
import path from "node:path";
import {identityToSession} from "../../src/worker/modules/auth/auth.service.js";
import {createSession} from "../../src/worker/core/auth-session.js";
import {buildMissionContext} from "../../src/worker/modules/intelligence/mission-context.js";
import {buildMissionConditions} from "../../src/worker/modules/intelligence/mission-conditions.js";
import {deriveMissionFlow} from "../../src/worker/modules/intelligence/mission-flow.engine.js";

const root=process.cwd();
const version=fs.readFileSync(path.join(root,"VERSION"),"utf8").trim();
const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};

assert(/^\d+\.\d+\.\d+$/.test(version),`hardening gate must run against current convergence release release: ${version}`);
const identity=identityToSession({identity_type:"tenant",id:41,company_id:7,role:"admin",login:"admin@example.test",country_code:"DE",session_version:3});
assert(identity.countryCode==="DE","tenant login session must carry authoritative countryCode");

const identityExecutor=identityToSession({identity_type:"executor",id:88,login:"executor@example.test",country_code:"DE",session_version:2});
assert(identityExecutor.countryCode==="DE","executor login session must carry authoritative countryCode");

let stored=null;
await createSession({KV_BINDING:{put:async(_k,v)=>{stored=JSON.parse(v)}}},{...identity});
assert(stored?.countryCode==="DE","created KV session must persist countryCode");
const executorRepo=read("src/worker/repositories/executor.repository.js");
assert(executorRepo.includes("pep.country_code"),"executor login/profile query must carry country_code into the session context");

const context=buildMissionContext({id:1,reference:"M-1",company_id:7,status:"Cancelled"},{role:"admin"});
const conditions=buildMissionConditions(context,{role:"admin"});
const flow=deriveMissionFlow(conditions);
assert(context.lifecycle.terminal===true,"cancelled mission context must be terminal");
assert(flow.state==="terminal"&&flow.task===null,"cancelled mission flow must be terminal with no execution task");
assert(conditions.progress.canAdvance===false,"terminal mission cannot advance");

const launch=read("src/worker/security/country-product-launch.service.js");
assert(/export async function retireCountryProductLaunch[\s\S]*?env\.DB\.batch\(\[[\s\S]*?UPDATE country_product_launches SET status='retired',active=0/.test(launch),"country launch retirement must execute an atomic D1 batch mutation");

const nav=read("public/assets/js/frontend/product-experience.js");
assert(nav.includes("return base.map"),"trusted navigation must preserve the canonical Human Work destinations even when product presentation is incomplete");
const store=read("public/assets/js/frontend/situation/store.js");
assert(store.includes("/api/bootstrap")&&store.includes("productError")&&store.includes("d.product"),"authenticated shell must use the unified bootstrap projection and keep product failures explicit");
const bootstrap=read("src/worker/modules/bootstrap.routes.js");
assert(bootstrap.includes('router.get("/api/bootstrap"')&&bootstrap.includes("Promise.all")&&bootstrap.includes("resolveUserSituation(env,session,{productConfiguration:base})"),"unified bootstrap must compose session, product and situation from one authenticated context");
const http=read("src/worker/core/http.js");
assert(http.includes("export function publicErrorMessage")&&http.includes("if (status >= 500) return fallback")&&http.includes('error:"Internal server error"'),"public error mapping must suppress internal server errors");
const auth=read("src/worker/modules/auth/auth.routes.js");
assert(auth.includes("Password recovery email is not configured yet.")&&auth.includes("publicError:true"),"known public recovery configuration error must remain user-visible without exposing arbitrary 5xx details");
const userSituation=read("src/worker/security/user-situation.service.js");
assert(userSituation.includes("deriveProductJourney")&&userSituation.includes("stage:'verification'")&&userSituation.includes("stage:'subscription'"),"product journey readiness is derived from canonical access facts");
const runtimeManifest=read("src/worker/security/product-manifest-runtime.service.js");
assert(runtimeManifest.includes("launchMessage:launch?.manifest?.launchMessage||null")&&runtimeManifest.split("launchMessage:launch?.manifest?.launchMessage||null").length>1,"runtime launch projection must preserve governed launchMessage");
const sessionClient=read("public/assets/js/core/session.js");
const pagination=read("src/worker/core/pagination.js");
assert(pagination.includes("PAGINATION_MAX_LIMIT")&&pagination.includes("PAGINATION_MAX_OFFSET"),"shared pagination policy exists");
const publicRoutes=read("src/worker/modules/public/public.routes.js");
assert(publicRoutes.includes("hasMore")&&publicRoutes.includes("nextOffset"),"public request list is bounded and paginated");
const peopleRoutes=read("src/worker/modules/people/people.routes.js");
assert(peopleRoutes.includes("/api/organization/people")&&peopleRoutes.includes("nextOffset"),"organization people list is bounded and paginated");
const compliance=read("src/worker/security/compliance-context.service.js");
assert(compliance.includes("JURISDICTION_UNRESOLVED")&&compliance.includes("country_unresolved"),"unresolved jurisdiction fails closed");
assert(sessionClient.includes("sessionStorage")&&!sessionClient.includes("localStorage"),"browser session compatibility state must not use persistent localStorage");

const release=read("RELEASE.md");
assert(release.startsWith(`# Mission Execution ${version}`),"RELEASE.md must describe current VERSION");
assert(/Status: (final audited project|protected candidate|hardening candidate)/.test(release),"current release status must be explicit");

const pkg=JSON.parse(read("package.json"));
assert(pkg.scripts["check:release"].includes("check-release-integrity.mjs"),"release integrity must be part of check:release");
assert(pkg.scripts.deploy === "npm run deploy:production", "deploy must delegate to the single production deployment authority");
assert(pkg.scripts["deploy:production"].includes("npm run build") && pkg.scripts["deploy:production"].includes("npm run check:release"), "production deployment must build and release-gate before wrangler deploy");

const build=read("build.sh");
for(const stale of ["check-v103704-subscription-billing.mjs","check-v103608-universalization.mjs","check-v103400-privacy-truth-critical-audit.mjs","check-v103508-compliance-evidence.mjs"]) assert(!build.includes(stale),`build.sh must not hard-wire historical gate ${stale}`);
assert(build.includes("npm run build:css"),"release build must require CSS generation");

console.log(`${version} architecture audit hardening gate: PASS`);
