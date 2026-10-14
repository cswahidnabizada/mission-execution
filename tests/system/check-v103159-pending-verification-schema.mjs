import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const migration=fs.readFileSync(path.join(root,'database/migrations/0044_company_verification_pending_timestamp.sql'),'utf8');
const schema=fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8');
const repo=fs.readFileSync(path.join(root,'src/worker/repositories/auth.repository.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'src/worker/modules/auth/auth.service.js'),'utf8');

if(!/CREATE TABLE company_verification_status_new[\s\S]*verified_at TEXT,/.test(migration)) throw new Error('Migration does not make verified_at nullable');
if(!/INSERT INTO company_verification_status_new[\s\S]*SELECT[\s\S]*FROM company_verification_status/.test(migration)) throw new Error('Migration does not preserve existing verification rows');
if(!/DROP TABLE company_verification_status;[\s\S]*ALTER TABLE company_verification_status_new RENAME TO company_verification_status;/.test(migration)) throw new Error('Migration does not complete table replacement');
if(!/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:\"|')?company_verification_status(?:\"|')?[\s\S]*verified_at TEXT,/.test(schema)) throw new Error('Canonical schema still requires verified_at');
if(!/markCompanyPending[\s\S]*verified_at=NULL/.test(repo)) throw new Error('Pending repository path must clear verified_at');
if(!/await authRepo\.markCompanyPending\(env, companyId\)/.test(auth)) throw new Error('Registration must initialize pending company verification');
if(/balm/i.test(auth)) throw new Error('Registration service must remain BALM-free');
console.log('10.31.59 pending verification schema contract: PASS');
