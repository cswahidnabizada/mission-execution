import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const failures=[];
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const exists=f=>fs.existsSync(path.join(root,f));
const version=read('VERSION').trim();
const oldRegistry='src/worker/core/canonical-lifecycle-registry.js';
if(exists(oldRegistry)) failures.push('legacy canonical lifecycle registry still exists');
const service=read('src/worker/security/sector-lifecycle.service.js');
for(const token of ['resolveLifecycleForNewMission','resolveLifecycleForMission','assertLifecycleTransition','activateLifecycleForLaunchSector']) if(!service.includes(`export async function ${token}`)) failures.push(`sector lifecycle authority missing ${token}`);
const generic=read('src/worker/core/lifecycle-contract.js');
for(const token of ['definitionTransition','definitionSuccessors','isDefinitionTerminal','assertDefinitionTransition']) if(!generic.includes(`export function ${token}`)) failures.push(`generic lifecycle primitive missing ${token}`);
const logistics=read('src/worker/domains/logistics/logistics-lifecycle.contract.js');
for(const token of ['LOGISTICS_LIFECYCLE_DEFINITION','LOGISTICS_LIFECYCLE_KEY','MISSION_STATUS_FLOW']) if(!logistics.includes(`export const ${token}`)) failures.push(`logistics contract missing ${token}`);
const productionFiles=[];
function walk(dir){for(const n of fs.readdirSync(dir)){if(['node_modules','.git'].includes(n))continue;const p=path.join(dir,n),st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(js|mjs|html)$/.test(n))productionFiles.push(p)}}
walk(path.join(root,'src'));walk(path.join(root,'public'));walk(path.join(root,'scripts'));
for(const f of productionFiles){if(f.endsWith('check-current-lifecycle-authority.mjs')||f.endsWith('audit-canonical-convergence.mjs')) continue;const s=fs.readFileSync(f,'utf8');if(s.includes('canonical-lifecycle-registry.js')) failures.push(`legacy lifecycle import/reference: ${path.relative(root,f)}`);}
const transition=read('src/worker/modules/transitions/mission-transition.service.js');
if(!transition.includes('assertLifecycleTransition')) failures.push('mission transition service is not lifecycle-contract controlled');
if(transition.includes('canonicalMissionStatus(expectedStatus)')||transition.includes('canonicalMissionStatus(nextStatus)')) failures.push('mission transition service still normalizes every sector state through logistics vocabulary');
const architecture=read('src/worker/core/canonical-architecture-control.js');
if(!architecture.includes('lifecycle:"src/worker/security/sector-lifecycle.service.js"')) failures.push('canonical architecture does not identify sector lifecycle authority');
if(failures.length){console.error(`Current lifecycle authority: FAIL (${version})`);failures.forEach(x=>console.error('- '+x));process.exit(1)}
console.log(`Current lifecycle authority: PASS (${version})`);
