import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const version=read('VERSION').trim();
const versionAtLeast=(actual,minimum)=>{const a=String(actual).split('.').map(Number),b=String(minimum).split('.').map(Number);if(a.length!==3||b.length!==3||!a.every(Number.isInteger)||!b.every(Number.isInteger))return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return true;};
assert.ok(versionAtLeast(version, '10.95.0'),`surface retirement continuity requires 10.95.0 or newer, got ${version}`);
const spec=JSON.parse(read('docs/HUMAN-WORK-SURFACE-RETIREMENT.json'));
assert.equal(spec.version,'10.95.0');
assert.equal(spec.base,'10.94.0');
assert.equal(spec.wave,6);
const nav=read('public/assets/js/frontend/navigation/registry.js');
const app=read('public/assets/js/frontend/app/app.js');
const activation=read('public/assets/js/core/activation-module.js');
for(const [key,label] of [['home','Today'],['work','Work'],['network','Network'],['objects','Objects'],['people','People'],['account','Account']]){
  assert.match(nav,new RegExp(`key:'${key}'`));
  assert.match(nav,new RegExp(`label:'${label}'`));
}
assert.match(app,/initActivationModule/,'Account must own the canonical activation/readiness context');
assert.match(app,/accountActivation/,'Account must render one activation context');
assert.match(activation,/api\/user\/activation/,'Activation context must use canonical activation authority');
assert.doesNotMatch(activation,/subscription\.html/,'Activation center must not route to retired billing page');
for(const [path,target] of Object.entries({
 'public/admin.html':'/',
 'public/admin-control.html':'/',
 'public/admin/index.html':'/',
 'public/driver/dashboard.html':'/app#work',
 'public/missions.html':'/app#work',
 'public/my-driver/index.html':'/app#people',
 'public/role-workspace.html':'/app#work',
 'public/marketplace/index.html':'/foryou',
 'public/access.html':'/app#account?activation=1',
 'public/subscription.html':'/app#account?activation=1',
 'public/verification.html':'/app#account?activation=1'
})){
  const html=read(path);
  assert.match(html,/noindex/i,`${path} must be non-indexable`);
  assert.match(html,new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`${path} must redirect to ${target}`);
  assert.doesNotMatch(html,/<form\b|<section\b|<main\b[^>]*>.*(?:Mission|Subscription|Verification|Access)/is,`${path} must not render duplicate operational UI`);
}
const joined=['src/worker/security/user-situation.service.js','src/worker/security/user-access.service.js','src/worker/security/activation.service.js','src/worker/security/operational-gate.service.js','src/worker/application/actions/canonical-action.application.service.js','src/worker/modules/executors/executors.routes.js','public/assets/js/pages/executor-register.js','public/assets/js/pages/tenant-product-experience.js','public/assets/js/pages/register.js','public/assets/js/pages/access.js','public/assets/js/core/global-nav.js'].map(read).join('\n');
assert.doesNotMatch(joined,/\/verification\.html|\/subscription\.html|\/access\.html/,'Canonical authenticated journeys must not point at retired pages');
assert.match(joined,/\/app#account\?activation=1/,'Canonical readiness routes must target Account activation context');
assert.doesNotMatch(nav,/label:'Context'/,'Context must remain contextual, not a top-level destination');
assert.doesNotMatch(read('public/app/index.html'),/subscription\.html|verification\.html|access\.html/);
console.log('10.95.0 Human Work Surface Retirement: PASS');
console.log('Duplicate authenticated operational surfaces retired: PASS');
console.log('Account activation/readiness convergence: PASS');
console.log('Canonical six-destination navigation preserved: PASS');
console.log('Public/transactional journey separation: PASS');
console.log('Control Plane separation: PASS');
