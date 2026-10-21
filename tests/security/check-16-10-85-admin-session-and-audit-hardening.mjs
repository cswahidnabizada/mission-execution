import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createPlatformSuperAdminSession,createPlatformSuperAdminStepUpSession,readPlatformSuperAdministrator,readPlatformSuperAdminStepUp,destroyPlatformSuperAdministrator} from '../../src/worker/security/platform-super-administrator.js';

const store=new Map();
const env={PLATFORM_SUPER_ADMIN_SECRET:'unit-test-secret-value',KV_BINDING:{async get(k){return store.get(k)??null},async put(k,v){store.set(k,v)},async delete(k){store.delete(k)}}};
const req=(cookies)=>new Request('https://example.test/api/x',{headers:{Cookie:cookies}});

// 1. session lifecycle: login -> valid -> logout -> revoked
const token=await createPlatformSuperAdminSession(env,req(''));
const cookie=`onmission_platform_super_admin=${encodeURIComponent(token)}`;
assert.ok(await readPlatformSuperAdministrator(req(cookie),env),'fresh session must be valid');
const step=await createPlatformSuperAdminStepUpSession(env,req(cookie),env.PLATFORM_SUPER_ADMIN_SECRET,'*');
const both=`${cookie}; onmission_platform_super_admin_stepup=${encodeURIComponent(step)}`;
assert.ok(await readPlatformSuperAdminStepUp(req(both),env),'step-up must be valid before logout');
assert.equal(await destroyPlatformSuperAdministrator(req(cookie),env),true);
assert.equal(await readPlatformSuperAdministrator(req(cookie),env),null,'replayed cookie must be rejected after logout');
assert.equal(await readPlatformSuperAdminStepUp(req(both),env),null,'step-up bound to revoked session must die with it');

// 2. forged/garbage tokens cannot pollute the deny-list
const before=store.size;
assert.equal(await destroyPlatformSuperAdministrator(req('onmission_platform_super_admin=v2|9999999999|n|1|AAAA'),env),false);
assert.equal(await destroyPlatformSuperAdministrator(req(''),env),false);
assert.equal(store.size,before);

// 3. malformed percent-encoding must not throw
assert.equal(await readPlatformSuperAdministrator(req('onmission_platform_super_admin=%E0%A4%A'),env),null);

// 4. KV outage fails closed
const t2=await createPlatformSuperAdminSession(env,req(''));
const broken={...env,KV_BINDING:{async get(){throw new Error('kv down')}}};
assert.equal(await readPlatformSuperAdministrator(req(`onmission_platform_super_admin=${encodeURIComponent(t2)}`),broken),null);

// 5. login route source: digest comparison + failed-attempt audit, no early length return
const route=fs.readFileSync(new URL('../../src/worker/modules/admin-control/admin-access.routes.js',import.meta.url),'utf8');
assert.ok(route.includes("crypto.subtle.digest('SHA-256'"),'login must compare fixed-length digests');
assert.ok(!/x\.length!==y\.length/.test(route),'login must not early-return on length mismatch');
assert.ok(route.includes('platform.super_admin.login_failed'),'failed logins must be audited');
assert.ok(!/ip:\s*requestIp/.test(route),'raw IP must not be stored in audit metadata');

// 6. audit immutability triggers (real SQLite)
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER NOT NULL,actor_role TEXT NOT NULL,action TEXT NOT NULL,resource_type TEXT NOT NULL,metadata TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE admin_control_audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,actor_role TEXT NOT NULL,action TEXT NOT NULL,resource_type TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
db.exec(fs.readFileSync(new URL('../../database/migrations/0162_audit_log_immutability.sql',import.meta.url),'utf8'));
db.exec(fs.readFileSync(new URL('../../database/migrations/0163_audit_retention_policy_alignment.sql',import.meta.url),'utf8'));
db.exec(`INSERT INTO audit_logs(company_id,actor_role,action,resource_type) VALUES(1,'admin','a','r');
INSERT INTO audit_logs(company_id,actor_role,action,resource_type,created_at) VALUES(1,'admin','old','r',datetime('now','-100 days'));
INSERT INTO admin_control_audit_events(event_id,actor_role,action,resource_type,created_at) VALUES('e1','x','a','r',datetime('now','-900 days'));`);
assert.throws(()=>db.exec(`UPDATE audit_logs SET action='tampered'`),/AUDIT_LOG_IMMUTABLE/);
assert.throws(()=>db.exec(`DELETE FROM audit_logs WHERE action='a'`),/AUDIT_LOG_RETENTION_FLOOR/);
assert.throws(()=>db.exec(`UPDATE admin_control_audit_events SET action='tampered'`),/AUDIT_EVENTS_IMMUTABLE/);
assert.throws(()=>db.exec(`DELETE FROM admin_control_audit_events`),/AUDIT_EVENTS_IMMUTABLE/);
assert.throws(()=>db.exec(`DELETE FROM audit_logs WHERE action='old'`),/AUDIT_LOG_RETENTION_FLOOR/,'100-day-old audit rows must remain protected by the 365-day policy');
db.exec(`INSERT INTO audit_logs(company_id,actor_role,action,resource_type,created_at) VALUES(1,'admin','expired','r',datetime('now','-366 days'))`);
db.exec(`DELETE FROM audit_logs WHERE action='expired'`);
db.exec(`DELETE FROM audit_logs WHERE created_at < datetime('now','-365 days')`); // scheduled purge window still works
assert.equal(db.prepare('SELECT COUNT(*) c FROM audit_logs').get().c,2);
console.log('16.10.85 admin session revocation + audit immutability: PASS');
