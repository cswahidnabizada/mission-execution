import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const version=read('VERSION').trim();
assert.ok(['10.95.0','10.97.0','11.02.0','11.03.0','11.04.0','11.04.1','11.05.0','11.05.1','11.06.0','11.07.0','11.08.0','11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20'].includes(version),`surface retirement continuity requires 10.95.0 or newer, got ${version}`);
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
