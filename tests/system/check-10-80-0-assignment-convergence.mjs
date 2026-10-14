import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const failures=[];
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const management=read('src/worker/extensions/mission-management/management-intent.service.js');
const ops=read('src/worker/extensions/operations-context/operations-context.routes.js');
const assignment=read('src/worker/modules/assignments/assignment.engine.js');
const authority=read('src/worker/security/mission-assignment-authority.service.js');
if(!management.includes('getCanonicalMissionAssignment')) failures.push('management intent does not import canonical assignment authority');
if(!management.includes('await getCanonicalMissionAssignment')) failures.push('current-location actor resolution does not read canonical assignment');
if(/executionActor\(m\)/.test(management)) failures.push('management intent retains mission-row assignment fallback');
if(!ops.includes('await buildCanonicalResponsibility')) failures.push('operations context does not await canonical responsibility resolution');
if(!ops.includes('ownerCompanyId:Number(mission.company_id||session.tenantId||0)')) failures.push('operations context does not bind canonical responsibility to mission tenant');
if(!assignment.includes('authority:"mission_assignments"')) failures.push('assignment read model does not identify canonical authority');
if(!assignment.includes('readModel:"mission_active_assignment_projection"')) failures.push('assignment read model does not identify canonical projection');
if(!authority.includes('getCanonicalMissionAssignment')) failures.push('canonical assignment reader missing');
for(const f of ['src/worker/repositories/mission.repository.js','src/worker/repositories/executor.repository.js','src/worker/repositories/shared-mission.repository.js']){
  if(!read(f).includes('mission_active_assignment_projection')) failures.push(`${f}: missing canonical assignment projection`);
}
if(failures.length){console.error('10.80.0 Assignment Consumer Convergence gate: FAIL');for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('10.80.0 Assignment Consumer Convergence gate: PASS');
