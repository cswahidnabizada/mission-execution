import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=process.cwd();const read=f=>fs.readFileSync(path.join(root,f),'utf8');const fail=[];const exists=f=>fs.existsSync(path.join(root,f));
const ui=read('public/assets/ui/mission.js');
const runtime=read('public/assets/js/extensions/canonical-dashboard-runtime.js');
const route=read('src/worker/modules/intelligence/operational-mission-route.js');
const router=read('src/worker/core/router.js');
const admin=read('public/admin.html');
const old=['public/my-mission.html','public/assets/js/pages/my-mission.js','public/assets/js/pages/mission-workspace-native.js','public/assets/js/pages/mission-workspace-template.js'];
for(const f of old)if(exists(f))fail.push('legacy mission workspace remains:'+f);
if(!ui.includes('const VIEWS=Object.freeze(["situation","execution","evidence","history","actions","mission-tv"])'))fail.push('canonical view registry missing or changed');
for(const legacy of ['data-dmc-tab="overview"','data-dmc-tab="assignment"','data-dmc-tab="sharing"','data-dmc-tab="communication"','data-dmc-tab="management"'])if(ui.includes(legacy))fail.push('competing mission navigation remains:'+legacy);
for(const legacy of ['data-workspace-view="details"','data-workspace-view="management"'])if(ui.includes(legacy))fail.push('legacy native workspace navigation remains:'+legacy);
if(!runtime.includes('await renderMissionWorkbench($("#workbench"),idOf(x),normalizeActionId(x?._actionCenterCode||""));'))fail.push('dashboard mission selection does not resolve through canonical workspace');
if(!runtime.includes('await renderMissionWorkbench($("#workbench"),id,normalizeActionId(action?.code||""));'))fail.push('dashboard mission actions do not resolve through canonical workspace');
if(runtime.includes('async function missionWorkbench(x,token)'))fail.push('competing dashboard mission workspace renderer remains');
if(runtime.includes('openExistingMissionManagement('))fail.push('legacy mission management handoff remains');
if(route.includes('LEGACY_MISSION_PATH')||route.includes('/my-mission.html'))fail.push('legacy mission route remains authoritative');
if(router.includes('allowSameOriginFrame:url.pathname==="/my-mission.html"'))fail.push('legacy mission iframe allowance remains');
if(!admin.includes('canonical-mission-workspace-103122.css'))fail.push('canonical mission workspace CSS is not registered');
if(!admin.includes('canonical-dashboard-runtime.js?v=10.31.22&build=10.31.22'))fail.push('dashboard runtime cache version not advanced');
for(const f of ['public/assets/ui/mission.js','public/assets/js/extensions/canonical-dashboard-runtime.js','src/worker/modules/intelligence/operational-mission-route.js','src/worker/core/router.js']){const cp=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});if(cp.status!==0)fail.push(`syntax:${f}\n${cp.stderr}`)}
if(fail.length){console.error('FAIL 10.31.22 Canonical Mission Workspace');for(const x of fail)console.error(' - '+x);process.exit(1)}
console.log('PASS 10.31.22 Canonical Mission Workspace: one mission workspace, six canonical views, capability/navigation separation, legacy workspace removed');
