import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const routes=read('src/worker/modules/verification/verification.routes.js');
assert(routes.includes('/api/platform/policy/countries'),'canonical country policy endpoint missing');
assert(routes.includes('requirePlatformSuperAdministrator'),'country policy must require Super Admin');
console.log('dynamic country policy authority convergence: PASS');
