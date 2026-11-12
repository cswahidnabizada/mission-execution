import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ui=read('public/assets/js/frontend/admin/market-factory.js');
const css=read('public/assets/css/frontend/admin.css');
const routes=read('src/worker/modules/admin-control/admin-build-data.routes.js');
const relationship=read('src/worker/security/platform-resource-relationship.service.js');
const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));
const manifest=JSON.parse(read('RELEASE-MANIFEST.json'));
assert.equal(read('VERSION').trim(),'16.114.0');
assert.equal(pkg.version,'16.114.0');
assert.equal(lock.version,'16.114.0');
assert.equal(lock.packages[''].version,'16.114.0');
assert.equal(manifest.version,'16.114.0');

// One stage navigator controls both package forms and canonical task filtering.
assert.match(ui,/ONE MARKET · ONE WORKSPACE · NINE JOURNEYS/);
assert.match(ui,/data-mf-config-tab="\$\{stage\.key\}" data-mf-stage="\$\{stage\.key\}"/);
assert.match(ui,/const stageButtons=\[\.\.\.box\.querySelectorAll\('\[data-mf-stage\]'\)\]/);
assert.match(ui,/for\(const panel of box\.querySelectorAll\('\[data-mf-config-panel\]'\)\)panel\.hidden=panel\.dataset\.mfConfigPanel!==activeStage/);
assert.doesNotMatch(ui,/class="mf-guided-step-list"/);
assert.match(ui,/searchParams\.set\('marketId'/);
assert.match(ui,/searchParams\.set\('marketStage'/);
assert.match(ui,/searchParams\.get\('marketStage'/);

// All canonical market work stays inside the selected market workspace; legacy editors are secondary.
assert.match(ui,/ADVANCED · LEGACY STRUCTURED PACKAGE EDITOR/);
assert.match(ui,/ADVANCED · EDIT RAW PACKAGE JSON/);
assert.match(ui,/RELEASE HISTORY · IMMUTABLE MARKET VERSIONS/);
assert.match(ui,/mf-market-resource-relationship-readback/);
assert.match(ui,/resource-relationships\?resourceType=/);
assert.match(ui,/linked market dependencies/);

// Dependency impact is read from the relationship authority; unknown read-back is never treated as zero impact.
assert.match(ui,/impact\?\.readBack/);
assert.match(ui,/impact read-back unavailable/);
assert.match(ui,/resource-search\?q=/);

// The relationship authority remains canonical and audited.
assert.match(relationship,/'market_package'/);
assert.match(relationship,/prepareCriticalAudit/);
assert.match(relationship,/completeCriticalAudit/);
assert.match(routes,/resource-relationships\/preview/);
assert.match(routes,/resource-relationships\/commit/);
assert.match(routes,/requirePlatformSuperAdminStepUp/);

// Publication, activation and onboarding remain separate governed actions.
assert.match(ui,/ensureStepUp\(`POST:\/api\/platform\/admin\/market-factory\/\$\{[^}]+\}\/status`\)/);
assert.match(ui,/Open customer onboarding for this already-live market/);
assert.match(ui,/PUBLISH/);
assert.match(ui,/ACTIVATE/);

// Responsive single navigator and release checks are part of the shipped artifact.
assert.match(css,/\.mf-stage-config-nav/);
assert.match(css,/\.mf-stage-config-tab\[aria-pressed="true"\]/);
assert.match(css,/@media\(max-width:560px\)/);
assert.match(pkg.scripts['check:release'],/check-16-97-0-unified-market-operations-certification\.mjs/);
assert.match(read('RELEASE.md'),/16\.100\.0 — Market Launch Workbench Runtime Repair/);
console.log('16.99.0 unified market operations and certification contract: PASS');
