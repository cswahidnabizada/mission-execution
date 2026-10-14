import fs from 'node:fs';import path from 'node:path';const root=process.cwd();const read=p=>fs.readFileSync(path.join(root,p),'utf8');const fail=[];
const svc=read('src/worker/security/platform-data-entry.service.js');const routes=read('src/worker/modules/admin-control/admin-control.routes.js');const ui=read('public/assets/js/frontend/admin/admin.js');
for(const token of ['previewDataEntryImport','commitDataEntryImport','forbiddenSecrets','DATA_ENTRY_SECRET_FIELD_FORBIDDEN','dependencyCheck','policyCheck','DATA_ENTRY_STEP_UP_REQUIRED','idempotencyKey','status===\'committed\''])if(!svc.includes(token))fail.push(`missing adversarial control ${token}`);
for(const token of ['requirePlatformSuperAdminStepUp(request,env)','stepUpVerified:true','idem(request,b)'])if(!routes.includes(token))fail.push(`missing route security control ${token}`);
if(/DELETE FROM platform_data_entry_records/i.test(svc))fail.push('gate must not expose destructive SQL');
if(/eval\(|new Function|Function\(/.test(svc))fail.push('dynamic execution present');
// The browser must preserve one idempotency key across step-up retry.
const apiStart=ui.indexOf('const api=async');const apiSlice=ui.slice(apiStart,apiStart+1800);if(!apiSlice.includes("request.headers['Idempotency-Key']=crypto.randomUUID()"))fail.push('stable browser idempotency key not initialized before retry');if(!apiSlice.includes('rawApi(path,request)'))fail.push('retry does not reuse request object');
if(fail.length){console.error('FAIL 10.38.29 Data Entry adversarial controls');fail.forEach(x=>console.error(' - '+x));process.exit(1)}console.log('PASS 10.38.29 Data Entry adversarial controls');
