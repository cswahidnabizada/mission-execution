import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fail=[];
const entry=read('src/worker/security/platform-data-entry.service.js');
const product=read('src/worker/security/product-definition.service.js');
const blueprint=read('src/worker/security/country-product-blueprint.service.js');
const launch=read('src/worker/security/country-product-launch.service.js');
const expansion=read('src/worker/security/product-expansion.service.js');
const config=read('src/worker/security/platform-configuration.service.js');
const ui=read('public/assets/js/frontend/admin/admin.js');
const routes=read('src/worker/modules/admin-control/admin-control.routes.js');
const schema=read('database/schema.current.sql');

for(const [name,text,tokens] of [
 ['entry',[entry],['DATA_ENTRY_IDEMPOTENCY_REQUIRED','DATA_ENTRY_COMMIT_IN_PROGRESS','DATA_ENTRY_STEP_UP_REQUIRED','DATA_ENTRY_VALIDATION_BLOCKED','DATA_ENTRY_SECRET_FIELD_FORBIDDEN']],
 ['product',[product],['dataEntryId','WHERE data_entry_id=?']],
 ['blueprint',[blueprint],['dataEntryId','WHERE data_entry_id=?']],
 ['launch',[launch],['dataEntryId','WHERE data_entry_id=?']],
 ['expansion',[expansion],['dataEntryId','WHERE data_entry_id=?']],
 ['configuration',[config],['dataEntryId','WHERE data_entry_id=?']]
]) for(const t of tokens)if(!text[0].includes(t))fail.push(`${name}: missing ${t}`);
if(!ui.includes("request.headers['Idempotency-Key']=crypto.randomUUID()"))fail.push('browser does not generate stable idempotency key');
if(!ui.includes('rawApi(path,request)'))fail.push('step-up retry does not reuse original request');
if(!routes.includes('requirePlatformSuperAdminStepUp(request,env)'))fail.push('protected admin mutation boundary missing');
if(/DELETE\s+FROM\s+platform_data_entry_records/i.test(entry))fail.push('generic entry deletion exists');
for(const text of [entry,product,blueprint,launch,expansion,config])if(/\beval\s*\(|new\s+Function\s*\(/.test(text))fail.push('dynamic execution found in governed creation path');
if(!schema.includes('data_entry_id TEXT'))fail.push('schema does not expose creation fencing');
console.log(`Adversarial Hardening 10.39.0: ${fail.length?'FAIL':'PASS'} (idempotency, crash-retry fencing, step-up, injection, bypass controls)`);
if(fail.length){for(const x of fail)console.error(` - ${x}`);process.exit(1)}
