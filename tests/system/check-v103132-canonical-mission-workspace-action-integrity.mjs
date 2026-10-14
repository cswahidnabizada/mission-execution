import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),fail=[]; const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ui=read('public/assets/ui/canonical-mission-workspace.js');
const map=read('src/worker/application/actions/action-service-map.js');
const http=read('src/worker/core/http.js');
const cap=read('src/worker/extensions/actions-intelligence/action-capability.engine.js');
const contract=read('src/worker/extensions/actions-intelligence/action-contract.engine.js');
const secured=read('public/assets/js/extensions/secured-action-execution.js'); const serverExec=read('src/worker/extensions/action-execution/secured-action-execution.routes.js');
const admin=read('public/admin.html'); const driver=read('public/driver/dashboard.html');
if(!http.includes('if (!raw.trim()) return {};'))fail.push('empty JSON request bodies must normalize to an empty object');
if(!ui.includes('secured-action-execution.js?v=10.31.32'))fail.push('workspace secured runtime cache version is stale');
if(!secured.includes('actions-intelligence.js?v=10.31.32'))fail.push('nested action runtime cache version is stale');
if(admin.includes('10.31.28')||driver.includes('10.31.28'))fail.push('legacy 10.31.28 cache references remain in entry HTML');
if((ui.match(/function renderEdit\(/g)||[]).length!==1)fail.push('one canonical edit renderer required');
if(ui.includes('function renderEditData('))fail.push('legacy competing edit renderer must be removed');
if(!ui.includes('runSecured(actionByCode("edit_mission")'))fail.push('edit must execute through canonical edit action');
for(const field of ['pickupStreet','pickupZipCode','pickupCity','deliveryStreet','deliveryZipCode','deliveryCity','pickupTime','deliveryTime','deadlineAt','scheduleTimezone','missionEndTime','pickupAtUtc','deliveryAtUtc','deadlineAtUtc','pickupAccessFrom','pickupAccessTo','deliveryAccessFrom','deliveryAccessTo','objectType','objectDescription','weightKg','volumeM3','palletCount','vehicleRequirement','loadingType','unloadingType','matchingNotes','pickupLatitude','pickupLongitude','deliveryLatitude','deliveryLongitude','customerId','publicDescription']) if(!ui.includes(`name="${field}"`))fail.push(`edit form missing ${field}`);
if(!cap.includes('A.EDIT_MISSION,Boolean(missingRequired'))fail.push('required mission-data intelligence must use canonical edit_mission');
if(!contract.includes('a.code==="edit_mission_data"?"edit_mission"'))fail.push('legacy edit identity is not collapsed in action contract');
if(!map.includes('edit_mission:route'))fail.push('canonical edit service route missing');
if(!map.includes('edit_mission_data:route'))fail.push('internal edit compatibility route missing');
if(!serverExec.includes('case "edit_mission": case "edit_mission_data"'))fail.push('secured payload normalization missing edit compatibility');
for(const f of ['public/assets/ui/canonical-mission-workspace.js','src/worker/core/http.js','src/worker/extensions/actions-intelligence/action-capability.engine.js','src/worker/extensions/actions-intelligence/action-contract.engine.js','src/worker/application/actions/action-service-map.js','src/worker/extensions/action-execution/secured-action-authorization.contract.js']){const {spawnSync}=await import('node:child_process');const r=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});if(r.status!==0)fail.push(`${f} syntax error`);}
if(fail.length){console.error('FAIL 10.31.32 Canonical Mission Workspace Action Integrity');for(const x of fail)console.error(' - '+x);process.exit(1)}
console.log('PASS 10.31.32 Canonical Mission Workspace Action Integrity');
