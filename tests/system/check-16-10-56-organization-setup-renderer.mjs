import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json')),manifest=JSON.parse(read('RELEASE-MANIFEST.json'));
const app=read('public/assets/js/frontend/app/app.js'),html=read('public/app/index.html'),routes=read('src/worker/modules/admin-control/layout-studio.routes.js'),adapter=read('public/assets/js/frontend/admin/layout-studio-production-adapter.js'),css=read('public/assets/css/frontend/organization-setup-renderer.css');
assert.ok(pkg.version.localeCompare('16.10.56',undefined,{numeric:true})>=0);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);assert.equal(read('VERSION').trim(),pkg.version);assert.equal(manifest.version,pkg.version);assert.ok(['16.10.55','16.10.56','16.10.57','16.10.58','16.10.60','16.10.65','16.10.66','16.10.61','16.10.62','16.10.63','16.10.64','16.10.65','16.10.67','16.10.68','16.10.69','16.10.70'].includes(manifest.base));
assert.match(app,/renderComponent,STUDIO_RENDERER_VERSION/);assert.match(app,/shouldOpen\?`<div class=\"organization-setup-renderer\"/);assert.match(app,/initActivationModule\('#accountActivation',\{autoOpen:shouldOpen,mode:'full'\}\)/);
assert.match(html,new RegExp('organization-setup-renderer\\.css\\?v='+pkg.version.replaceAll('.','\\.')));assert.match(routes,/id:'organization-setup',[^\n]*BASELINE_CHROME_RENDERER_CONNECTED_UNCERTIFIED/);assert.match(routes,/publicationEnabled:false/);assert.match(adapter,/VERIFIED_CANONICAL_RELEASE_REQUIRED/);assert.match(css,/max-width:600px/);
console.log('16.10.56 organization setup renderer integration contract: PASS');
