import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const migration=fs.readFileSync(path.join(root,'database/migrations/0138_execution_capability_contracts.sql'),'utf8');
const exec=fs.readFileSync(path.join(root,'src/worker/extensions/agentic-layer/agent-governed-execution.service.js'),'utf8');
const recovery=fs.readFileSync(path.join(root,'src/worker/security/platform-data-entry.service.js'),'utf8');
const graph=fs.readFileSync(path.join(root,'src/worker/security/platform-resource-explorer.service.js'),'utf8');
const checks=[
 ['capability contract registry',migration.includes('CREATE TABLE IF NOT EXISTS canonical_capability_contracts')],
 ['resource contract enrichment',migration.includes('ALTER TABLE platform_control_plane_resource_contracts ADD COLUMN owner_capability')],
 ['execution capability gate',exec.includes("requireCapabilityContract(env,'execution',{riskClass:'critical',requiredCommand:'execute_action'})")],
 ['provider capability gate',exec.includes("requireCapabilityContract(env,'provider_integration',{riskClass:'critical',requiredCommand:'dispatch_provider'})")],
 ['data-entry ambiguity reads all candidates',recovery.includes('LIMIT 2`).bind(key).all()')],
 ['resource graph exposes authority failures',graph.includes("unavailableAuthorities.push")&&graph.includes("completeness:unavailableAuthorities.length?'DEGRADED':'COMPLETE'")],
 ['unknown is unresolved',migration.includes("unknown\":\"UNRESOLVED")],
 ['recovery contract forbids blind unknown retry',migration.includes('never_auto_retry_unknown_without_verification')]
];
const failures=checks.filter(([,ok])=>!ok);
if(failures.length){console.error('12.8.0 execution integrity contract: FAIL');for(const [name] of failures)console.error(`- ${name}`);process.exit(1)}
console.log(`12.8.0 execution integrity contract: PASS (${checks.length} checks)`);
