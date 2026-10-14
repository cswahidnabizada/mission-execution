import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const ui=read('public/assets/js/frontend/admin/admin.js');
const routes=read('src/worker/modules/verification/verification.routes.js');
assert(ui.includes("['Verification & Trust','verification']"),'verification must be inside the canonical Super Admin Studio');
assert(ui.includes('/api/platform/verifications/pending'),'verification queue must use canonical platform API');
assert(routes.includes('requirePlatformSuperAdministrator'),'verification workflow must require Super Admin');
console.log('canonical platform verification activation workflow: PASS');
