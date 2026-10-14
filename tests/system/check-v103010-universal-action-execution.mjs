import assert from "node:assert/strict";
import {evaluateSecuredActionAuthorization} from "../../src/worker/extensions/action-execution/secured-action-authorization.contract.js";
import {serviceDefinition} from "../../src/worker/application/actions/action-service-map.js";

const session={role:"admin",tenantId:7,identityId:99};
const baseMission={id:242,company_id:7,status:"Pending",state_version:12};
const access={tenantId:7,accessKind:"owner",mission:baseMission,openCustodyCase:true,deliveryProofPresent:true};

for(const code of ["edit_mission_data","cancel_mission","delete_mission","assign_driver","change_driver"]){
  const a=evaluateSecuredActionAuthorization({session,access,actionCode:code,mission:baseMission});
  assert.equal(a.authorized,true,`${code} must not be blanket-blocked by unrelated open custody`);
  assert.ok(serviceDefinition(code),`${code} must have a service-map route`);
}

for(const code of ["confirm_arrival","confirm_pickup","start_transit","confirm_delivery","complete_mission"]){
  const a=evaluateSecuredActionAuthorization({session,access,actionCode:code,mission:baseMission});
  assert.equal(a.checks.custody,false,`${code} must pause while custody is unresolved`);
}

assert.ok(serviceDefinition("reclaim_execution"),"Take Back must have an authoritative route");
assert.ok(serviceDefinition("start_custody_resolution"),"Transfer Custody must have an authoritative route");

console.log("10.30.10 Universal Action Execution: PASS");
