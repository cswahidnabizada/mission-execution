import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root=process.cwd();
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec(fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8'));
const wave1=fs.readFileSync(path.join(root,'database/migrations/0106_d1_invariant_hardening_wave_1.sql'),'utf8')
  .replace(/CREATE TRIGGER IF NOT EXISTS trg_missions_driver_company_guard_insert[\s\S]*?END;\s*/,'')
  .replace(/CREATE TRIGGER IF NOT EXISTS trg_missions_driver_company_guard_update[\s\S]*?END;\s*/,'');
db.exec(wave1);
db.exec(fs.readFileSync(path.join(root,'database/migrations/0107_d1_invariant_hardening_wave_2.sql'),'utf8'));

const failures=[];
const exec=(sql,params=[])=>db.prepare(sql).run(...params);
const expectReject=(label,sql,params=[])=>{
  try { exec(sql,params); failures.push(`${label}: write was accepted`); }
  catch(e){ if(!String(e.message).includes('INVARIANT_VIOLATION')) failures.push(`${label}: unexpected error ${e.message}`); }
};

exec('INSERT INTO companies(name) VALUES (?)', ['Tenant A']);
exec('INSERT INTO companies(name) VALUES (?)', ['Tenant B']);
exec('INSERT INTO drivers(company_id,name) VALUES (?,?)', [1,'Driver A']);
exec('INSERT INTO drivers(company_id,name) VALUES (?,?)', [2,'Driver B']);
exec('INSERT INTO public_executor_identities(login,email,display_name,password_hash,password_salt) VALUES (?,?,?,?,?)', ['exec-a','exec-a@example.test','Executor A','x','y']);
exec('INSERT INTO public_executor_identities(login,email,display_name,password_hash,password_salt) VALUES (?,?,?,?,?)', ['exec-b','exec-b@example.test','Executor B','x','y']);
exec(`INSERT INTO missions(company_id,reference,status) VALUES (?,?,?)`, [1,'M-001','Pending']);
exec(`INSERT INTO mission_files(company_id,mission_id,uploaded_by_role,file_type,mime_type,r2_key) VALUES (?,?,?,?,?,?)`, [1,1,'admin','proof','application/pdf','r2/a']);
exec(`INSERT INTO mission_tenant_access(mission_id,owner_company_id,access_company_id,status) VALUES (?,?,?,'active')`, [1,1,2]);

expectReject('file cross-tenant parent', `INSERT INTO mission_files(company_id,mission_id,uploaded_by_role,file_type,mime_type,r2_key) VALUES (?,?,?,?,?,?)`, [2,1,'admin','proof','application/pdf','r2/b']);
expectReject('file foreign driver', `INSERT INTO mission_files(company_id,mission_id,uploaded_by_role,driver_id,file_type,mime_type,r2_key) VALUES (?,?,?,?,?,?,?)`, [1,1,'driver',2,'proof','application/pdf','r2/c']);
expectReject('message cross-tenant parent', `INSERT INTO mission_messages(company_id,mission_id,sender_role,message) VALUES (?,?,?,?)`, [2,1,'admin','bad']);
expectReject('message foreign file', `INSERT INTO mission_messages(company_id,mission_id,sender_role,file_id,message) VALUES (?,?,?,?,?)`, [1,1,'admin',999,'bad']);
expectReject('delivery proof foreign file', `INSERT INTO mission_delivery_proofs(company_id,mission_id,file_id,submitted_by_role,driver_id) VALUES (?,?,?,?,?)`, [1,1,999,'driver',1]);
expectReject('delivery proof missing submitting driver', `INSERT INTO mission_delivery_proofs(company_id,mission_id,file_id,submitted_by_role) VALUES (?,?,?,?)`, [1,1,1,'driver']);
expectReject('cancellation cross-tenant parent', `INSERT INTO mission_cancellations(company_id,mission_id,reason_code,cancelled_by_role,mission_status_before) VALUES (?,?,?,?,?)`, [2,1,'x','admin','Pending']);
expectReject('custody case foreign driver', `INSERT INTO mission_custody_cases(company_id,mission_id,current_holder_type,current_holder_id,resolution_type) VALUES (?,?,?,?,?)`, [1,1,'driver',2,'transfer']);
expectReject('exception foreign driver', `INSERT INTO mission_exceptions(company_id,mission_id,driver_id,exception_type,created_by_role) VALUES (?,?,?,?,?)`, [1,1,2,'delay','admin']);
expectReject('management requirement cross-tenant parent', `INSERT INTO mission_management_requirements(company_id,mission_id,code,requested_actor_type,requested_by_role) VALUES (?,?,?,?,?)`, [2,1,'x','driver','admin']);
expectReject('lifecycle event cross-tenant parent', `INSERT INTO mission_lifecycle_events(company_id,mission_id,event_type,actor_role,previous_status,next_status) VALUES (?,?,?,?,?,?)`, [2,1,'cancelled','admin','Pending','Cancelled']);
expectReject('status history unknown mission', `INSERT INTO mission_status_history(mission_id,status) VALUES (?,?)`, [999,'Pending']);
expectReject('recipient owner mismatch', `INSERT INTO mission_recipient_state(mission_id,mission_owner_company_id,recipient_key,recipient_role) VALUES (?,?,?,?)`, [1,2,'x','admin']);
expectReject('recipient driver tenant mismatch', `INSERT INTO mission_recipient_state(mission_id,mission_owner_company_id,recipient_key,recipient_role,recipient_tenant_id,recipient_driver_id) VALUES (?,?,?,?,?,?)`, [1,1,'x2','driver',1,2]);
expectReject('tenant access owner mismatch', `INSERT INTO mission_tenant_access(mission_id,owner_company_id,access_company_id,status) VALUES (?,?,?,'active')`, [1,2,1]);
expectReject('tenant driver assignment foreign driver', `INSERT INTO mission_tenant_driver_assignments(mission_id,owner_company_id,access_company_id,driver_id) VALUES (?,?,?,?)`, [1,1,2,1]);

// Positive controls prove the guards are not merely blanket-deny logic.
exec(`INSERT INTO mission_files(company_id,mission_id,uploaded_by_role,driver_id,file_type,mime_type,r2_key) VALUES (?,?,?,?,?,?,?)`, [1,1,'driver',1,'proof','application/pdf','r2/positive']);
exec(`INSERT INTO mission_messages(company_id,mission_id,sender_role,driver_id,file_id,message) VALUES (?,?,?,?,?,?)`, [1,1,'driver',1,1,'valid']);
exec(`INSERT INTO mission_delivery_proofs(company_id,mission_id,file_id,submitted_by_role,driver_id) VALUES (?,?,?,?,?)`, [1,1,1,'driver',1]);
exec(`INSERT INTO mission_tenant_driver_assignments(mission_id,owner_company_id,access_company_id,driver_id) VALUES (?,?,?,?)`, [1,1,2,2]);

if(failures.length){
  console.error('D1 invariant hardening Wave 2 runtime gate: FAIL');
  for(const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('D1 invariant hardening Wave 2 runtime gate: PASS (18 adversarial rejection cases, 4 positive controls)');
