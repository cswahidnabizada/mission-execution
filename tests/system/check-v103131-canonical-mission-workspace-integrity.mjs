import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), fail=[];
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ui=read('public/assets/ui/canonical-mission-workspace.js');
const map=read('src/worker/application/actions/action-service-map.js');
const auth=read('src/worker/extensions/action-execution/secured-action-authorization.contract.js');
const access=read('src/worker/security/mission-access.js');
const ai=read('src/worker/extensions/actions-intelligence/actions-intelligence.routes.js');
const admin=read('public/admin.html');
const driver=read('public/driver/dashboard.html');
const secured=read('public/assets/js/extensions/secured-action-execution.js');
for(const f of ['renderSituation','renderExecution','renderEvidence','renderHistory','renderActions','renderMissionTv']){
  if((ui.match(new RegExp(`function ${f}\\(`,'g'))||[]).length!==1)fail.push(`canonical renderer ${f} must exist exactly once`);
}
for(const code of ['edit_mission','edit_mission_data','assign_driver','share_foryou','share_network','cancel_mission','delete_mission','reactivate_mission','message','report_exception','start_custody_resolution','start_custody_recovery','confirm_custody_release','finalize_custody_transfer','accept_custody','reassign_custody_receiver','abort_custody_transfer']){
  if(!map.includes(`${code}:`))fail.push(`missing executable service-map entry: ${code}`);
}
if(!ui.includes('executeAction'))fail.push('workspace must execute through secured canonical action runtime');
if(ui.includes('api(`/api/missions/${id}/driver-assignment`')||ui.includes('api(`/api/mission-management/missions/${id}/intents/'))fail.push('workspace still contains direct mission mutation execution');
if(!ui.includes('runSecured(actionByCode("edit_mission"'))fail.push('edit must execute through canonical action');
if(!ui.includes('runSecured(actionByCode("delete_mission"'))fail.push('delete must execute through canonical action');
if(!ui.includes('runSecured(actionByCode("cancel_mission"'))fail.push('cancel must execute through canonical action');
if(!ui.includes('runSecured(actionByCode("message"'))fail.push('message must execute through canonical action');
if(!ui.includes('runSecured(actionByCode("capture_delivery_proof"'))fail.push('delivery proof must enter secured action runtime');
if(!secured.includes('actionPayload'))fail.push('secured action runtime must carry contextual action payload');
if(!ai.includes('const flowResult=await orchestrateMissionFlow'))fail.push('Actions Intelligence must use one orchestration pass');
if(!ai.includes('management,flow:flowResult.contract'))fail.push('unified action response must expose management and flow');
if(!ai.includes('const truthResult=await coordinateMissionEngines'))fail.push('unified action response must expose canonical truth');
if(!ai.includes('networkInvitation,forYouRequest'))fail.push('request/invitation identifiers must be bound into canonical actions');
if(!access.includes('accessKind:"pending-network"'))fail.push('pending Network mission access missing');
if(!access.includes('accessKind:"pending-foryou"'))fail.push('pending ForYou mission access missing');
if(!auth.includes('kind==="pending-network"')||!auth.includes('kind==="pending-foryou"'))fail.push('pending request tenant boundary missing');
if(!auth.includes('code,"accept_network","reject_network"') && !auth.includes('["accept_network","reject_network"]'))fail.push('Network response authorization missing');
if(admin.includes('canonical-dashboard-runtime.js?v=10.31.28')||driver.includes('canonical-role-workspace.js?v=10.31.28'))fail.push('stale 10.31.28 runtime cache reference remains');
for(const old of ['secured-action-execution-101938.js','secured-action-execution-101939.js','secured-action-execution-102940.js','secured-action-execution-103017.js','secured-action-execution-103030.js']) if(fs.existsSync(path.join(root,'public/assets/js/extensions',old)))fail.push(`obsolete secured runtime remains: ${old}`);
for(const f of ['public/assets/ui/canonical-mission-workspace.js','src/worker/security/mission-access.js','src/worker/extensions/actions-intelligence/actions-intelligence.routes.js','src/worker/extensions/action-execution/secured-action-authorization.contract.js','src/worker/application/actions/action-service-map.js','src/worker/modules/assignments/assignment.engine.js','src/worker/extensions/mission-flow/mission-flow.orchestrator.js']){
  const cp=await import('node:child_process').then(({spawnSync})=>spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'}));
  if(cp.status!==0)fail.push(`${f} syntax error: ${cp.stderr}`);
}
if(fail.length){console.error('FAIL 10.31.31 Canonical Mission Workspace Integrity');for(const x of fail)console.error(' - '+x);process.exit(1)}
console.log('PASS 10.31.31 Canonical Mission Workspace Integrity');
