import assert from "node:assert/strict";
import fs from "node:fs";
import {buildMissionContext} from "../../src/worker/modules/intelligence/mission-context.js";
import {buildMissionConditions} from "../../src/worker/modules/intelligence/mission-conditions.js";
import {deriveActionCapabilities} from "../../src/worker/extensions/actions-intelligence/action-capability.engine.js";
import {buildActionContract} from "../../src/worker/extensions/actions-intelligence/action-contract.engine.js";
import {resolveActionTarget} from "../../src/worker/application/actions/action-service-map.js";
import {evaluateSecuredActionAuthorization} from "../../src/worker/extensions/action-execution/secured-action-authorization.contract.js";

const mission={id:246,reference:"SN:100140",company_id:1,status:"Pending",public_enabled:1,updated_at:"2026-09-13T10:00:00Z"};
const conditions=buildMissionConditions(buildMissionContext(mission,{role:"admin",accessKind:"owner"}));
const managementActions=[
  {code:"approve_foryou_request",label:"Approve Request",domain:"distribution",confirmation:true,forYouRequestId:110},
  {code:"decline_foryou_request",label:"Decline Request",domain:"distribution",confirmation:true,forYouRequestId:110}
];
const capabilities=deriveActionCapabilities({conditions,featureState:{foryou:{pending:true,relation:"owner",id:110}}});
const contract=buildActionContract(capabilities,{conditions,featureState:{foryou:{pending:true,relation:"owner",id:110}},missionId:246,forYouRequestId:110,managementActions});
assert.equal(contract.primary?.code,"approve_foryou_request");
assert.equal(contract.primary?.target?.endpoint,"/api/public/requests/110/approve");
assert.ok(contract.all.some(a=>a.code==="approve_foryou_request"));
assert.ok(contract.all.some(a=>a.code==="decline_foryou_request"));
assert.equal(resolveActionTarget("approve_foryou_request",{missionId:246,forYouRequestId:110})?.endpoint,"/api/public/requests/110/approve");
const auth=evaluateSecuredActionAuthorization({session:{identityId:20,tenantId:1,role:"admin"},access:{accessKind:"owner",tenantId:1,mission:{...mission,foryou_request_id:110}},actionCode:"approve_foryou_request",mission:{...mission,foryou_request_id:110}});
assert.equal(auth.authorized,true);
const mm=fs.readFileSync("src/worker/extensions/mission-management/mission-management.service.js","utf8");
const workspace=fs.readFileSync("public/assets/ui/canonical-mission-workspace.js","utf8");
assert.match(mm,/Approve Request/);
assert.match(mm,/Decline Request/);
assert.match(mm,/public_mission_requests/);
assert.match(workspace,/approve_foryou_request/);
assert.match(workspace,/decline_foryou_request/);
console.log("PASS: 10.31.45 owner ForYou request is projected and actionable in canonical workspace");
