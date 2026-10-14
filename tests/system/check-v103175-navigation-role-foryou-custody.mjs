import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const ui=read('public/assets/js/frontend/admin/admin.js');
assert(ui.includes("['Verification & Trust','verification']"),'verification navigation must be canonical');
assert(!ui.includes('platform-review'),'legacy reviewer navigation must be removed');
console.log('navigation and verification authority convergence: PASS');
