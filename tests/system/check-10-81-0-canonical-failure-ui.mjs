import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8');
const version=read('VERSION').trim();
assert.ok(['10.81.0','10.82.0','10.83.0','10.85.1','10.85.2','10.87.0','10.88.0','10.89.0','10.90.0','10.91.0','10.92.0','10.93.0','10.94.0','10.95.0','10.97.0','11.02.0','11.03.0','11.04.0','11.04.1','11.05.0','11.05.1','11.06.0','11.07.0','11.08.0','11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10'].includes(version),`VERSION is ${version}`);
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
