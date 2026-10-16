import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync('public/assets/css/frontend/canonical-layout.css','utf8');
const htmlFiles=['public/platform/access/admin/index.html','public/app/index.html','public/index.html','public/foryou/index.html','public/role-workspace.html','public/missions.html','public/subscription.html','public/verification.html','public/driver/dashboard.html','public/my-driver/index.html','public/driver/index.html'];
for(const file of htmlFiles){
 const html=fs.readFileSync(file,'utf8');
 if(/frontend\/(tokens|foundation|components|layout|admin)\.css|admin-control\.css/.test(html)) assert.match(html,/canonical-layout\.css\?v=16\.10\.44/,`${file} must load the canonical layout after its component styles`);
}
assert.match(css,/--om-layout-gap:/,'shared spacing token exists');
assert.match(css,/\.marketplace-workspace[\s\S]*\.product-factory-workspace[\s\S]*\.publisher-workspace/,'market and release workspaces share layout contract');
assert.match(css,/repeat\(auto-fit, minmax\(min\(100%, 17rem\), 1fr\)\)/,'market grids adapt without fixed narrow columns');
assert.match(css,/overflow-wrap: anywhere/,'long IDs and unbroken text cannot force intrinsic overflow');
assert.match(css,/@media \(max-width: 900px\)/,'tablet responsive contract exists');
assert.match(css,/@media \(max-width: 560px\)/,'mobile responsive contract exists');
assert.doesNotMatch(css,/\.marketplace-workspace[^}]*position:\s*fixed/,'market layout must not introduce fixed overlay behavior');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.match(pkg.scripts['check:release'],/check-16-10-38-platform-layout-convergence\.mjs/,'platform layout regression must be in release gate');
console.log('16.10.39 platform-wide layout convergence: PASS');
