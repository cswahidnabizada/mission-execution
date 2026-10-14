import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(); const fail=[];
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const map=read('src/worker/application/actions/action-service-map.js');
const prep=read('src/worker/extensions/action-execution/secured-action-execution.routes.js');
const client=read('public/assets/js/extensions/secured-action-execution.js');
const ui=read('public/assets/ui/canonical-mission-workspace.js');
if(!map.includes('const body=value(def.body,context)'))fail.push('Action Service Map must evaluate payload builders with the runtime action context');
if(!prep.includes('const errorCode=status===200?null:stale?"MISSION_CHANGED":allProblems[0]||"ACTION_NOT_READY"'))fail.push('stale preparation must return a typed MISSION_CHANGED code');
if(!client.includes('serverCode.includes("stale_state_token")')||!client.includes('staleProblems.includes("stale_state_token")'))fail.push('secured client must recover from typed and legacy stale-state responses');
for(const code of ['assign_driver','change_driver','share_foryou','share_network','delete_mission','edit_mission','cancel_mission','reactivate_mission','message','report_exception','start_custody_resolution','accept_custody']){
  if(!map.includes(`${code}:route`))fail.push(`service route missing: ${code}`);
}
if((ui.match(/runSecured\(actionByCode\("edit_mission"/g)||[]).length<1)fail.push('Edit must execute through the canonical edit action');
for(const f of ['src/worker/application/actions/action-service-map.js','src/worker/extensions/action-execution/secured-action-execution.routes.js','public/assets/js/extensions/secured-action-execution.js','public/assets/ui/canonical-mission-workspace.js']){
 const {spawnSync}=await import('node:child_process'); const r=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'}); if(r.status!==0)fail.push(`${f} syntax error`);
}
if(fail.length){console.error('FAIL 10.31.33 Canonical Action End-to-End');for(const x of fail)console.error(' - '+x);process.exit(1)}
console.log('PASS 10.31.33 Canonical Action End-to-End');
