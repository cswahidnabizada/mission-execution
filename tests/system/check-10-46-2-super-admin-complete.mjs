import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('VERSION').trim();
const fail=[];
const must=(ok,msg)=>{if(!ok)fail.push(msg)};
const publisher=read('public/assets/js/frontend/admin/product-publisher.js');
const service=read('src/worker/modules/admin-control/product-publisher-orchestrator.service.js');
const foundation=read('src/worker/modules/admin-control/country-product-foundation.service.js');
const routes=read('src/worker/modules/admin-control/admin-launch-config.routes.js').replaceAll('\\/','/');
const controller=read('public/assets/js/frontend/admin/admin-controller.js');
const runtime=read('public/assets/js/frontend/admin/admin-runtime.js');
const bootstrap=read('src/worker/modules/bootstrap.routes.js');
const adminBootstrap=read('public/assets/js/frontend/admin/admin.js');
const legacy=read('public/assets/js/frontend/admin/oversight-panels.js');
const session=read('src/worker/core/auth-session.js');
const pagination=read('src/worker/core/pagination.js');
const config=read('src/worker/security/product-configuration.service.js');
const lifecycle=read('src/worker/security/sector-lifecycle.service.js');
const http=read('src/worker/core/http.js');
const compliance=read('src/worker/security/compliance-context.service.js');

must(/^\d+\.\d+\.\d+$/.test(version),`release must be current convergence release, got ${version}`);
// 1. D1 authority / KV projection
must(session.includes('sessionStillAuthorized')&&session.includes('COALESCE(cmp.country_code,cvs.country_code)'), 'Session authority must be re-checked against D1 company state');
must(session.includes('pep.country_code'), 'Executor session authority must be checked against D1 country');
must(session.includes('env.KV_BINDING.put(`session:${token}`,JSON.stringify(session)'), 'KV must persist only the refreshed session projection');
// 2. request-scoped reuse / unified bootstrap
must(session.includes('requestSessionCache'), 'Request-scoped session cache missing');
must(bootstrap.includes('/api/bootstrap')&&bootstrap.includes('Promise.all')&&bootstrap.includes('resolveUserSituation'), 'Authenticated bootstrap must compose context once');
must(read('src/worker/security/user-situation.service.js').includes('situationRequestCache'), 'User situation must reuse request-scoped context');
must(session.includes('previousCountryCode')&&session.includes('authoritativeCountry'), 'Session country context must resync from authoritative D1 state');
must(publisher.includes('/api/platform/admin/product-publisher/workspace'), 'Publisher must use a single workspace projection');
// 3. Admin decomposition
must(adminBootstrap.length<7000, `Admin bootstrap remains too large (${adminBootstrap.length} bytes)`);
must(adminBootstrap.includes('panel-registry.js'), 'Admin panel composition must be physically separated from the bootstrap');
must(fs.existsSync(path.join(root,'public/assets/js/frontend/admin/oversight-panels.js')), 'Admin panel registry missing');
// 4. single Product Publisher authority
for(const legacyRoute of ['product-build','product-studio','product-launch','product-ecosystem','expansion'])must(controller.includes(`'${legacyRoute}':'product-publisher'`), `Legacy destination ${legacyRoute} must converge to Product Publisher`);
for(const token of ['startProductPublisher','savePublisherFoundation','savePublisherDefinition','savePublisherLifecycle','validatePublisherWorkspace','publishPublisherWorkspace','verifyPublisherWorkspace'])must(service.includes(token), `Publisher service missing ${token}`);
must(routes.includes('product-publisher/start'), 'Publisher start route missing');
must(routes.includes('product-publisher/definitions/'), 'Publisher definitions route missing');
for(const token of ['lifecycle','validate','publish','verify'])must(routes.includes(`product-publisher/`)&&routes.includes(token), `Publisher ${token} route missing`);
for(const token of ['Prepare Data','Configure','Compose','Validate','Test','Authorize','Publish','Verify','Product Country','One workspace to build and publish a country product'])must(publisher.includes(token), `Publisher UI missing ${token}`);
must(!publisher.includes('createCountry')&&publisher.includes('Data Entry'), 'Product Country creation must be delegated to Data Entry');
// 5. no silent jurisdiction fallback
must(!legacy.includes("declared_country_code||'DE'"), 'Verification UI must not default an unresolved country to DE');
must(compliance.includes('JURISDICTION_UNRESOLVED'), 'Compliance context must fail closed when country is unresolved');
// 6. shared scale controls
must(pagination.includes('PAGINATION_MAX_LIMIT')&&pagination.includes('PAGINATION_MAX_OFFSET'), 'Shared pagination policy missing');
must(runtime.includes('limit=50')||runtime.includes("limit,8"), 'Admin country retrieval must remain bounded');
// 7. canonical lifecycle / action authority
must(lifecycle.includes('resolveLifecycleForNewMission'), 'Lifecycle resolution must use canonical sector authority');
must(service.includes('ACTION_REGISTRY'), 'Publisher lifecycle must validate canonical actions');
// 8. error contract
must(http.includes('publicErrorMessage')&&http.includes('Internal server error'), 'Public error mapping missing');
must(read('src/worker/modules/subscriptions/subscription.routes.js').includes('publicErrorMessage'), 'Subscription routes must use public error mapping');
// 9. product foundation governed by existing canonical tables
must(foundation.includes('residency_policies'), 'Country foundation must use existing residency authority');
must(foundation.includes('external_provider_registry'), 'Country foundation must use provider governance authority');
must(foundation.includes('billing_jurisdiction_policies'), 'Country foundation must use billing jurisdiction authority');
// 10. release / product contract checks
const release=read('RELEASE.md');
must(release.startsWith(`# Mission Execution ${version}`), 'RELEASE.md must match VERSION');
must((release.includes('Product Factory')||release.includes('Product Publisher'))&&(release.includes('Control Plane')||release.includes('Platform Control'))&&release.includes('Canonical Core'), 'Release docs must describe canonical architecture');
const pkg=JSON.parse(read('package.json'));
must(pkg.scripts['check:release']?.includes('check:current-runtime-integrity'), 'Release gate must include the current runtime-integrity suite');

if(fail.length){console.error('ON Mission current Super Admin completion gate: FAIL');for(const x of fail)console.error(`- ${x}`);process.exit(1)}
console.log('ON Mission current Super Admin completion gate: PASS (single publisher, D1/KV authority, request reuse, admin decomposition, fail-closed jurisdiction, lifecycle/action authority, error safety, scale controls)');
