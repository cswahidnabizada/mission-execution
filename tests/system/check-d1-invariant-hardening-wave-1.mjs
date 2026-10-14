import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const migration=fs.readFileSync(path.join(root,'database/migrations/0106_d1_invariant_hardening_wave_1.sql'),'utf8');
const schema=fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8');
const requiredTriggers=[
  'trg_missions_driver_company_guard_insert','trg_missions_driver_company_guard_update',
  'trg_mission_stops_company_guard_insert','trg_mission_stops_company_guard_update',
  'trg_mission_objects_company_guard_insert','trg_mission_objects_company_guard_update',
  'trg_mission_assignments_integrity_insert','trg_mission_assignments_integrity_update',
  'trg_missions_lifecycle_binding_insert','trg_missions_lifecycle_binding_update',
  'trg_missions_lifecycle_state_insert','trg_missions_lifecycle_transition_update',
  'trg_mission_custody_events_company_guard_insert','trg_mission_custody_events_company_guard_update',
  'trg_mission_evidence_events_company_guard_insert','trg_mission_evidence_events_company_guard_update',
  'trg_mission_event_ledger_company_guard_insert','trg_mission_event_ledger_company_guard_update',
  'trg_mission_transition_requests_company_guard_insert','trg_mission_transition_requests_company_guard_update',
  'trg_mission_transition_events_company_guard_insert','trg_mission_transition_events_company_guard_update'
];
const requiredIndexes=[
  'idx_mission_stops_company_mission','idx_mission_objects_company_mission',
  'idx_mission_assignments_company_mission_status','idx_mission_custody_events_company_mission',
  'idx_mission_evidence_events_company_mission','idx_mission_event_ledger_company_mission',
  'idx_mission_transition_requests_company_mission','idx_mission_transition_events_company_mission'
];
const requiredTerms=[
  'INVARIANT_VIOLATION: mission driver company mismatch',
  'INVARIANT_VIOLATION: mission stop company/mission mismatch',
  'INVARIANT_VIOLATION: mission object company/mission mismatch',
  'INVARIANT_VIOLATION: mission assignment integrity failure',
  'INVARIANT_VIOLATION: invalid or changed lifecycle binding',
  'INVARIANT_VIOLATION: unknown lifecycle state',
  'INVARIANT_VIOLATION: illegal lifecycle transition',
  'INVARIANT_VIOLATION: custody event company/mission mismatch',
  'INVARIANT_VIOLATION: evidence event scope mismatch',
  'INVARIANT_VIOLATION: event ledger company/mission mismatch',
  'INVARIANT_VIOLATION: transition request company/mission mismatch',
  'INVARIANT_VIOLATION: transition event company/mission mismatch'
];
const failures=[];
for(const name of requiredTriggers){
  if(!migration.includes(`CREATE TRIGGER IF NOT EXISTS ${name}`)) failures.push(`migration trigger missing: ${name}`);
  }
for(const name of requiredIndexes){
  if(!migration.includes(name)) failures.push(`migration index missing: ${name}`);
  if(!schema.includes(name)) failures.push(`schema index missing: ${name}`);
}
for(const term of requiredTerms) if(!migration.includes(term)) failures.push(`invariant guard missing: ${term}`);
for(const forbidden of ['DROP TRIGGER','DROP TABLE','ALTER TABLE missions']) if(migration.includes(forbidden)) failures.push(`wave 1 must not perform destructive schema replacement: ${forbidden}`);
if(!schema.includes('idx_mission_assignments_one_active')) failures.push('assignment active uniqueness index missing from schema');
if(!migration.includes("from_state_code=OLD.lifecycle_state_code")) failures.push('lifecycle transition guard missing predecessor state check');
if(!migration.includes('mission_files f')) failures.push('evidence/file tenant guard missing');
if(failures.length){console.error('D1 invariant hardening Wave 1 gate: FAIL');for(const f of failures) console.error(`- ${f}`);process.exit(1)}
console.log(`D1 invariant hardening Wave 1 gate: PASS (${requiredTriggers.length} triggers, ${requiredIndexes.length} indexes)`);
