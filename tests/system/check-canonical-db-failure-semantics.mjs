import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const failures=[];
const expectFile=(file,patterns)=>{
  const text=read(file);
  for(const [pattern,message] of patterns)if(pattern.test(text))failures.push(`${file}: ${message}`);
};

const helper=read('src/worker/core/canonical-db.js');
if(!helper.includes("error.code='AUTHORITY_UNAVAILABLE'"))failures.push('canonical DB helper must emit AUTHORITY_UNAVAILABLE');
if(!helper.includes('status=503'))failures.push('canonical DB helper must emit HTTP 503');
if(!helper.includes('canonicalFirst')||!helper.includes('canonicalAll')||!helper.includes('canonicalRun'))failures.push('canonical DB helper must expose first/all/run authorities');

expectFile('src/worker/security/company-context.service.js',[
  [/\.catch\(\(\)=>null\)/,'canonical company context retains silent null fallback'],
  [/\.catch\(\(\)=>\(\{results:\[\]\}\)\)/,'canonical company roles retain silent empty fallback']
]);
expectFile('src/worker/security/compliance-context.service.js',[
  [/\.catch\(\(\)=>null\)/,'canonical compliance context retains silent null fallback'],
  [/\.catch\(\(\)=>\(\{results:\[\]\}\)\)/,'canonical compliance policy reads retain silent empty fallback']
]);
expectFile('src/worker/security/product-ecosystem.service.js',[
  [/getProductStudio\([^\n]+\.catch\(/,'product studio failure is silently degraded'],
  [/getProductHealth\([^\n]+\.catch\(/,'product health failure is silently degraded'],
  [/listExpansionCases\([^\n]+\.catch\(/,'product expansion failure is silently degraded'],
  [/\.catch\(\(\)=>null\)/,'product ecosystem retains silent null fallback'],
  [/\.catch\(\(\)=>\(\{results:\[\]\}\)\)/,'product ecosystem retains silent empty fallback']
]);
expectFile('src/worker/security/user-situation.service.js',[
  [/resolveProductConfiguration\(env\)\.catch\(/,'canonical product configuration failure is silently degraded'],
  [/listEntitlements\([^\n]+\.catch\(/,'canonical entitlement failure is silently degraded'],
  [/resolveCanonicalComplianceContext\([^\n]+\.catch\(/,'canonical compliance failure is silently degraded']
]);
expectFile('src/worker/security/product-manifest-runtime.service.js',[
  [/getCountryProductLaunch\([^\n]+\.catch\(/,'runtime launch authority failure is silently degraded'],
  [/company_management_profiles[^\n]+\.catch\(/,'runtime company context failure is silently degraded']
]);
expectFile('src/worker/security/platform-data-control.service.js',[
  [/\.catch\(\(\)=>null\)/,'platform data control retains silent null fallback'],
  [/\.catch\(\(\)=>\(\{results:\[\]\}\)\)/,'platform data control retains silent empty fallback']
]);
expectFile('src/worker/security/product-definition.service.js',[
  [/getProductStudio\([^\n]+\.catch\(/,'product compiler context failure is silently degraded']
]);


const wave2Checks=[
  ['src/worker/security/activation-review.service.js',[[/\.first\(\)\.catch\(\(\)=>null\)/,'activation review retains silent null DB fallback']]],
  ['src/worker/security/user-classification.core.js',[[/\.catch\(\(\)=>null\)/,'user classification retains silent null DB fallback']]],
  ['src/worker/security/user-situation.service.js',[[/verification_checks[^\n]+\.catch\(/,'verification checks retain silent empty fallback']]],
  ['src/worker/security/operational-gate.service.js',[[/getCountryProductLaunch\([^\n]+\.catch\(/,'operational gate silently degrades launch authority']]],
  ['src/worker/security/user-access.service.js',[[/driver_operational_profiles[^\n]+\.catch\(/,'user access silently degrades canonical actor state']]],
  ['src/worker/security/activation.service.js',[[/listOpenActivationRequests\([^\n]+\.catch\(/,'activation silently degrades review state'],[/reconcileActivationReviewRequests\([^\n]+\.catch\(/,'activation reconciliation silently degrades canonical review state']]],
  ['src/worker/security/product-configuration.service.js',[[/getActivePlatformConfiguration\([^\n]+\.catch\(/,'product configuration silently degrades canonical configuration']]],
  ['src/worker/security/product-health.service.js',[[/platform_product_definition_components[^\n]+\.catch\(/,'product health silently degrades canonical components']]],
  ['src/worker/security/country-product-launch.service.js',[[/country_product_launch_change_requests[^\n]+\.catch\(/,'launch retirement silently degrades canonical state']]],
  ['src/worker/security/product-expansion.service.js',[[/getProductPreparationWorkspace\([^\n]+\.catch\(/,'expansion workspace silently degrades canonical state'],[/getProductDependencyGraph\([^\n]+\.catch\(/,'expansion dependency graph silently degrades canonical state']]],
  ['src/worker/modules/product-context.routes.js',[[/getCountryProductLaunch\([^\n]+\.catch\(/,'product context silently degrades launch authority']]]
];
for(const [file,patterns] of wave2Checks)expectFile(file,patterns);


const wave3Checks=[
  ['src/worker/modules/admin-control/command-center.service.js',[[/\.catch\(\(\)=>/,'command center retains silent failure fallback'],[/productVerificationSummary\([^\n]+\)\.catch\(/,'command center silently degrades verification authority']]],
  ['src/worker/modules/admin-control/system-health.service.js',[[/getPlatformCommandCenter\([^\n]+\)\.catch\(/,'system health silently degrades command center'],[/getEndToEndCertification\([^\n]+\)\.catch\(/,'system health silently degrades certification'],[/admin_control_audit_events[^\n]+\.catch\(/,'system health silently degrades audit authority']]],
  ['src/worker/modules/admin-control/company-admin.service.js',[[/sector_policies[^\n]+\.catch\(/,'company admin silently degrades sector policy'],[/jurisdiction_policies[^\n]+\.catch\(/,'company admin silently degrades jurisdiction policy'],[/organization_compliance_policies[^\n]+\.catch\(/,'company admin silently degrades compliance policy'],[/country_catalog[^\n]+\.catch\(/,'company admin silently degrades country authority']]],
  ['src/worker/modules/privacy/privacy.service.js',[[/privacy_requests[^\n]+\.catch\(/,'privacy silently degrades request authority'],[/verification_checks[^\n]+\.catch\(/,'privacy silently degrades verification authority'],[/drivers[^\n]+\.catch\(/,'privacy silently degrades driver authority'],[/auth_identities[^\n]+\.catch\(/,'privacy silently degrades identity authority']]],
  ['src/worker/modules/missions/missions.service.js',[[/mission_custody_cases[^\n]+\.catch\(/,'mission custody authority silently degrades to empty']]],
  ['src/worker/modules/admin-control/product-verification-engine.service.js',[[/evaluateProductLaunchReadiness\([^\n]+\)\.catch\(/,'product verification silently degrades readiness authority'],[/platform_product_verification_steps[^\n]+\.catch\(/,'verification evidence write silently degrades'],[/platform_product_preparation_tasks[^\n]+\.catch\(/,'verification preparation evidence write silently degrades'],[/platform_product_verification_runs[^\n]+\.catch\(/,'verification failure evidence write silently degrades']]]
];
for(const [file,patterns] of wave3Checks)expectFile(file,patterns);

if(failures.length){console.error('Canonical DB failure semantics: FAIL');for(const f of failures)console.error('- '+f);process.exit(1);}
console.log(`Canonical DB failure semantics: PASS (${read('VERSION').trim()})`);
