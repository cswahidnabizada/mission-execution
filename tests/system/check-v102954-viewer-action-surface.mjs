import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCanonicalOperatorActionInventory,validateCanonicalOperatorActionInventory} from '../../src/worker/extensions/operations-context/canonical-operator-action-inventory.contract.js';
const root=new URL('../..',import.meta.url).pathname;
const primary={code:'confirm_arrival',label:'Confirm Arrival',domain:'mission_flow',target:{intent:'mission_status'}};
const secondary=[
  {code:'message',label:'Message',domain:'mission'},
  {code:'edit_mission',label:'Edit Mission',domain:'management'},
  {code:'delete_mission',label:'Delete Mission',domain:'management'},
  {code:'cancel_mission',label:'Cancel Mission',domain:'cancellation'}
];
const inventory=buildCanonicalOperatorActionInventory({
  missionId:241,
  primaryAction:null,
  availableActions:secondary,
  operatorIntent:{missionId:241,state:'SUPPORT'},
  canonicalCapability:{code:'confirm_arrival',label:'Confirm Arrival',exposureState:'NOT_EXPOSED'}
});
assert.deepEqual(inventory.counts,{all:4,execution:0,support:1,management:3});
assert.equal(inventory.surface.primaryCode,null);
assert.equal(inventory.surface.secondaryCount,4);
assert.deepEqual(inventory.support.map(a=>a.code),['message']);
assert.deepEqual(inventory.management.map(a=>a.code),['edit_mission','delete_mission','cancel_mission']);
assert.deepEqual(validateCanonicalOperatorActionInventory(inventory),[]);
const primaryInventory=buildCanonicalOperatorActionInventory({
  missionId:241,primaryAction:primary,availableActions:secondary,
  operatorIntent:{missionId:241,state:'EXECUTE'},
  canonicalCapability:{code:'confirm_arrival',label:'Confirm Arrival',exposureState:'EXECUTABLE'}
});
assert.deepEqual(primaryInventory.counts,{all:5,execution:1,support:1,management:3});
assert.equal(primaryInventory.surface.primaryCode,'confirm_arrival');
assert.equal(primaryInventory.surface.secondaryCount,4);
const js=fs.readFileSync(`${root}/public/assets/js/extensions/dashboard-work-surface-102954.js`,'utf8');
for(const token of ['Canonical viewer action surface','new-action-surface-summary','canonicalOperatorActionInventory','VIEWER ACTIONS']) assert.ok(js.includes(token),`missing 10.29.54 surface token ${token}`);
assert.ok(js.includes('renderActionCenter(canonicalOperatorActionInventory,primaryAction,deniedActions)'));
const route=fs.readFileSync(`${root}/src/worker/extensions/operations-context/operations-context.routes.js`,'utf8');
assert.ok(route.includes('viewerActionSurface'));
assert.ok(route.includes('primaryAction:unified?.primary||null'));
console.log('10.29.54 canonical viewer action surface gate: PASS');
