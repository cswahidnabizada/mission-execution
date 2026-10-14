import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const must=[
 'src/worker/security/country-product-launch.service.js',
 'src/worker/modules/product-availability.routes.js',
 'database/migrations/0084_country_product_launch_governance.sql',
 'public/assets/js/frontend/admin/admin.js'
];
for(const f of must) if(!fs.existsSync(path.join(root,f))) throw new Error(`missing ${f}`);
const service=fs.readFileSync(path.join(root,must[0]),'utf8');
const routes=fs.readFileSync(path.join(root,'src/worker/modules/admin-control/admin-control.routes.js'),'utf8');
const onboarding=fs.readFileSync(path.join(root,'src/worker/modules/onboarding/onboarding.service.js'),'utf8');
const landing=fs.readFileSync(path.join(root,'public/assets/js/pages/landing.js'),'utf8');
for(const token of ['validateCountryProductLaunch','activateCountryProductLaunch','evaluateCountryEligibility','COUNTRY_NOT_LAUNCHED']) if(!service.includes(token)) throw new Error(`country launch contract missing: ${token}`);
for(const token of ['/api/platform/admin/country-product-launches/drafts','/validate','/activate']) if(!routes.includes(token)) throw new Error(`admin launch route missing: ${token}`);
if(!onboarding.includes('evaluateCountryEligibility')) throw new Error('organization onboarding is not launch-gated');
if(!landing.includes('/api/product/availability')) throw new Error('landing availability gate missing');
const migration=fs.readFileSync(path.join(root,'database/migrations/0084_country_product_launch_governance.sql'),'utf8');
for(const token of ['country_product_launches','country_product_launch_change_requests']) if(!migration.includes(`CREATE TABLE IF NOT EXISTS ${token}`)) throw new Error(`migration table missing: ${token}`);
console.log('10.37.10 country product launch gate: PASS');
