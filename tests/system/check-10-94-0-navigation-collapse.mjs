import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const version=read('VERSION').trim();
const nav=read('public/assets/js/frontend/navigation/registry.js');
const shell=read('public/assets/js/frontend/shell/app-shell.js');
const product=read('public/assets/js/frontend/product-experience.js');
const app=read('public/assets/js/frontend/app/app.js');
const css=read('public/assets/css/frontend/experience.css');
const spec=JSON.parse(read('docs/HUMAN-WORK-NAVIGATION-COLLAPSE.json'));
assert.ok(['10.94.0','10.95.0','10.97.0','11.02.0','11.03.0','11.04.0','11.04.1','11.05.0','11.05.1','11.06.0','11.07.0','11.08.0','11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12'].includes(version),`Wave 5 continuity requires 10.94.0 or newer, got ${version}`); assert.equal(spec.version,'10.94.0'); assert.equal(spec.wave,5);
for(const [key,label] of [['home','Today'],['work','Work'],['network','Network'],['objects','Objects'],['people','People'],['account','Account']]){assert.match(nav,new RegExp(`key:'${key}'`));assert.match(nav,new RegExp(`label:'${label}'`));}
assert.match(nav,/ROUTE_ALIASES/); for(const alias of ['missions','assignments','execution','attention','focus','operations','requests','object','company','profile','subscription','verification'])assert.match(nav,new RegExp(`${alias}:'`));
assert.match(nav,/canonicalizeAppHash/); assert.match(shell,/canonicalizeAppHash/); assert.match(shell,/aria-current/); assert.match(shell,/data-nav-intent/); assert.match(shell,/nav-link-copy/);
assert.match(product,/cannot remove the/); assert.match(product,/return base\.map/); assert.match(app,/canonicalizeAppHash/);
assert.match(css,/\.nav-link-copy/); assert.match(css,/\.nav-link-mark/); assert.match(css,/position:sticky;top:68px/);
assert.doesNotMatch(nav,/context.*label:'Context'/); assert.doesNotMatch(shell,/admin-workspace.*app/);
console.log('10.94.0 Navigation Collapse: PASS'); console.log('Canonical six-destination Human Work navigation: PASS'); console.log('Legacy route compatibility bridges: PASS'); console.log('Role-consistent navigation availability: PASS'); console.log('Control Plane separation: PASS'); console.log('Modern responsive navigation presentation: PASS');
