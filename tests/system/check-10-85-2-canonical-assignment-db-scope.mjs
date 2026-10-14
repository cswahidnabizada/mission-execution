import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec(fs.readFileSync('database/schema.current.sql','utf8'));
db.exec(fs.readFileSync('database/migrations/0123_final_assignment_schema_retirement.sql','utf8'));
db.exec(fs.readFileSync('database/migrations/0124_canonical_assignment_scope_hardening.sql','utf8'));
const run=(sql,...params)=>db.prepare(sql).run(...params);
const reject=(label,sql,...params)=>assert.throws(()=>run(sql,...params),/INVARIANT_VIOLATION/,label);

run('INSERT INTO companies(name) VALUES (?)','Owner');
run('INSERT INTO companies(name) VALUES (?)','Shared');
run('INSERT INTO drivers(company_id,name) VALUES (?,?)',1,'Owner Driver');
run('INSERT INTO drivers(company_id,name) VALUES (?,?)',2,'Shared Driver');
run('INSERT INTO public_executor_identities(login,email,display_name,password_hash,password_salt) VALUES (?,?,?,?,?)','exec','exec@example.test','Executor','x','y');
run('INSERT INTO missions(company_id,reference,status) VALUES (?,?,?)',1,'M-OWNER','Pending');
run('INSERT INTO missions(company_id,reference,status) VALUES (?,?,?)',1,'M-SHARED','Pending');
run('INSERT INTO missions(company_id,reference,status) VALUES (?,?,?)',1,'M-EXEC','Pending');

const insert=`INSERT INTO mission_assignments(company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id) VALUES (?,?,?,?,?,?)`;
reject('owner driver without tenant binding must fail',insert,1,1,'owner_driver','driver',1,null);
reject('owner driver from another tenant must fail',insert,1,1,'owner_driver','driver',2,2);
run(insert,1,1,'owner_driver','driver',1,1);

reject('tenant driver without active access must fail',insert,1,2,'tenant_driver','driver',2,2);
run(`INSERT INTO mission_tenant_access(mission_id,owner_company_id,access_company_id,status) VALUES (?,?,?,'active')`,2,1,2);
run(insert,1,2,'tenant_driver','driver',2,2);

// Executor identities are platform identities and are not forced into a driver/company scope.
run(insert,1,3,'executor','executor',1,1);

console.log('Canonical assignment DB scope hardening: PASS (owner-driver tenant binding, shared-driver access binding, executor control and negative cases verified)');
