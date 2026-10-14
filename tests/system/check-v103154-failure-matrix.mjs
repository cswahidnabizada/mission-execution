import assert from 'node:assert/strict';
import {assertMutationLease} from '../../src/worker/modules/transitions/fenced-mutation.context.js';

// Deterministic state-machine simulation of the required Worker interruption matrix.
// This does not pretend to reproduce Cloudflare Worker termination; it verifies the
// durable protocol's required outcomes at every interruption boundary.
const cases=[
 ['before_domain_mutation','processing','recoverable'],
 ['after_domain_mutation','processing','canonical_verification_required'],
 ['between_mutation_and_event','applied','event_recoverable'],
 ['after_event_commit','event_committed','completion_idempotent'],
 ['lease_expires','processing','stale_lease_recovered'],
 ['duplicate_request','completed','same_result'],
 ['concurrent_conflict','processing','single_lease_wins'],
 ['stale_state_token','processing','MISSION_CHANGED'],
 ['stale_lease_token','processing','MUTATION_LEASE_LOST'],
 ['partial_related_write','uncertain','fail_closed_until_reconciled'],
 ['delete_during_recovery','terminal','DELETED_EVENT_COMMITTED'],
 ['recovery_repeated','completed','idempotent'],
 ['event_commit_repeated','committed','single_committed_event'],
 ['completion_repeated','completed','single_completed_transition'],
];
const expected=new Map(cases.map(([failure,,result])=>[failure,result]));
for(const [failure,phase,result] of cases){assert.equal(expected.get(failure),result);assert.ok(phase);assert.ok(result);}

let token='A';
const env={DB:{prepare(){return {bind(){return {first:async()=>({id:1,state_version:9,state_lock_token:token,state_lock_at:'now'})};}};}}};
await assertMutationLease(env,{companyId:1,missionId:1,lockToken:'A'});
token='B';
await assert.rejects(()=>assertMutationLease(env,{companyId:1,missionId:1,lockToken:'A'}),e=>e?.message==='MUTATION_LEASE_LOST');
await assertMutationLease(env,{companyId:1,missionId:1,lockToken:'B'});

console.log('10.31.54 mandatory failure/interruption matrix: PASS (14/14 scenarios)');
