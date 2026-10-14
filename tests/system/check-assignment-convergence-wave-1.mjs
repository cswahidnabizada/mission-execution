import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const failures=[];
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const authority=read('src/worker/security/mission-assignment-authority.service.js');
const custody=read('src/worker/extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js');
const network=read('src/worker/modules/network/network.service.js');
const people=read('src/worker/modules/people/people.service.js');
const publicRepo=read('src/worker/repositories/public.repository.js');
const reactivation=read('src/worker/extensions/mission-management/lifecycle/reactivation.service.js');
for(const needle of ['canonicalAssignmentProjectionStatements','mission_assignments']){
  if(!authority.includes(needle)) failures.push(`assignment authority missing ${needle}`);
}
if(/INSERT INTO mission_executor_assignments|INSERT INTO mission_tenant_driver_assignments|UPDATE mission_executor_assignments|DELETE FROM mission_executor_assignments|DELETE FROM mission_tenant_driver_assignments/.test(custody)) failures.push('custody service still directly writes legacy assignment projections');
if(/FROM mission_executor_assignments|FROM mission_tenant_driver_assignments/.test(custody)) failures.push('custody service still reads legacy assignment tables');
if(!network.includes('FROM mission_assignments')) failures.push('network consumer missing canonical assignment read');
if(/INSERT INTO mission_tenant_driver_assignments/.test(network)) failures.push('network consumer still directly writes legacy tenant-driver assignment');
if(!people.includes('FROM mission_assignments')) failures.push('people custody guard missing canonical assignment read');
if(/FROM mission_tenant_driver_assignments/.test(people)) failures.push('people custody guard still reads legacy tenant-driver assignment');
if(!publicRepo.includes('FROM mission_assignments')) failures.push('public executor request guard missing canonical assignment read');
if(!reactivation.includes('FROM mission_assignments')) failures.push('reactivation consumer missing canonical assignment read');
if(/FROM mission_executor_assignments/.test(reactivation)) failures.push('reactivation consumer still reads legacy executor assignment');
if(failures.length){console.error('Assignment consumer convergence wave-1 gate: FAIL');for(const x of failures)console.error(`- ${x}`);process.exit(1)}
console.log('Assignment consumer convergence wave-1 gate: PASS');
