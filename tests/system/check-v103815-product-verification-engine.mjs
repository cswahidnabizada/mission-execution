import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const migration=read('database/migrations/0088_product_verification_engine.sql');
const service=read('src/worker/modules/admin-control/product-verification-engine.service.js');
const routes=read('src/worker/modules/admin-control/admin-control.routes.js');
const admin=read('public/assets/js/frontend/admin/admin.js');
const pkg=JSON.parse(read('package.json'));
assert(/^10\.38\.(15|16|17|18|19|20|21|22|23|24|25|26|27|28|29)$|^10\.39\.(0|1)$|^10\.40\.(0|1)$/.test(read('VERSION').trim()),'VERSION must remain at or above the 10.38.15 verification baseline');
assert(/^10\.38\.(15|16|17|18|19|20|21|22|23|24|25|26|27|28|29)$|^10\.39\.(0|1)$|^10\.40\.(0|1)$/.test(pkg.version),'package version must remain at or above the 10.38.15 verification baseline');
for(const t of ['platform_product_verification_runs','platform_product_verification_steps','idempotency_key','launch_version','journey_count','result_json'])assert(migration.includes(t),`Verification schema missing ${t}`);
for(const t of ['PRODUCT_VERIFICATION_ENGINE_VERSION','PRODUCT_VERIFICATION_JOURNEYS','runProductVerification','getProductVerificationRun','listProductVerificationRuns','productVerificationSummary'])assert(service.includes(t),`Verification engine primitive missing ${t}`);
for(const t of ['registration','authentication','organization_onboarding','verification_trust','subscription','billing','people_executor','mission_creation','assignment','custody_transition','tracking_evidence','mission_completion'])assert(service.includes(`code:'${t}'`),`Journey contract missing ${t}`);
assert(!service.includes('canonical product truth authority')&&!service.includes('becomes the truth authority'),'Verification engine must not introduce a Truth authority');
assert(service.includes("ACTION_CODES")&&service.includes("ACTION_SERVICE_MAP"),'Verification must consume canonical action registry and service map');
assert(service.includes("from '.././action-registry.js'"),'Verification engine action-registry import must resolve from modules/admin-control');
assert(service.includes("from '.././action-service-map.js'"),'Verification engine action-service-map import must resolve from modules/admin-control');
assert(service.includes("from '../../security/product-launch-readiness.service.js'"),'Verification engine readiness import must resolve from modules/admin-control');
assert(service.includes("from '../../security/country-product-launch.service.js'"),'Verification engine country-launch import must resolve from modules/admin-control');
for(const rel of ['.././action-registry.js','.././action-service-map.js','../../security/product-launch-readiness.service.js','../../security/country-product-launch.service.js']){
  assert(fs.existsSync(path.resolve(root,'src/worker/modules/admin-control',rel)),`Verification engine dependency missing: ${rel}`);
}

assert(routes.includes('/api/platform/admin/product-verification/contracts'),'Verification contracts route missing');
assert(routes.includes('/api/platform/admin/product-verification/runs'),'Verification run route missing');
assert(routes.includes('requirePlatformSuperAdminStepUp'),'Product verification mutation must require backend step-up');
assert(routes.includes('beginPlatformAdminOperation'),'Verification must use administrative operation journal');
assert(routes.includes('expectedActiveLaunchId')&&routes.includes('expectedActiveVersion'),'Verification must fence against launch changes');
assert(admin.includes('Product Verification'),'Admin UI must expose Product Verification');
assert(admin.includes('/api/platform/admin/product-verification/runs'),'Admin UI must call Product Verification API');
console.log('10.38.15 Product Verification Engine: PASS');
