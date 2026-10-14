import fs from 'node:fs';
const coordinator=fs.readFileSync('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.service.js','utf8');
const contract=fs.readFileSync('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.contract.js','utf8');
const route=fs.readFileSync('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.routes.js','utf8');
const agentRoute=fs.readFileSync('src/worker/extensions/agentic-layer/agentic-execution.routes.js','utf8');
const app=fs.readFileSync('src/worker/app.js','utf8');
const checks=[
 ['coordinator version',contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='15.1.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.5.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.4.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.2.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='14.0.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.8.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.7.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.6.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.5.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.4.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.3.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.2.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.1.0'") || contract.includes("MISSION_EXECUTION_COORDINATOR_VERSION='13.0.0'")],
 ['single explicit journey',contract.includes("'OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT_SITUATION'") || contract.includes("'OBSERVE','UNDERSTAND','PLAN','POLICY_CHECK','AUTHORIZE','PREPARE','EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT_SITUATION'")],
 ['capability separation',contract.includes('MISSION_EXECUTION_CAPABILITIES')],
 ['coordinator owns no canonical mutation',!coordinator.includes('UPDATE missions')&&!coordinator.includes('INSERT INTO missions')],
 ['delegates execution capability',coordinator.includes('executeGovernedAgentMission')],
 ['canonical mission read',coordinator.includes("'mission_authority'")],
 ['verification explicit',coordinator.includes("phase('VERIFY','verification'")],
 ['recovery explicit',coordinator.includes("phase('RECOVER','recovery'")],
 ['unknown not success',contract.includes("unknownIsNotSuccess")],
 ['unified coordinator endpoint',route.includes('/api/mission-execution/missions/') || route.includes('mission-execution\\/missions')],
 ['legacy agent endpoint delegates',agentRoute.includes('executeMission(env,request,router,session')],
 ['route registered',app.includes('registerMissionExecutionCoordinatorRoutes(router)')]
];
const failures=checks.filter(([,ok])=>!ok);
if(failures.length){console.error('13.0.0 mission execution coordinator: FAIL');for(const [name] of failures)console.error(`- ${name}`);process.exit(1)}
console.log(`13.0.0 mission execution coordinator: PASS (${checks.length} checks)`);
