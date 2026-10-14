import assert from "node:assert/strict";
import {ACTION_REGISTRY} from "../../src/worker/application/actions/action-registry.js";
import {ACTION_SERVICE_MAP,resolveActionTarget} from "../../src/worker/application/actions/action-service-map.js";
import {buildSecuredActionPreparation} from "../../src/worker/extensions/action-execution/secured-action-execution.contract.js";

const context={missionId:242,role:"admin",networkInvitationId:91,forYouRequestId:92,openExceptionId:93,requirementId:94};
const codes=Object.keys(ACTION_REGISTRY);
assert.ok(codes.length>=40,`expected complete action registry, got ${codes.length}`);
for(const code of codes){
  assert.ok(ACTION_SERVICE_MAP[code],`${code} must have an Action Service Map definition`);
  const target=resolveActionTarget(code,context);
  assert.ok(target,`${code} must resolve to a target with canonical context`);
  assert.ok(["api","ui","mission_status","navigate"].includes(String(target.kind)),`${code} has invalid target kind`);
  if(target.kind==="api"||target.kind==="mission_status") assert.ok(target.endpoint,`${code} executable target must have endpoint`);
}

// Context-bearing actions must retain their canonical resource identifiers when prepared.
for(const [code,key] of [["accept_network","networkInvitationId"],["reject_network","networkInvitationId"],["approve_foryou_request","forYouRequestId"],["decline_foryou_request","forYouRequestId"],["approve_foryou_request","forYouRequestId"],["decline_foryou_request","forYouRequestId"],["resolve_exception","openExceptionId"]]){
  const target=resolveActionTarget(code,context);
  assert.ok(target?.endpoint,`${code} endpoint must resolve from context`);
  assert.ok(target.endpoint.includes(String(context[key])),`${code} must bind ${key} into endpoint`);
}

const mission={id:242,status:"Pending",state_version:12};
for(const code of ["confirm_arrival","confirm_pickup","start_transit","confirm_delivery","complete_mission","edit_mission","edit_mission_data","delete_mission","cancel_mission","assign_driver","change_driver","reclaim_execution","start_custody_resolution","confirm_custody_release","finalize_custody_transfer","accept_custody","reactivate_mission"]){
  const action={code,target:resolveActionTarget(code,context)};
  const prep=buildSecuredActionPreparation({mission,action,stateToken:"v:12"});
  assert.ok(prep.target,`${code} must have a prepared target`);
  assert.equal(prep.preconditions.reasons.includes("service_target_missing"),false,`${code} must not lose its target during preparation`);
}

console.log("10.30.17 Universal Action Execution Completeness: PASS");

const clientApi = await import("../../public/assets/js/core/api.js");
assert.ok(clientApi.jsonOptions,"client API contract must remain available");
const apiSource = await (await import("node:fs/promises")).readFile("public/assets/js/core/api.js","utf8");
assert.ok(apiSource.includes("TRANSITION_OUTCOME_UNCERTAIN"),"uncertain transition must have a user-safe recovery message");
const securedSource = await (await import("node:fs/promises")).readFile("public/assets/js/extensions/secured-action-execution-103017.js","utf8");
assert.ok(securedSource.includes("MISSION_CHANGED") && securedSource.includes("freshToken"),"preparation must recover one stale-read race without replaying a mutation");
console.log("10.30.17 stale/uncertainty UX guard: PASS");
