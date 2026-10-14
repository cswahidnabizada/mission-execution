import fs from 'node:fs';
import { buildMultiMissionCoordination, validateMultiMissionCoordination } from '../../src/worker/extensions/adaptive-orchestration/multi-mission-coordination.contract.js';
const route=fs.readFileSync('src/worker/extensions/adaptive-orchestration/adaptive-orchestration.routes.js','utf8');
const ui=fs.readFileSync('public/assets/js/extensions/dashboard-work-surface-101920.js','utf8');
const html=fs.readFileSync('public/admin.html','utf8');
const now=Date.now();
const model=buildMultiMissionCoordination({
 missions:[
  {id:1,reference:'M-1',status:'Pending',state_version:3,driver_id:0},
  {id:2,reference:'M-2',status:'InTransit',state_version:4,driver_id:9},
  {id:3,reference:'M-3',status:'Delivered',state_version:5,driver_id:9}
 ],
 predictions:[{missionId:1,predictionType:'RESPONSIBILITY_RISK',riskLevel:'HIGH',reason:'No owner',recommendedAction:'assign_driver'}],
 workloadPressure:[{ownerType:'driver',ownerId:9,ownerName:'Driver 9',activeMissions:2,pressureLevel:'MEDIUM'}],
 networkNeed:[{missionId:1,reference:'M-1',need:'execution_capacity',candidateCount:2,recommendation:'Review trusted network capacity',reason:'No owner',confidence:'MEDIUM'}],now
});
const problems=validateMultiMissionCoordination(model);
if(problems.length) throw new Error(`contract invalid: ${problems.join(',')}`);
if(model.readOnly!==true||model.authoritative!==false||model.safety.executesAction!==false) throw new Error('safety boundary failed');
if(model.missionCount!==2||model.resourcePressure.length!==2) throw new Error('active/resource aggregation failed');
if(!route.includes('/api/operations/multi-mission')||!route.includes('buildMultiMissionCoordination')||!route.includes('requireAdmin')) throw new Error('route missing');
if(!ui.includes('/api/operations/multi-mission?limit=100')||!ui.includes('Adaptive Multi-Mission Coordination')) throw new Error('Workbench surface missing');
if(!html.includes('dashboard-work-surface-101920.js?v=10.19.26&build=10.19.26')) throw new Error('asset pin missing');
if(/INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM/i.test(fs.readFileSync('src/worker/extensions/adaptive-orchestration/multi-mission-coordination.contract.js','utf8'))) throw new Error('coordination contract contains mutation SQL');
console.log('10.19.26 adaptive multi-mission coordination: PASS');
