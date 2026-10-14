import assert from "node:assert/strict";
import { evaluateSecuredActionAuthorization } from "../../src/worker/extensions/action-execution/secured-action-authorization.contract.js";
import { buildSecuredActionPreparation } from "../../src/worker/extensions/action-execution/secured-action-execution.contract.js";
import { validateMutationRequest } from "../../src/worker/security/request-security.js";

const mission={id:42,company_id:10,status:"Delivered",assigned_executor_id:7,driver_id:5,delivery_proof_required:0};
const owner={tenantId:10,identityId:100,role:"admin"};
const driver={tenantId:10,identityId:101,role:"driver",driverId:5};
const otherDriver={tenantId:10,identityId:102,role:"driver",driverId:99};
const executor={tenantId:10,identityId:103,role:"executor",executorId:7};
const otherExecutor={tenantId:10,identityId:104,role:"executor",executorId:99};
const ownerAccess={mission,tenantId:10,accessKind:"owner"};

function auth(session,access=ownerAccess,actionCode,override={}){
  return evaluateSecuredActionAuthorization({session,access:{...access},actionCode,mission:{...mission,...override}});
}

assert.equal(auth(owner,ownerAccess,"edit_mission_data").authorized,true,"owner admin can edit owned mission");
assert.equal(auth({...owner,tenantId:11},{...ownerAccess,tenantId:11,accessKind:"owner",mission:{...mission,company_id:11}},"edit_mission_data").authorized,true,"synthetic owner access must be internally consistent");
assert.equal(auth(otherDriver,ownerAccess,"confirm_arrival").authorized,false,"wrong driver cannot execute");
assert.ok(auth(otherDriver,ownerAccess,"confirm_arrival").reasons.includes("responsibility_not_held"));
assert.equal(auth(otherExecutor,ownerAccess,"confirm_arrival").authorized,false,"wrong executor cannot execute");
assert.equal(auth(owner,{...ownerAccess,accessKind:"shared-tenant"},"delete_mission").authorized,false,"shared tenant cannot delete");
assert.equal(auth(owner,ownerAccess,"complete_mission",{assigned_executor_id:7}).authorized,false,"owner cannot complete while external execution owner exists");
assert.equal(auth(executor,{...ownerAccess,accessKind:"owner"},"complete_mission").authorized,true,"assigned executor may complete delivered mission when evidence is satisfied");
assert.equal(auth(driver,{...ownerAccess,accessKind:"owner"},"confirm_delivery",{status:"InTransit",delivery_proof_required:1}).authorized,false,"delivery requires proof when configured");
assert.ok(auth(driver,{...ownerAccess,accessKind:"owner",deliveryProofPresent:true},"confirm_delivery",{status:"InTransit",delivery_proof_required:1}).authorized,"delivery succeeds with proof and responsibility");
assert.equal(auth(executor,{...ownerAccess,accessKind:"owner",openCustodyCase:true},"confirm_arrival",{status:"Pending"}).authorized,false,"open custody blocks lifecycle execution");
assert.equal(auth(executor,{...ownerAccess,accessKind:"owner"},"confirm_arrival",{status:"Completed"}).authorized,false,"terminal mission cannot re-enter execution flow");
assert.equal(auth({role:"driver",tenantId:10,driverId:5},ownerAccess,"confirm_arrival").authorized,false,"missing identity binding is denied");

const prepared=buildSecuredActionPreparation({mission:{id:42,state_version:9,status:"Pending"},action:{code:"confirm_arrival",target:{kind:"mission_status",endpoint:"/api/missions/status"}},stateToken:"v:8"});
assert.equal(prepared.preconditions.ready,false,"stale token cannot prepare action");
assert.ok(prepared.preconditions.reasons.includes("stale_state_token"));

const sameOrigin=new Request("https://onmissionok.com/api/missions/42",{method:"PATCH",headers:{Cookie:"onmission_session=x",Origin:"https://onmissionok.com"}});
assert.equal(validateMutationRequest(sameOrigin,new URL(sameOrigin.url)),null,"same-origin cookie mutation is accepted");
const noOrigin=new Request("https://onmissionok.com/api/missions/42",{method:"PATCH",headers:{Cookie:"onmission_session=x"}});
assert.equal(validateMutationRequest(noOrigin,new URL(noOrigin.url)),"Same-origin authentication required","cookie mutation without explicit origin is denied");
const foreign=new Request("https://onmissionok.com/api/missions/42",{method:"PATCH",headers:{Cookie:"onmission_session=x",Origin:"https://evil.example"}});
assert.equal(validateMutationRequest(foreign,new URL(foreign.url)),"Cross-origin request rejected","foreign origin is denied");
const fetchCross=new Request("https://onmissionok.com/api/missions/42",{method:"POST",headers:{"Sec-Fetch-Site":"cross-site"}});
assert.equal(validateMutationRequest(fetchCross,new URL(fetchCross.url)),"Cross-site request rejected","cross-site fetch is denied");

console.log("10.30.27 authorization adversarial matrix: PASS");
