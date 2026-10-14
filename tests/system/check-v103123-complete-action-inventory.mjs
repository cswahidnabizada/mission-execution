import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=process.cwd();const read=f=>fs.readFileSync(path.join(root,f),'utf8');const fail=[];
const ui=read('public/assets/ui/mission.js');
const serverCapability=read('src/worker/extensions/actions-intelligence/action-capability.engine.js');
const actionContract=read('src/worker/extensions/actions-intelligence/action-contract.engine.js');
const unified=read('src/worker/extensions/unified-action/unified-action.contract.js');
const registry=read('src/worker/application/actions/action-registry.js');
const html=read('public/admin.html');
for(const x of ['EXECUTION','ASSIGNMENT','SHARING','COMMUNICATION','EVIDENCE','ATTENTION','NAVIGATION','MANAGEMENT'])if(!ui.includes(`"${x}"`))fail.push(`missing Actions group:${x}`);
for(const x of ['share_foryou','share_network','message','assign_driver','edit_mission','cancel_mission','delete_mission'])if(!ui.includes(x))fail.push(`missing action capability wiring:${x}`);
if(!serverCapability.includes('A.SHARE_FORYOU')||!serverCapability.includes('A.SHARE_NETWORK'))fail.push('server sharing capabilities are not exposed');
if(!actionContract.includes('const allCapabilities='))fail.push('Action Contract does not expose the complete available capability inventory');
if(!actionContract.includes('all:Object.freeze(all)'))fail.push('Action Contract all inventory is not canonical');
if(!unified.includes('actions?.all||actions?.utilities'))fail.push('Unified Action surface does not consume the complete action inventory');
if(!registry.includes('[A.ASSIGN_DRIVER]:def("Assign Executor"'))fail.push('executor vocabulary not applied');
if(!html.includes('canonical-mission-workspace-103123.css?v=10.31.23&build=10.31.23'))fail.push('10.31.23 canonical workspace CSS is not active');
if(!html.includes('canonical-dashboard-runtime.js?v=10.31.23&build=10.31.23'))fail.push('10.31.23 dashboard runtime cache version is not active');
if(!ui.includes('const actions=()=>'))fail.push('canonical Action inventory resolver is missing');
if(!ui.includes('One mission, one workspace'))fail.push('Actions does not document same-workspace execution');
for(const f of ['public/assets/ui/mission.js','src/worker/extensions/actions-intelligence/action-capability.engine.js','src/worker/extensions/actions-intelligence/action-contract.engine.js','src/worker/extensions/unified-action/unified-action.contract.js']){const cp=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});if(cp.status!==0)fail.push(`syntax:${f}\n${cp.stderr}`)}
if(fail.length){console.error('FAIL 10.31.23 Complete Action Inventory');for(const x of fail)console.error(' - '+x);process.exit(1)}
console.log('PASS 10.31.23 Complete Action Inventory: canonical Actions surface, grouped capabilities, sharing, communication, assignment and management inventory');
