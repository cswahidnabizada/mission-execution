import assert from "node:assert/strict";
import {resolveActionTarget,serviceDefinition} from "../../src/worker/application/actions/action-service-map.js";
import {buildSecuredActionPreparation} from "../../src/worker/extensions/action-execution/secured-action-execution.contract.js";

const mission={id:242,status:"Pending",state_version:12};
const token="v:12";
const codes=[
  "edit_mission","edit_mission_data","delete_mission","cancel_mission","reclaim_execution",
  "assign_driver","change_driver","start_custody_resolution","start_custody_recovery",
  "confirm_arrival","confirm_pickup","start_transit","confirm_delivery","complete_mission",
  "finalize_custody_transfer","reassign_custody_receiver","abort_custody_transfer","reactivate_mission"
];

for(const code of codes){
  assert.ok(serviceDefinition(code),`${code} must be present in the service map`);
  const target=resolveActionTarget(code,{missionId:mission.id,role:"admin"});
  assert.ok(target,`${code} must resolve to a canonical service target`);
  const preparation=buildSecuredActionPreparation({mission,action:{code,target},stateToken:token});
  assert.ok(!preparation.preconditions.reasons.includes("service_target_missing"),`${code} must not produce service_target_missing`);
  assert.ok(preparation.target,`${code} preparation must contain a target`);
}

console.log("10.30.11 Universal Action Target Convergence: PASS");
