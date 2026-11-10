import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const registry=read('public/assets/js/frontend/admin/workspace-registry.js');
const shell=read('public/assets/js/frontend/admin/shell.js');
const controller=read('public/assets/js/frontend/admin/admin-controller.js');
const command=read('public/assets/js/frontend/admin/command-center.js');
const market=read('public/assets/js/frontend/admin/market-factory.js');
const routes=read('src/worker/modules/admin-control/admin-build-data.routes.js');
const relationship=read('src/worker/security/platform-resource-relationship.service.js');
const marketService=read('src/worker/security/market-factory.service.js');
const panelRegistry=read('public/assets/js/frontend/admin/panel-registry.js');
const legacySurfaces=['public/assets/js/frontend/admin/surfaces/build.js','public/assets/js/frontend/admin/surfaces/governance.js','public/assets/js/frontend/admin/surfaces/monitor.js'].map(read).join('\\n');
const model=read('public/assets/js/frontend/admin/control-plane-model.js');
const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));
const manifest=JSON.parse(read('RELEASE-MANIFEST.json'));
assert.equal(read('VERSION').trim(),'16.99.0');
assert.equal(pkg.version,'16.99.0');
assert.equal(lock.version,'16.99.0');
assert.equal(lock.packages[''].version,'16.99.0');
assert.equal(manifest.version,'16.99.0');

// Six primary human-facing areas; every market operation has one canonical entry.
const groupBlock=registry.match(/export const ADMIN_WORKSPACE_GROUPS=Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1]||'';
const keys=[...groupBlock.matchAll(/\{key:'([^']+)'/g)].map(x=>x[1]);
assert.deepEqual(keys,['command','markets','platform','customers','ai','security']);
const marketGroup=groupBlock.match(/\{key:'markets',[\s\S]*?items:\[([\s\S]*?)\]\}/)?.[1]||'';
assert.match(marketGroup,/\['Market Operations','product-publisher'/);
assert.equal((marketGroup.match(/\['/g)||[]).length,1);
for(const legacy of ['countries','release-center','launch-center','product-health','product-verification','certification','product-dependency-impact']) {
  assert.match(registry,new RegExp(`'${legacy}':'product-publisher'`));
  assert.match(controller,new RegExp(`'${legacy}':'product-publisher'`));
}

// No duplicated Market Launch shortcut or second workspace directory remains in the shell or Command Center.
assert.doesNotMatch(shell,/data-quick-studio|sa-quick-studio|Market Launch Studio/);
assert.match(shell,/workspaceGroups\.map\(renderPrimary\)/);
assert.doesNotMatch(command,/control-plane-home|control-explorer|release-card|controlPlaneAreaGrid|market_launch/);
for(const retired of ["'release-center':","'launch-center':","'product-dependency-impact':"])assert.ok(!panelRegistry.includes(retired),`duplicate market panel remains routed: ${retired}`);
for(const retired of ["'product-verification':","'product-health':",'countries:'])assert.ok(!legacySurfaces.includes(retired),`duplicate market surface remains routed: ${retired}`);
assert.match(command,/Market preparation and launch objectives belong in the single Market Operations workspace/);
assert.match(command,/OPEN MARKET OPERATIONS/);

// Market workspace provides the nine-stage journey and a market-scoped operations panel.
assert.match(market,/ONE MARKET · ONE WORKSPACE · NINE JOURNEYS/);
assert.match(market,/mfMarketOperationsHealth/);
assert.match(market,/operations-health/);
assert.match(market,/MARKET OPERATIONS · LIVE CANONICAL SOURCES/);
assert.match(market,/market-scoped operational evidence/);
assert.doesNotMatch(market,/Market telemetry pending|Market-scoped counts unavailable|Integration telemetry pending/);

// The operational endpoint is read-only, market-scoped and source-truthful.
assert.match(routes,/operations-health/);
assert.match(routes,/requirePlatformAdministrator\(request,env\)/);
assert.match(routes,/getProductHealth\(env,\{countryCode,sectorCode:code\}\)/);
assert.match(routes,/company_management_profiles/);
assert.match(routes,/sectorCodes\.map/);
assert.match(routes,/IN \(\$\{sectorMarks\}\)/);
assert.match(routes,/auth_identities/);
assert.match(routes,/FROM missions m/);
assert.match(routes,/external_provider_policies/);
assert.match(routes,/status:'UNAVAILABLE'/);
assert.match(routes,/not a connectivity test/);
assert.doesNotMatch(routes,/requirePlatformSuperAdminStepUp\(request,env\).*operations-health/);

// End-to-end launch path is represented by canonical routes and separately gated transitions.
for(const route of ['/api/platform/admin/market-factory/import','/resource-relationships/preview','/resource-relationships/commit','/workbench$/','/certification$/','/validate$/','/authorize$/','/publish$/','/recover-publication$/','/verify$/','/activate$/']) {
  assert.ok(routes.includes(route),`missing market acceptance route contract: ${route}`);
}
for(const stage of ['definition','resources','product','policy','providers','onboarding','operations','certification','activation']) {
  assert.ok(market.includes(`key:'${stage}'`),`missing canonical market stage ${stage}`);
}
assert.match(routes,/requirePlatformSuperAdminStepUp\(request,env\).*validate/);
assert.match(routes,/requirePlatformSuperAdminStepUp\(request,env\).*authorize/);
assert.match(routes,/requirePlatformSuperAdminStepUp\(request,env\).*publish/);
assert.match(routes,/requirePlatformSuperAdminStepUp\(request,env\).*verify/);
assert.match(routes,/requirePlatformSuperAdminStepUp\(request,env\).*activate/);
assert.match(routes,/recoverMarketPublication/);
assert.match(marketService,/read-after-write verification|read-after-write/i);
assert.match(routes,/publicationAttempted:false/);
assert.match(routes,/activationAttempted:false/);
assert.match(routes,/onboardingOpened:false/);

// The six-area command model matches the registry and retains searchable routing.
assert.equal((model.match(/\{key:'/g)||[]).length,6);
assert.match(model,/label:'Markets'/);
assert.match(model,/action:'product-publisher'/);
assert.match(pkg.scripts['check:release'],/check-16-98-0-unified-super-admin-market-acceptance\.mjs/);
assert.match(read('RELEASE.md'),/16\.99\.0 — Unified Super Admin & Market Operations/);
console.log('16.99.0 unified Super Admin navigation and market operations acceptance contract: PASS');
