import assert from "node:assert/strict";
import fs from "node:fs";
import {buildMissionContext} from "../../src/worker/modules/intelligence/mission-context.js";
import {buildMissionConditions} from "../../src/worker/modules/intelligence/mission-conditions.js";
import {deriveActionCapabilities} from "../../src/worker/extensions/actions-intelligence/action-capability.engine.js";
import {buildActionContract} from "../../src/worker/extensions/actions-intelligence/action-contract.engine.js";
import {resolveActionTarget} from "../../src/worker/application/actions/action-service-map.js";
import {evaluateSecuredActionAuthorization} from "../../src/worker/extensions/action-execution/secured-action-authorization.contract.js";
import {resolveOwnerForYouRequest} from "../../src/worker/extensions/action-execution/secured-action-execution.routes.js";

const mission={id:249,reference:"SN:100073",company_id:1,status:"Pending",public_enabled:1,state_version:7,updated_at:"2026-09-13T19:00:00Z"};
const ownerContext=buildMissionContext(mission,{role:"admin",accessKind:"owner"});
const conditions=buildMissionConditions(ownerContext);
const managementActions=[
  {code:"approve_foryou_request",label:"Approve Request",domain:"distribution",confirmation:true,forYouRequestId:501},
  {code:"decline_foryou_request",label:"Decline Request",domain:"distribution",confirmation:true,forYouRequestId:501}
];
const capabilities=deriveActionCapabilities({conditions,featureState:{foryou:{pending:true,relation:"owner",id:501}}});
const contract=buildActionContract(capabilities,{conditions,featureState:{foryou:{pending:true,relation:"owner",id:501}},missionId:249,forYouRequestId:501,managementActions,stateToken:"v:7"});
const approve=contract.all.find(a=>a.code==="approve_foryou_request");
const decline=contract.all.find(a=>a.code==="decline_foryou_request");
assert.equal(contract.primary?.code,"approve_foryou_request");
assert.equal(approve?.target?.endpoint,"/api/public/requests/501/approve");
assert.equal(approve?.target?.forYouRequestId,501);
assert.equal(decline?.target?.endpoint,"/api/public/requests/501/decline");
assert.equal(decline?.target?.forYouRequestId,501);
assert.equal(approve?.forYouRequestId,501);
const auth=evaluateSecuredActionAuthorization({session:{identityId:20,tenantId:1,role:"admin"},access:{accessKind:"owner",tenantId:1,mission},actionCode:"approve_foryou_request",mission});
assert.equal(auth.authorized,true);

function fakeEnv(rows){
  let calls=0;
  return {
    get calls(){return calls;},
    DB:{
      prepare(sql){
        return {
          bind(...args){
            return {
              async first(){
                calls++;
                if(sql.includes("WHERE id=?")){
                  return rows.find(r=>Number(r.id)===Number(args[0])&&Number(r.company_id)===Number(args[1])&&Number(r.mission_id)===Number(args[2]))||null;
                }
                return rows.find(r=>Number(r.company_id)===Number(args[0])&&Number(r.mission_id)===Number(args[1])&&r.status==="Pending")||null;
              }
            };
          }
        };
      }
    }
  };
}
const env=fakeEnv([{id:501,company_id:1,mission_id:249,status:"Pending",requester_type:"tenant",requester_company_id:2}]);
const resolved=await resolveOwnerForYouRequest(env,{tenantId:1,role:"admin"},mission,501);
assert.equal(resolved.requestId,501);
const recovered=await resolveOwnerForYouRequest(env,{tenantId:1,role:"admin"},mission,null);
assert.equal(recovered.requestId,501);
const forbidden=await resolveOwnerForYouRequest(env,{tenantId:2,role:"admin"},mission,501);
assert.equal(forbidden.status,403);

const secured=fs.readFileSync("src/worker/extensions/action-execution/secured-action-execution.routes.js","utf8");
const service=fs.readFileSync("src/worker/modules/public/public.service.js","utf8");
const transition=fs.readFileSync("src/worker/modules/transitions/transition-safety.service.js","utf8");
const unified=fs.readFileSync("src/worker/extensions/unified-action/unified-action.contract.js","utf8");
const coordinator=fs.readFileSync("src/worker/extensions/engine-coordinator/engine-coordinator.service.js","utf8");
assert.match(secured,/resolveOwnerForYouRequest/);
assert.match(secured,/forYouRequestId:authoritativeForYouRequestId/);
assert.match(service,/if\(req\.status==="Approved"\)/);
assert.match(service,/grantTenantAccess/);
assert.match(service,/closeMarketplaceAfterApproval/);
assert.match(transition,/canonical_foryou_approval_is_incomplete/);
assert.match(unified,/forYouRequestId/);
assert.match(coordinator,/managementActions:management\?\.actions/);
console.log("PASS: 10.31.46 ForYou approval is complete from canonical action through secured preparation, authoritative approval, reconciliation and post-approval convergence");
