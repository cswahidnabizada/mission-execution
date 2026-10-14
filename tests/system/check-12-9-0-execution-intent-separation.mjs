import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const migration=fs.readFileSync(path.join(root,'database/migrations/0139_execution_intent_separation.sql'),'utf8');
const exec=fs.readFileSync(path.join(root,'src/worker/extensions/agentic-layer/agent-governed-execution.service.js'),'utf8');
const intent=fs.readFileSync(path.join(root,'src/worker/extensions/execution-engine/execution-intent.service.js'),'utf8');
const provider=fs.readFileSync(path.join(root,'src/worker/security/external-provider-integration.service.js'),'utf8');
const checks=[
 ['execution intent table',migration.includes('CREATE TABLE IF NOT EXISTS mission_execution_intents')],
 ['attempt links intent',migration.includes('ALTER TABLE agent_execution_attempts ADD COLUMN execution_intent_id TEXT')],
 ['intent service exists',intent.includes("EXECUTION_INTENT_VERSION='12.9.0'")],
 ['intent is idempotent',intent.includes("WHERE idempotency_key=? LIMIT 1")],
 ['provider verification before canonical effect',exec.includes("transitionExecutionIntent(env,executionIntentId,{status:'PROVIDER_VERIFIED'")],
 ['provider verification is mandatory',exec.includes("Number(providerCapability.verification_required)!==1")],
 ['canonical commit follows provider verification',exec.indexOf("status:'PROVIDER_VERIFIED'")<exec.indexOf('result=await executeCanonicalAction')],
 ['external unknown remains unresolved',exec.includes("status:providerExecution?.verified?'RECOVERY_REQUIRED':'EXTERNAL_UNKNOWN'")],
 ['execution contract upgraded',migration.includes('commit_verified_effect')],
 ['provider contract records operation',migration.includes('record_provider_operation')],
 ['verification requires intent',migration.includes('"intent_exists"')]
];
const failures=checks.filter(([,ok])=>!ok);
if(failures.length){console.error('12.9.0 execution intent separation: FAIL');for(const [name] of failures)console.error(`- ${name}`);process.exit(1)}
console.log(`12.9.0 execution intent separation: PASS (${checks.length} checks)`);
