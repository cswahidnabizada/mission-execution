import assert from 'node:assert/strict';
import {buildCanonicalCapabilityExposure,validateCanonicalCapabilityExposure} from '../../src/worker/extensions/operations-context/canonical-capability-exposure.contract.js';

const mission={id:100068,status:'Pending',state_version:2};
const baseFlow={missionId:100068,status:'Pending',terminal:false,next:{action:{code:'confirm_arrival',label:'Confirm Arrival',actor:{type:'executor',id:51,name:'wahidkhan'}},actor:{type:'executor',id:51,name:'wahidkhan'},waitingFor:'wahidkhan',reasonCode:'execution_actor_progress'}};
const admin=buildCanonicalCapabilityExposure({mission,flow:{...baseFlow,next:{...baseFlow.next,viewerCanExecute:false}},session:{role:'admin'},availableActions:[]});
assert.equal(admin.code,'confirm_arrival');
assert.equal(admin.exposureState,'NOT_EXPOSED');
assert.equal(admin.executable,false);
assert.equal(admin.registered,true);
assert.equal(admin.routed,true);
assert.match(admin.reason,/not currently exposed/);
assert.deepEqual(validateCanonicalCapabilityExposure(admin),[]);

const executorAction={code:'confirm_arrival',label:'Confirm Arrival',executable:true,executionReady:true};
const executor=buildCanonicalCapabilityExposure({mission,flow:{...baseFlow,next:{...baseFlow.next,viewerCanExecute:true}},session:{role:'executor',executorId:51},availableActions:[executorAction]});
assert.equal(executor.exposureState,'EXECUTABLE');
assert.equal(executor.executable,true);
assert.equal(executor.action.target.kind,'mission_status');
assert.equal(executor.action.target.body.status,'Arrived');
assert.deepEqual(validateCanonicalCapabilityExposure(executor),[]);

const missing=buildCanonicalCapabilityExposure({mission,flow:{...baseFlow,next:{...baseFlow.next,viewerCanExecute:true,action:{code:'missing_action',label:'Missing Action'}}},session:{role:'executor'},availableActions:[]});
assert.equal(missing.exposureState,'REQUIRES_VALIDATION');
assert.equal(missing.executable,false);
assert.match(missing.reason,/route is incomplete/);
assert.deepEqual(validateCanonicalCapabilityExposure(missing),[]);

console.log('10.29.49 canonical capability exposure gate: PASS');
