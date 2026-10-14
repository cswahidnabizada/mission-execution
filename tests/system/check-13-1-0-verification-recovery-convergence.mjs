import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const service=read('src/worker/extensions/mission-execution-coordinator/mission-execution-recovery-coordinator.service.js');
const contract=read('src/worker/extensions/mission-execution-coordinator/mission-execution-recovery-coordinator.contract.js');
const recovery=read('src/worker/extensions/agentic-layer/agent-execution-recovery.service.js');
const governed=read('src/worker/extensions/agentic-layer/agent-governed-execution.service.js');
const coordinator=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.service.js');
const routes=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.routes.js');
const checks=[
 ['13.1 recovery coordinator version',service.includes("MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION='13.1.0'") || service.includes("MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION='13.2.0','13.3.0','13.4.0'") || service.includes("MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION='13.6.0'")],
 ['verification contract version',contract.includes("MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION='13.1.0'") || contract.includes("MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION='13.2.0','13.3.0','13.4.0'") || contract.includes("MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION='13.6.0'")],
 ['external verification required',service.includes('externalRequiresProviderVerification')||service.includes('EXTERNAL_EFFECT_VERIFICATION_REQUIRED')],
 ['canonical evidence required',service.includes('canonicalVerified')],
 ['unknown never success',contract.includes('unknownIsNotSuccess:true')],
 ['no automatic retry',contract.includes('recoveryDoesNotAutoRetryUnknown:true')],
 ['recovery does not own truth',contract.includes('recoveryDoesNotOwnMissionTruth:true')],
 ['canonical recovery uses existing authority',service.includes('reconcileAgentExecutionAttempt')],
 ['intent convergence',service.includes('transitionExecutionIntent')],
 ['coordinator invokes recovery convergence',coordinator.includes('convergeMissionExecutionRecovery')],
 ['canonical recovery endpoint',routes.includes('mission-execution\\/attempts\\/') && routes.includes('\\/reconcile')],
 ['recovery authority protects external effects',recovery.includes('Provider verification evidence is not confirmed.')],
 ['13.0 error-path TDZ fixed',!governed.includes('intentRecoveryWrite:intentRecoveryWrite||null')]
];
const failures=checks.filter(([,ok])=>!ok);
if(failures.length){console.error('13.1.0 verification + recovery convergence: FAIL');for(const [name] of failures)console.error(`- ${name}`);process.exit(1)}
console.log(`13.1.0 verification + recovery convergence: PASS (${checks.length} checks)`);
