import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const fail=m=>{console.error(`Data Studio 10.70.0 gate: FAIL — ${m}`);process.exit(1)};
const version=read('VERSION').trim();
if(version!=='11.02.0' && version!=='11.03.0' && version!=='11.04.0' && version!=='11.04.1' && version!=='11.05.0' && version!=='11.05.1' && version!=='11.06.0' && version!=='11.07.0' && version!=='11.08.0' && version!=='11.08.1' && version!=='10.70.0' && !version.startsWith('10.71.') && !version.startsWith('10.72.') && !version.startsWith('10.73.') && !version.startsWith('10.74.') && !version.startsWith('10.75.') && !version.startsWith('10.76.') && !version.startsWith('10.77.') && !version.startsWith('10.78.') && !version.startsWith('10.79.') && !version.startsWith('10.80.') && !version.startsWith('10.81.') && !version.startsWith('10.82.') && !version.startsWith('10.83.') && !version.startsWith('10.85.') && !version.startsWith('10.86.') && !version.startsWith('10.87.') && !version.startsWith('10.88.') && !version.startsWith('10.89.') && !version.startsWith('10.90.') && !version.startsWith('10.91.') && !version.startsWith('12.') && !version.startsWith('13.') && !version.startsWith('14.') && !version.startsWith('15.') && !version.startsWith('16.'))fail(`VERSION is ${version}`);
const pkg=JSON.parse(read('package.json'));if(pkg.version!==version)fail('package version mismatch');
const studio=read('public/assets/js/frontend/admin/data-studio.js');
const catalog=read('public/assets/js/frontend/admin/data-catalog.js');
const control=read('public/assets/js/frontend/admin/data-governance.js');
const factory=read('public/assets/js/frontend/admin/product-publisher.js');
const routes=read('src/worker/modules/admin-control/admin-build-data.routes.js');
const service=read('src/worker/security/platform-data-studio.service.js');
const css=read('public/assets/css/admin.css');
for(const [needle,src] of [
 ['dataStudioPickerSearch',studio],['CHANGE RECORD',studio],['/api/platform/admin/data-control/search',studio],['OPEN IN STUDIO',studio],
 ['Validate the change before saving',studio],['DATA_STUDIO_STALE_RECORD',service],['/api/platform/admin/data-studio/record',routes],
 ['OPEN IN DATA STUDIO',catalog],['dataStudioReturnView',catalog],['data-dc-studio',control],['show(\'data-catalog\')',control],
 ['OPEN DATA STUDIO',factory],['data-studio-picker-grid',css]
]) if(!src.includes(needle))fail(`missing ${needle}`);
if(/data-dc-catalog[^\n]*show\('data-studio'\)/.test(control))fail('Data Control CATALOG handoff still opens Data Studio');
if(/if\(!type\|\|!id\)\{[^}]*Select a canonical record/.test(studio) && !studio.includes('dataStudioPickerSearch'))fail('Studio still has empty-only entry state');
console.log('Data Studio 10.70.0 convergence gate: PASS');
