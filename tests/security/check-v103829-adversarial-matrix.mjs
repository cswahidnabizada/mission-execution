import fs from 'node:fs';import path from 'node:path';const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),'utf8'),fail=[];
const entry=read('src/worker/security/platform-data-entry.service.js'),routes=read('src/worker/modules/admin-control/admin-control.routes.js'),trash=read('src/worker/security/platform-trash.service.js'),data=read('src/worker/security/platform-data-control.service.js'),ui=read('public/assets/js/frontend/admin/admin.js');
const must=[
 ['secret injection','DATA_ENTRY_SECRET_FIELD_FORBIDDEN',entry],
 ['unsupported type','DATA_ENTRY_TYPE_NOT_SUPPORTED',entry],
 ['dependency mismatch','BLUEPRINT_COUNTRY_MISMATCH',entry],
 ['step-up commit','DATA_ENTRY_STEP_UP_REQUIRED',entry],
 ['commit lease','DATA_ENTRY_COMMIT_IN_PROGRESS',entry],
 ['same-entry idempotency','idempotency_key',entry],
 ['browser stable idempotency',"request.headers['Idempotency-Key']=crypto.randomUUID()",ui],
 ['retry same request','rawApi(path,request)',ui],
 ['trash lifecycle sync','syncEntryLifecycle',trash],
 ['trace-only data entry',"resourceType:'data_entry'",data]
];for(const [n,t,s] of must)if(!s.includes(t))fail.push(`${n}: missing ${t}`);
if(/DELETE\s+FROM\s+platform_data_entry_records/i.test(entry))fail.push('generic destructive delete exists');
if(/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(/.test(entry))fail.push('dynamic code execution exists');
if(!routes.includes("router.post(/^\\/api\\/platform\\/admin\\/data-entry\\/(?<entryId>[^/]+)\\/commit$/"))fail.push('commit route is not explicit');
if(!routes.includes("const actor=await requirePlatformSuperAdminStepUp(request,env)"))fail.push('protected mutations lack step-up');
console.log(`Adversarial Testing Matrix: ${fail.length?'FAIL':'PASS'} (${must.length} controls)`);if(fail.length){fail.forEach(x=>console.error(' - '+x));process.exit(1)}
