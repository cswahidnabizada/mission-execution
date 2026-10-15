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

assert.ok(['10.92.0','10.93.0','10.94.0','10.95.0','10.97.0','11.02.0','11.03.0','11.04.0','11.04.1','11.05.0','11.05.1','11.06.0','11.07.0','11.08.0','11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14'].includes(version),`Wave 3 continuity must remain certified through the current release: ${version}`);
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
