import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const gateway=read('src/worker/security/capability-resource-contract.service.js');
const coordinator=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.service.js');
const coordContract=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.contract.js');
const governed=read('src/worker/extensions/agentic-layer/agent-governed-execution.service.js');
const migration=read('database/migrations/0140_capability_resource_contract_operationalization.sql');
const checks=[
 ['13.2 gateway version',gateway.includes("CAPABILITY_RESOURCE_CONTRACT_VERSION='13.2.0'")],
 ['capability command gate',gateway.includes('requireCapabilityContract(env,capabilityCode,{riskClass,requiredCommand:command})')],
 ['resource contract authority read',gateway.includes('resource_contract_authority')],
 ['resource consumer enforcement',gateway.includes('RESOURCE_CONSUMER_NOT_CONTRACTED')],
 ['owner remains canonical',gateway.includes('ownerCapabilityRemainsCanonical:true')],
 ['coordinator uses gateway',coordinator.includes('requireCapabilityOperation')],
 ['coordinator records contract envelope',coordinator.includes('contractEnvelope')],
 ['governed execution uses resource-aware gateway',governed.includes('requireCapabilityOperation')],
 ['provider resource contract enforced',governed.includes("resourceType:'provider'")],
 ['contract gateway invariant validated',coordContract.includes('capabilityResourceContracted')],
 ['fresh authorization for retry',migration.includes('fresh_authorization_required_for_retry')],
 ['provider consumer scope',migration.includes('resource_type=\'provider\'')&&migration.includes('provider_integration')],
 ['no new domain authority',migration.includes('Contract metadata')]
];
const failures=checks.filter(([,ok])=>!ok);
if(failures.length){console.error('13.2.0 capability + resource contract operationalization: FAIL');for(const [name] of failures)console.error(`- ${name}`);process.exit(1)}
console.log(`13.2.0 capability + resource contract operationalization: PASS (${checks.length} checks)`);
