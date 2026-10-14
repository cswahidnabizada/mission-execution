import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();const read=p=>fs.readFileSync(path.join(root,p),'utf8');const fail=[];
const entry=read('src/worker/security/platform-data-entry.service.js');
const control=read('src/worker/security/platform-data-control.service.js');
const trash=read('src/worker/security/platform-trash.service.js');
const ui=read('public/assets/js/frontend/admin/admin.js');
for(const t of ['canonicalResourceType','lifecycle','Data Control','Trash'])if(!entry.includes(t))fail.push(`entry lifecycle contract missing ${t}`);
if(!control.includes("resourceType:'data_entry'"))fail.push('Data Control entry trace missing');
if(!control.includes('canonical_resource_id'))fail.push('Data Control canonical linkage missing');
if(!trash.includes('syncEntryLifecycle'))fail.push('Trash entry lifecycle sync missing');
for(const t of ["['Product Ecosystem','product-ecosystem']","['Data Entry','data-entry']","['Trash & Cleanup','trash']","['Data Control','data-control']"])if(!ui.includes(t))fail.push(`admin lifecycle navigation missing ${t}`);
console.log(`Journey Convergence 10.39.0: ${fail.length?'FAIL':'PASS'} (ENTRY → TRUTH → DECISION → CREATION → RUNTIME → CONTROL → TRASH)`);
if(fail.length){for(const x of fail)console.error(` - ${x}`);process.exit(1)}
