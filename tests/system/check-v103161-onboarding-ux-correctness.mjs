import fs from "node:fs";import path from "node:path";import {spawnSync} from "node:child_process";
const root=process.cwd(),fail=[];const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const register=read("public/assets/js/pages/register.js"),access=read("public/assets/js/pages/access.js"),verify=read("public/verification.html"),widget=read("public/assets/js/core/activation-module.js"),missions=read("public/missions.html"),custody=read("src/worker/extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js");
if(!register.includes("/verification.html?onboarding=1"))fail.push("registration_does_not_enter_verification_onboarding");
if(!access.includes("/api/user/operational-gate"))fail.push("login_does_not_route_unready_users_through_operational_gate");
for(const t of ["onMissionActivation","activation-module.js","Identity, ON Mission Trust, access, billing and reviewer requests in one canonical flow."] )if(!verify.includes(t))fail.push("verification_page_missing:"+t);
if(!widget.includes("mode='dashboard'")||!widget.includes("mode==='full'"))fail.push("activation_module_not_standalone_ready");
if(!missions.includes("api/auth/session"))fail.push("missions_compatibility_bridge_missing");
if(!custody.includes("operationalMissionHref(c.mission_id"))fail.push("custody_notification_still_points_to_legacy_missions_page");
for(const f of ["public/assets/js/pages/register.js","public/assets/js/pages/access.js","public/assets/js/core/activation-module.js","public/assets/js/extensions/canonical-dashboard-runtime.js","src/worker/extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js"]){const r=spawnSync(process.execPath,["--check",path.join(root,f)],{encoding:"utf8"});if(r.status!==0)fail.push("syntax:"+f+"\n"+r.stderr)}
const stale=read("public/marketplace/index.html");if(/v=10\.5\.0/.test(stale))fail.push("marketplace_stale_cache_version");
if(fail.length){console.error("FAIL 10.31.61 Onboarding UX correctness");for(const x of fail)console.error(" - "+x);process.exit(1)}console.log("PASS 10.31.61 onboarding UX correctness: registration enters guided verification, unverified access is guided, legacy mission routing is repaired, active assets are cache-forward");
