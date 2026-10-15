import fs from 'node:fs';
import assert from 'node:assert/strict';
import {normalizeHumanWorkItem,assertHumanWorkItem} from '../../public/assets/js/frontend/work/human-work-contract.js';
import {loadHumanDomainWork} from '../../public/assets/js/frontend/work/human-work-domain-model.js';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('public/assets/js/frontend/app/app.js');
const network=read('public/assets/js/frontend/app/app.js');
const domain=read('public/assets/js/frontend/work/human-work-domain-model.js');
const css=read('public/assets/css/frontend/human-work.css');
const version=read('VERSION').trim();
const versionAtLeast=(actual,minimum)=>{const a=String(actual).split('.').map(Number),b=String(minimum).split('.').map(Number);if(a.length!==3||b.length!==3||!a.every(Number.isInteger)||!b.every(Number.isInteger))return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return true;};

assert.ok(versionAtLeast(version, '10.92.0'),`Wave 3 continuity must remain certified through the current release: ${version}`);
assert.match(app,/loadHumanDomainWork/,'Work surface must compose domain work through the Human Work model');
assert.match(app,/executeCanonicalObjectAction/,'Converted work actions must use the canonical Action client');
assert.match(app,/item\.type==='mission'/,'Mission work must remain routed to canonical Mission Workspace');
assert.match(app,/renderDomainWorkDetail/,'Non-mission work must have a bounded human-work detail surface');
assert.match(app,/data-foryou-approve/,'Mission access requests must be converted into the Human Work surface');
assert.match(app,/data-network-accept/,'Network invitations must remain actionable through the Human Work surface');
assert.match(app,/data-trust-accept/,'Trust requests must remain actionable through the Human Work surface');
assert.doesNotMatch(app,/api\/network\/invitations\/\$\{/,'Network invitation mutations must not bypass canonical Action execution');
assert.doesNotMatch(app,/api\/network\/tenant-trust\/\$\{/,'Trust mutations must not bypass canonical Action execution');
assert.doesNotMatch(app,/api\/public\/requests\/\$\{/,'ForYou request mutations must not bypass canonical Action execution');
assert.match(domain,/sourceAuthority:'network'/,'Converted collaboration work must identify the network authority');
assert.match(domain,/network-invitation:/,'Network invitations must receive stable HumanWorkItem identities');
assert.match(domain,/network-trust:/,'Trust requests must receive stable HumanWorkItem identities');
assert.match(domain,/foryou-request:/,'Mission access requests must receive stable HumanWorkItem identities');
assert.match(domain,/Promise\.allSettled/,'Optional domain projections must use explicit degraded semantics');
assert.doesNotMatch(domain,/catch\(\(\)=>\(\{\}\|\[\]\)\)/,'Domain conversion must not silently swallow read failures');

const item=normalizeHumanWorkItem({
  id:'network-invitation:7',type:'network',state:'attention',situation:'A collaboration decision is waiting.',
  priority:{level:'attention',score:72},responsibility:'collaboration',sourceAuthority:'network',
  reason:{code:'network_invitation_pending',label:'Partner shared execution work.'},
  context:{type:'network',id:'7',reference:'Mission 42',href:'#network?invitation=7',details:{networkInvitationId:7,missionId:42}},
  availableAction:{id:'open_network',label:'Review invitation',href:'#network?invitation=7',enabled:true},
  evidence:[{type:'network-invitation',label:'Pending collaboration invitation'}],nextState:{code:'Pending',label:'Decision required'},status:'Pending'
});
assertHumanWorkItem(item);
assert.equal(item.type,'network');
assert.equal(item.context.details.networkInvitationId,7);
assert.equal(item.availableAction.id,'open_network');
assert.equal(Object.isFrozen(item),true);

const originalFetch=globalThis.fetch;
try{
  globalThis.fetch=async()=>{throw new Error('unexpected network call in static conversion test');};
  const empty=await loadHumanDomainWork({session:{role:'member',tenantId:1}});
  assert.deepEqual(empty.items,[],'Roles without network decision authority should not fabricate work');
  assert.equal(empty.degraded,false);
} finally {globalThis.fetch=originalFetch;}

assert.match(css,/hwp-domain-work-detail/,'Converted domain work must have a dedicated modern detail surface');
assert.match(css,/hwp-work-detail-grid/,'Converted domain work must present structured context');

console.log(`10.92.0 Human Work Surface Conversion continuity: PASS (${version})`);
console.log('Mission + collaboration work composition: PASS');
console.log('Network / trust / mission-request HumanWorkItem adapters: PASS');
console.log('Canonical Action execution boundary: PASS');
console.log('Explicit degraded-read semantics: PASS');
console.log('Modern domain-work detail surface: PASS');
