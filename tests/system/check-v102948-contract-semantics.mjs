import assert from 'node:assert/strict';
import {buildOperationalReadinessContract,validateOperationalReadinessContract} from '../../src/worker/extensions/operations-context/operational-readiness.contract.js';

const base={id:100068,status:'Pending',deadline_at:new Date(Date.now()-3600000).toISOString()};
const flow={missionId:100068,status:'Pending',terminal:false,next:{action:{code:'confirm_arrival',label:'Confirm Arrival',actor:{type:'executor',id:51,name:'wahidkhan'}},actor:{type:'executor',id:51,name:'wahidkhan'},viewerCanExecute:false,waitingFor:'wahidkhan',reasonCode:'execution_actor_progress'},readiness:{state:'READY',summary:'Canonical readiness is current.',blockers:[],warnings:[]}};
const liveness={state:'AT_RISK',reason:'Mission deadline is overdue.',reasonCode:'execution_actor_progress',responsibleActor:{type:'executor',id:51,name:'wahidkhan'}};
const c=buildOperationalReadinessContract({mission:base,flow,liveness,primaryAction:null,capabilityAudit:{complete:true}});
assert.equal(c.next.code,'confirm_arrival');
assert.equal(c.next.label,'Confirm Arrival');
assert.equal(c.readiness.state,'READY');
assert.equal(c.execution.state,'NOT_EXPOSED');
assert.match(c.execution.reason,/not currently exposed/);
assert.equal(c.waitingFor,'wahidkhan');
assert.equal(c.condition,'execution_actor_progress');
assert.equal(c.risk.code,'deadline_overdue');
assert.notEqual(c.condition,c.risk.code);
assert.equal(c.liveness.state,'AT_RISK');
assert.deepEqual(validateOperationalReadinessContract(c),[]);

const executable=buildOperationalReadinessContract({mission:base,flow:{...flow,next:{...flow.next,viewerCanExecute:true}},liveness:{...liveness,state:'WAITING'},primaryAction:{code:'confirm_arrival',label:'Confirm Arrival'},capabilityAudit:{complete:true}});
assert.equal(executable.readiness.state,'READY');
assert.equal(executable.execution.state,'EXECUTABLE');
assert.equal(executable.execution.capability,'confirm_arrival');
assert.deepEqual(validateOperationalReadinessContract(executable),[]);

console.log('10.29.48 contract semantics gate: PASS');
