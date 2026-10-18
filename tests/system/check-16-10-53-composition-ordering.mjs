import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolvePageComponents,renderPage,STUDIO_RENDERER_VERSION} from '../../public/assets/js/frontend/admin/layout-studio-renderer.js';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('RELEASE-MANIFEST.json','utf8'));
const studio=fs.readFileSync('public/assets/js/frontend/admin/layout-studio.js','utf8');
const routes=fs.readFileSync('src/worker/modules/admin-control/layout-studio.routes.js','utf8');
assert.ok(pkg.version.localeCompare('16.10.53', undefined, {numeric:true})>=0);
assert.equal(lock.version,pkg.version); assert.equal(lock.packages[''].version,pkg.version);
assert.equal(fs.readFileSync('VERSION','utf8').trim(),pkg.version);
assert.equal(manifest.version,pkg.version); assert.ok(manifest.base);
assert.equal(STUDIO_RENDERER_VERSION,pkg.version);
const page={id:'ordered-page',componentIds:['footer-main','hero-main','header-main']};
const components=[
 {id:'header-main',type:'header',properties:{label:'Header'}},
 {id:'hero-main',type:'hero',properties:{title:'Hero in the middle'}},
 {id:'footer-main',type:'footer',properties:{label:'Footer first'}}
];
assert.deepEqual(resolvePageComponents(page,components).map(c=>c.id),page.componentIds,'tree component order follows canonical page componentIds');
const markup=renderPage(page,components,{});
assert.ok(markup.indexOf('Footer first')<markup.indexOf('Hero in the middle'));
assert.ok(markup.indexOf('Hero in the middle')<markup.indexOf('Header'));
assert.match(studio,/resolvePageComponents\(page,draft\.components\)/);
assert.match(studio,/data-move-component/);
assert.match(studio,/data-direction="up"/);
assert.match(studio,/data-direction="down"/);
assert.match(studio,/duplicate component placements/);
assert.match(routes,/registryVersion:LAYOUT_STUDIO_RELEASE/);
assert.match(routes,/publicationEnabled:false/);
assert.match(pkg.scripts['check:release'],/check-16-10-53-composition-ordering\.mjs/);
console.log('16.10.53 composition ordering and editor integrity contract: PASS');
