import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8');
const version=read('VERSION').trim();
const versionAtLeast=(actual,minimum)=>{const a=String(actual).split('.').map(Number),b=String(minimum).split('.').map(Number);if(a.length!==3||b.length!==3||!a.every(Number.isInteger)||!b.every(Number.isInteger))return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return true;};
assert.ok(versionAtLeast(version, '10.81.0'),`VERSION is ${version}`);
const runtime=read('public/assets/js/frontend/admin/admin-runtime.js');
assert(runtime.includes('isAuthorityUnavailable'),'admin runtime missing canonical authority detector');
assert(runtime.includes('renderAuthorityUnavailable'),'admin runtime missing canonical unavailable renderer');
assert(runtime.includes('No empty or default state has been inferred'),'UI must explicitly distinguish unavailable from empty');
const css=read('public/assets/css/admin-control.css');
assert(css.includes('.authority-unavailable-state'),'canonical authority state CSS missing');
for(const file of [
 'public/assets/js/frontend/admin/monitor.js',
 'public/assets/js/frontend/admin/oversight/platform-governance.js',
 'public/assets/js/frontend/admin/oversight/product-studio.js'
]){
 const s=read(file);assert(s.includes('isAuthorityUnavailable'),`${file}: missing authority failure handling`);assert(s.includes('renderAuthorityUnavailable'),`${file}: missing canonical unavailable UI`);assert(!s.includes('10.80.0'),`${file}: stale asset version`);
}
const governance=read('src/worker/security/control-plane-governance.service.js');
assert(governance.includes("canonicalFirst")&&governance.includes("canonicalAll")&&governance.includes("authorityUnavailable"),'Control Plane Governance must use canonical DB failure boundary');
assert(governance.includes("platform.control_plane_governance_projection"),'Governance projection writes must have explicit authority identity');
console.log('10.81.0 Canonical DB Failure + UI State gate: PASS');
