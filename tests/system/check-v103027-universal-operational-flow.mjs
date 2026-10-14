import assert from "node:assert/strict";
import {ACTION_REGISTRY} from "../../src/worker/application/actions/action-registry.js";
import {ACTION_SERVICE_MAP,resolveActionTarget} from "../../src/worker/application/actions/action-service-map.js";
import {buildCanonicalOperationalFlow,validateCanonicalOperationalFlow} from "../../src/worker/extensions/operations-context/canonical-operational-flow.contract.js";

const context={missionId:242,role:"admin",networkInvitationId:91,forYouRequestId:92,openExceptionId:93,requirementId:94};
const mission={id:242,status:"Pending",state_version:12};
const truth={lifecycle:{status:"Pending"},invariant:{tenant:true,lifecycle:true,authorization:true}};
const liveness={state:"ACTIONABLE",reason:"A valid next step is available."};
const readiness={readiness:{state:"READY"},execution:{state:"EXECUTABLE"},next:{code:"confirm_arrival",label:"Confirm Arrival"}};
const responsibility={responsible:{established:true,type:"executor",id:7,name:"Executor 7"}};

assert.ok(Object.keys(ACTION_REGISTRY).length>=40,"expected complete action registry");
for(const code of Object.keys(ACTION_REGISTRY)){
  assert.ok(ACTION_SERVICE_MAP[code],`${code} must remain mapped`);
  const target=resolveActionTarget(code,context);
  assert.ok(target,`${code} must resolve with canonical context`);
  const flow=buildCanonicalOperationalFlow({mission,context,truth,liveness,readiness,action:{code,target,...context},responsibility});
  const problems=validateCanonicalOperationalFlow(flow);
  assert.deepEqual(problems,[],`${code} flow contract invalid: ${problems.join(",")}`);
  assert.equal(flow.missionId,242);
  assert.equal(flow.context.stateToken,"v:12");
  assert.equal(flow.action.code,code);
  assert.equal(flow.action.registered,true);
  assert.equal(flow.action.target?.kind,target.kind);
  assert.equal(flow.safety.executesAction,false);
}

const contextual=[
  ["accept_network","networkInvitationId"],["reject_network","networkInvitationId"],
  ["approve_foryou_request","forYouRequestId"],["decline_foryou_request","forYouRequestId"],
  ["approve_foryou_request","forYouRequestId"],["decline_foryou_request","forYouRequestId"],
  ["resolve_exception","openExceptionId"]
];
for(const [code,key] of contextual){
  const target=resolveActionTarget(code,context);
  assert.ok(target?.endpoint,`${code} must resolve an endpoint`);
  assert.ok(target.endpoint.includes(String(context[key])),`${code} must retain ${key}`);
}

const terminal=buildCanonicalOperationalFlow({mission:{...mission,status:"Completed"},context,truth:{lifecycle:{status:"Completed"}},liveness:{state:"TERMINAL"},readiness,action:{code:"complete_mission"},responsibility});
assert.equal(terminal.state,"TERMINAL");
assert.equal(terminal.action.registered,true);

const waiting=buildCanonicalOperationalFlow({mission,context,truth,liveness:{state:"WAITING",reason:"Waiting for executor"},readiness:{readiness:{state:"WAITING"},execution:{state:"BLOCKED"}},action:null,responsibility});
assert.equal(waiting.state,"WAITING");
assert.equal(waiting.action.code,null);
assert.deepEqual(validateCanonicalOperationalFlow(waiting),[]);

console.log("10.30.27 Universal Operational Flow & Context Integrity: PASS");
