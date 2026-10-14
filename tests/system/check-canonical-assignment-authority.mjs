import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const failures=[];
const required=[
  'src/worker/security/mission-assignment-authority.service.js',
  'database/migrations/0100_canonical_mission_assignment_authority.sql'
];
for(const f of required)if(!fs.existsSync(path.join(root,f)))failures.push(`missing ${f}`);
const schema=fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8');
for(const needle of ['CREATE TABLE mission_assignments','idx_mission_assignments_one_active','CREATE TABLE mission_assignment_reconciliation'])if(!schema.includes(needle))failures.push(`schema missing ${needle}`);
const svc=fs.readFileSync(path.join(root,'src/worker/security/mission-assignment-authority.service.js'),'utf8');
for(const needle of ['canonicalAssignmentStatements','canonicalAssignmentRevokeStatements','mission_assignments'])if(!svc.includes(needle))failures.push(`authority missing ${needle}`);
if(failures.length){console.error('Canonical assignment authority gate: FAIL');for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Canonical assignment authority gate: PASS');
