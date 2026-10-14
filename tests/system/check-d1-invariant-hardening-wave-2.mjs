import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const migration=fs.readFileSync(path.join(root,'database/migrations/0107_d1_invariant_hardening_wave_2.sql'),'utf8');
const schema=fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8');
const requiredTriggers=[
  'trg_mission_files_scope_guard_insert','trg_mission_files_scope_guard_update',
  'trg_mission_messages_scope_guard_insert','trg_mission_messages_scope_guard_update',
  'trg_mission_delivery_proofs_scope_guard_insert','trg_mission_delivery_proofs_scope_guard_update',
  'trg_mission_cancellations_scope_guard_insert','trg_mission_cancellations_scope_guard_update',
  'trg_mission_custody_cases_scope_guard_insert','trg_mission_custody_cases_scope_guard_update',
  'trg_mission_exceptions_scope_guard_insert','trg_mission_exceptions_scope_guard_update',
  'trg_mission_management_requirements_scope_guard_insert','trg_mission_management_requirements_scope_guard_update',
  'trg_mission_lifecycle_events_scope_guard_insert','trg_mission_lifecycle_events_scope_guard_update',
  'trg_mission_status_history_mission_guard_insert','trg_mission_status_history_mission_guard_update',
  'trg_mission_recipient_state_scope_guard_insert','trg_mission_recipient_state_scope_guard_update',
  'trg_mission_tenant_access_scope_guard_insert','trg_mission_tenant_access_scope_guard_update',
  'trg_mission_tenant_driver_assignment_scope_guard_insert','trg_mission_tenant_driver_assignment_scope_guard_update'
];
const requiredIndexes=[
  'idx_mission_files_company_mission','idx_mission_messages_company_mission',
  'idx_mission_delivery_proofs_company_mission','idx_mission_cancellations_company_mission',
  'idx_mission_custody_cases_company_mission','idx_mission_exceptions_company_mission',
  'idx_mission_management_requirements_company_mission','idx_mission_lifecycle_events_company_mission',
  'idx_mission_recipient_state_owner_mission','idx_mission_tenant_access_owner_mission',
  'idx_mission_tenant_driver_assignment_owner_mission'
];
const requiredTerms=[
  'INVARIANT_VIOLATION: mission file scope mismatch',
  'INVARIANT_VIOLATION: mission message scope mismatch',
  'INVARIANT_VIOLATION: mission delivery proof scope mismatch',
  'INVARIANT_VIOLATION: mission cancellation scope mismatch',
  'INVARIANT_VIOLATION: mission custody case scope mismatch',
  'INVARIANT_VIOLATION: mission exception scope mismatch',
  'INVARIANT_VIOLATION: mission management requirement scope mismatch',
  'INVARIANT_VIOLATION: mission lifecycle event scope mismatch',
  'INVARIANT_VIOLATION: mission status history references unknown mission',
  'INVARIANT_VIOLATION: mission recipient state scope mismatch',
  'INVARIANT_VIOLATION: mission tenant access scope mismatch',
  'INVARIANT_VIOLATION: mission tenant driver assignment scope mismatch'
];
const failures=[];
for(const name of requiredTriggers) if(!migration.includes(`CREATE TRIGGER IF NOT EXISTS ${name}`)) failures.push(`migration trigger missing: ${name}`);
for(const name of requiredIndexes){
  if(!migration.includes(name)) failures.push(`migration index missing: ${name}`);
  if(!schema.includes(name)) failures.push(`schema index missing: ${name}`);
}
for(const term of requiredTerms) if(!migration.includes(term)) failures.push(`invariant guard missing: ${term}`);
for(const forbidden of ['DROP TRIGGER','DROP TABLE','ALTER TABLE missions','CREATE TABLE']) if(migration.includes(forbidden)) failures.push(`wave 2 must not replace authority or destructively change schema: ${forbidden}`);
const crossScopeChecks=[
  ['mission_files','missions m','m.id=NEW.mission_id AND m.company_id=NEW.company_id'],
  ['mission_messages','missions m','m.id=NEW.mission_id AND m.company_id=NEW.company_id'],
  ['mission_delivery_proofs','mission_files f','f.id=NEW.file_id AND f.mission_id=NEW.mission_id AND f.company_id=NEW.company_id'],
  ['mission_tenant_access','missions m','m.id=NEW.mission_id AND m.company_id=NEW.owner_company_id'],
  ['mission_tenant_driver_assignments','drivers d','d.id=NEW.driver_id AND d.company_id=NEW.access_company_id']
];
for(const [label,table,condition] of crossScopeChecks) if(!migration.includes(`FROM ${table}`)||!migration.includes(condition)) failures.push(`cross-scope guard incomplete: ${label}`);
if(failures.length){console.error('D1 invariant hardening Wave 2 gate: FAIL');for(const f of failures) console.error(`- ${f}`);process.exit(1)}
console.log(`D1 invariant hardening Wave 2 gate: PASS (${requiredTriggers.length} triggers, ${requiredIndexes.length} indexes)`);
