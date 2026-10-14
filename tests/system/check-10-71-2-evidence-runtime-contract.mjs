/* ON Mission 10.71.4 — Wave B evidence/runtime contract. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
import {completeCriticalAudit} from '../../src/worker/security/critical-audit.service.js';

const sqlCalls=[];
const env={
  DB:{
    prepare(sql){
      return {
        bind(...args){
          return {
            async run(){
              sqlCalls.push({sql,args});
              return {meta:{changes:1}};
            }
          };
        }
      };
    }
  }
};
const ok=await completeCriticalAudit(env,'ca_test',{success:true});
assert.equal(ok.status,'complete');
assert.equal(sqlCalls.length,1);
assert.match(sqlCalls[0].sql,/UPDATE critical_audit_events SET phase=/);

const failingEnv={
  DB:{
    prepare(){
      return {
        bind(){
          return {async run(){throw new Error('simulated D1 completion failure');}};
        }
      };
    }
  }
};
const pending=await completeCriticalAudit(failingEnv,'ca_failure',{success:true});
assert.equal(pending.status,'pending_reconciliation');

const studio=await fs.readFile(path.join(ROOT,'public/assets/js/frontend/admin/data-studio.js'),'utf8');
assert.match(studio,/EVIDENCE RECOVERY REQUIRED/);
assert.match(studio,/PENDING RECONCILIATION/);
assert.match(studio,/\/api\/platform\/admin\/data-entry\/reconcile/);

const service=await fs.readFile(path.join(ROOT,'src/worker/security/platform-data-studio.service.js'),'utf8');
assert.match(service,/DATA_STUDIO_AUDIT_COMPLETION_REQUIRED/);
assert.match(service,/auditStatus==='pending_reconciliation'/);
console.log('10.71.4 evidence runtime contract: PASS');
