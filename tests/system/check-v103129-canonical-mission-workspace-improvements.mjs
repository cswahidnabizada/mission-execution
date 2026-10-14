import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),fail=[];const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ui=read('public/assets/ui/canonical-mission-workspace.js');
const cap=read('src/worker/extensions/actions-intelligence/action-capability.engine.js');
const mm=read('src/worker/extensions/mission-management/mission-management.service.js');
const ms=read('src/worker/modules/missions/missions.service.js');
const css=read('public/assets/css/extensions/canonical-mission-workspace.css');
const html=read('public/admin.html');
for(const v of ['situation','execution','evidence','history','actions','mission-tv'])if(!ui.includes(`data-cmw-pane="${v}"`))fail.push(`missing pane ${v}`);
if((ui.match(/function renderExecution\(/g)||[]).length!==1)fail.push('duplicate renderExecution function');
if((ui.match(/function renderEvidence\(/g)||[]).length!==1)fail.push('duplicate renderEvidence function');
if((ui.match(/function renderHistory\(/g)||[]).length!==1)fail.push('duplicate renderHistory function');
if(ui.includes('fetchMissionManagement'))fail.push('legacy mission action inventory fetch remains');
if(!cap.includes('One adaptive assignment capability owns both states'))fail.push('adaptive assignment convergence missing');
if(!cap.includes('ctx.responsibility?.canReassign'))fail.push('existing reassignment intelligence not reused');
if(!cap.includes('const canStartDistribution=Boolean(')||!cap.includes('!ctx.responsibility?.acquisitionWaiting'))fail.push('sharing availability logic missing');
if(!mm.includes('confirm_custody_release')||!mm.includes('accept_custody'))fail.push('custody recipient/holder actions missing');
if(ms.includes('DELETE FROM mission_transition_requests WHERE company_id=? AND mission_id=?`'))fail.push('delete path still removes active transition intent');
if(!ui.includes('start_custody_resolution')||!ui.includes('reclaim_execution'))fail.push('canonical custody/reclaim context missing');
if(!css.includes('.cmw-root .cui-lifecycle-track'))fail.push('lifecycle cockpit CSS missing');
if(!ui.includes('Share Mission'))fail.push('single sharing chooser missing');
if(!html.includes('canonical-mission-workspace.css?v=10.31.29&build=10.31.29'))fail.push('workspace CSS cache version stale');
for(const f of ['public/assets/ui/canonical-mission-workspace.js','src/worker/extensions/actions-intelligence/action-capability.engine.js','src/worker/extensions/mission-management/mission-management.service.js','src/worker/modules/missions/missions.service.js']){const cp=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});if(cp.status!==0)fail.push(`${f} syntax\n${cp.stderr}`)}
if(fail.length){console.error('FAIL 10.31.29 Canonical Mission Workspace Improvements');for(const x of fail)console.error(' - '+x);process.exit(1)}
console.log('PASS 10.31.29 Canonical Mission Workspace Improvements');
