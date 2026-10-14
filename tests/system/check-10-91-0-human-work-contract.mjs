import fs from 'node:fs';
import assert from 'node:assert/strict';
import {normalizeHumanWorkItem,normalizeHumanWorkItems,assertHumanWorkItem} from '../../public/assets/js/frontend/work/human-work-contract.js';

const read=p=>fs.readFileSync(p,'utf8');
const contract=read('public/assets/js/frontend/work/human-work-contract.js');
const model=read('public/assets/js/frontend/work/human-work-model.js');
const app=read('public/assets/js/frontend/app/app.js');
const nav=read('public/assets/js/frontend/navigation/registry.js');
const spec=JSON.parse(read('docs/HUMAN-WORK-CONTRACT.json'));

const item=normalizeHumanWorkItem({
  id:42,
  type:'mission',
  situation:'Execution requires attention',
  priority:{level:'urgent',score:91},
  responsibility:'operator',
  sourceAuthority:'mission',
  reason:{code:'assignment_required',label:'Execution responsibility is not confirmed.'},
  context:{type:'mission',id:42,reference:'Mission 42',href:'/app#work?mission=42',details:{pickup:'Hamburg',delivery:'Berlin'}},
  availableAction:{id:'open_mission_workspace',label:'Open work',href:'/app#work?mission=42',enabled:true},
  waitingCondition:null,
  evidence:[{type:'mission-state',label:'Mission state v7'}],
  nextState:{code:'ACTIVE',label:'Active'},
  state:'urgent',
  status:'Active'
});

assertHumanWorkItem(item);
assert.equal(spec.name,'HumanWorkItem');
assert.equal(spec.wave,2);
assert.equal(item.id,'42');
assert.equal(item.state,'urgent');
assert.equal(item.context.reference,'Mission 42');
assert.equal(item.context.details.pickup,'Hamburg');
assert.equal(item.availableAction.id,'open_mission_workspace');
assert.equal(item.reason.code,'assignment_required');
assert.equal(Object.isFrozen(item),true,'HumanWorkItem must be immutable');
assert.throws(()=>{item.state='done'},/read only|Cannot assign|frozen/i);

const normalized=normalizeHumanWorkItems([{id:1,reference:'Mission 1',reason:'Review',workState:'attention'}]);
assert.equal(normalized.length,1);
assert.equal(normalized[0].state,'attention');
assert.equal(normalized[0].context.reference,'Mission 1');

for(const field of ['situation','priority','responsibility','sourceAuthority','reason','context','availableAction','waitingCondition','evidence','nextState'])
  assert.match(contract,new RegExp(`\\b${field}\\b`),`HumanWorkItem contract missing ${field}`);
assert.match(contract,/Object\.freeze/,'HumanWorkItem contract must enforce immutable presentation data');
assert.match(contract,/Mutation remains[\s\S]*owned by canonical Action Registry/,'Contract must not become a mutation authority');
assert.match(model,/normalizeHumanWorkItem/,'Human Work Model must normalize through the canonical contract');
assert.match(model,/const all=dedupe\(\[\.\.\.rows,\.\.\.attentionOnly\]\)\.map\(item=>normalizeHumanWorkItem/,'Every composed mission work item must cross the canonical adapter boundary');
assert.match(app,/x\.state===filter/,'Work filtering must consume the canonical state field');
assert.doesNotMatch(app,/x\.workState/,'Application Work UI must not consume the legacy workState field');
assert.match(app,/x\.context\.reference/,'Work UI must consume canonical context');
assert.match(app,/x\.reason\.label/,'Work UI must consume canonical reason');
assert.match(app,/x\.availableAction|x\.context\?\.href/,'Work UI must navigate through canonical action/context descriptors');
assert.doesNotMatch(contract,/fetch\(|api\(|method:\s*['\"](POST|PUT|PATCH|DELETE)/,'HumanWorkItem contract must remain read/composition-only');
assert.match(nav,/label:'Today'/,'Human Work navigation must remain present');
assert.match(nav,/label:'Work'/,'Human Work navigation must remain present');

console.log('10.91.0 Canonical HumanWorkItem Contract: PASS');
console.log('Immutable normalized item: PASS');
console.log('Human Work Model adapter boundary: PASS');
console.log('Work UI canonical-field consumption: PASS');
console.log('No mutation authority in contract: PASS');
