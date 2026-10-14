/* ON Mission Recovery Certification Harness — deterministic safety simulation.
 * This is evidence preparation, not a claim of production recovery certification.
 * Production certification still requires a controlled deployed recovery exercise.
 */
import assert from 'node:assert/strict';
const staleTransitionSeconds=120;
const states={processing:'processing',recoveryRequired:'recovery_required',completed:'completed'};
const now=Date.now();
const intent={mutation_phase:states.processing,updated_at:new Date(now-(staleTransitionSeconds+1)*1000).toISOString()};
function reconcileRecovery(i){
  const stale=Date.now()-Date.parse(i.updated_at)>staleTransitionSeconds*1000;
  if(i.mutation_phase===states.processing&&stale)return states.recoveryRequired;
  return i.mutation_phase;
}
const recovered=reconcileRecovery(intent);
assert.equal(recovered,states.recoveryRequired,'worker interruption must surface recovery_required');
assert.notEqual(recovered,states.completed,'interrupted mutation must never be reported as completed');
const evidence={type:'recovery',status:'passed',simulation:'stale transition after worker interruption',result:recovered};
console.log(`Recovery evidence simulation: PASS (${JSON.stringify(evidence)})`);
console.log('Production recovery certification remains pending until controlled deployed recovery exercise.');
