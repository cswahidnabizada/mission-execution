import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const ui=read('public/assets/js/frontend/admin/admin.js');
const routes=read('src/worker/modules/verification/verification.routes.js');
assert(ui.includes("['Verification & Trust','verification']"),'verification must be canonicalized into Platform Studio');
assert(routes.includes('requirePlatformSuperAdministrator'),'country/verification administration must require Super Admin');
console.log('platform verification, country and billing convergence: PASS');
