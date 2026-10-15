import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const version=read('VERSION').trim();
const versionAtLeast=(actual,minimum)=>{const a=String(actual).split('.').map(Number),b=String(minimum).split('.').map(Number);if(a.length!==3||b.length!==3||!a.every(Number.isInteger)||!b.every(Number.isInteger))return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return true;};
const nav=read('public/assets/js/frontend/navigation/registry.js');
const shell=read('public/assets/js/frontend/shell/app-shell.js');
const product=read('public/assets/js/frontend/product-experience.js');
const app=read('public/assets/js/frontend/app/app.js');
const css=read('public/assets/css/frontend/experience.css');
const spec=JSON.parse(read('docs/HUMAN-WORK-NAVIGATION-COLLAPSE.json'));
assert.ok(versionAtLeast(version, '10.94.0'),`Wave 5 continuity requires 10.94.0 or newer, got ${version}`); assert.equal(spec.version,'10.94.0'); assert.equal(spec.wave,5);
for(const [key,label] of [['home','Today'],['work','Work'],['network','Network'],['objects','Objects'],['people','People'],['account','Account']]){assert.match(nav,new RegExp(`key:'${key}'`));assert.match(nav,new RegExp(`label:'${label}'`));}
assert.match(nav,/ROUTE_ALIASES/); for(const alias of ['missions','assignments','execution','attention','focus','operations','requests','object','company','profile','subscription','verification'])assert.match(nav,new RegExp(`${alias}:'`));
assert.match(nav,/canonicalizeAppHash/); assert.match(shell,/canonicalizeAppHash/); assert.match(shell,/aria-current/); assert.match(shell,/data-nav-intent/); assert.match(shell,/nav-link-copy/);
assert.match(product,/cannot remove the/); assert.match(product,/return base\.map/); assert.match(app,/canonicalizeAppHash/);
assert.match(css,/\.nav-link-copy/); assert.match(css,/\.nav-link-mark/); assert.match(css,/position:sticky;top:68px/);
assert.doesNotMatch(nav,/context.*label:'Context'/); assert.doesNotMatch(shell,/admin-workspace.*app/);
console.log('10.94.0 Navigation Collapse: PASS'); console.log('Canonical six-destination Human Work navigation: PASS'); console.log('Legacy route compatibility bridges: PASS'); console.log('Role-consistent navigation availability: PASS'); console.log('Control Plane separation: PASS'); console.log('Modern responsive navigation presentation: PASS');
