import fs from "node:fs";
const api=fs.readFileSync("public/assets/js/core/api.js","utf8");
const dash=fs.readFileSync("public/assets/js/pages/dashboard-command-center.js","utf8");
const work=fs.readFileSync("public/assets/js/extensions/dashboard-work-surface-102959.js","utf8");
const fy=fs.readFileSync("src/worker/extensions/actions-intelligence/feature-state/foryou.provider.js","utf8");
const mission=fs.readFileSync("src/worker/repositories/mission.repository.js","utf8");
const checks=[
 ["public request uses public marketplace token projection",api.includes("/api/public/missions")&&api.includes("fetchCanonicalMissionStateToken")],
 ["marketplace request button carries state token",dash.includes("data-nm-market-state-token")],
 ["marketplace POST sends mission state token",dash.includes('headers["X-Mission-State-Token"]=stateToken')],
 ["ForYou provider exposes requester company context",fy.includes("requester_company_name")&&fy.includes("requesterCompanyName")],
 ["owner mission read model exposes approved ForYou requester",mission.includes("foryou_approved_request_id")&&mission.includes("foryou_approved_requester_company_name")],
 ["current Workbench preserves all three execution channels",work.includes("MY DRIVER")&&work.includes("TRUSTED NETWORK")&&work.includes("FORYOU")],
 ["current Workbench uses secured assignment service",work.includes("/api/missions/${id}/driver-assignment")&&work.includes("jsonOptions")]
];
for(const [name,ok] of checks){if(!ok)throw new Error(`FAIL: ${name}`);console.log(`PASS: ${name}`);}
