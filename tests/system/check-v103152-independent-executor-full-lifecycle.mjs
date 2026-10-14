import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {evaluateSecuredActionAuthorization} from '../../src/worker/extensions/action-execution/secured-action-authorization.contract.js';

const base={
  session:{role:'executor',executorId:42,tenantId:0,identityId:'executor:42'},
  access:{accessKind:'executor',tenantId:100,mission:{id:249,company_id:100,assigned_executor_id:42}},
};
const mission={id:249,company_id:100,assigned_executor_id:42,delivery_proof_required:1};
const matrix=[
  ['confirm_arrival','Pending','Arrived'],
  ['confirm_pickup','Arrived','PickedUp'],
  ['start_transit','PickedUp','InTransit'],
  ['confirm_delivery','InTransit','Delivered'],
  ['complete_mission','Delivered','Completed'],
];
for(const [action,status,next] of matrix){
  const auth=evaluateSecuredActionAuthorization({...base,actionCode:action,mission:{...mission,status},access:{...base.access,mission:{...mission,status},deliveryProofPresent:action==='confirm_delivery'||action==='complete_mission'}});
  assert.equal(auth.authorized,true,`${action} must authorize for assigned independent executor: ${auth.reasons.join(',')}`);
  assert.equal(auth.checks.tenant,true,`${action} must not require tenantId`);
  assert.equal(auth.checks.responsibility,true,`${action} must recognize executor responsibility`);
  assert.equal(auth.checks.lifecycle,true,`${action} lifecycle ${status}->${next} must be valid`);
}
for(const [action,status] of [['capture_delivery_proof','InTransit'],['capture_delivery_proof','Delivered']]){
  const auth=evaluateSecuredActionAuthorization({...base,actionCode:action,mission:{...mission,status},access:{...base.access,mission:{...mission,status},deliveryProofPresent:false}});
  assert.equal(auth.authorized,true,`${action} must authorize for assigned executor: ${auth.reasons.join(',')}`);
  assert.equal(auth.checks.tenant,true,`${action} must not require tenantId`);
  assert.equal(auth.checks.responsibility,true,`${action} must recognize executor responsibility`);
}
const wrong=evaluateSecuredActionAuthorization({...base,session:{...base.session,executorId:43},mission:{...mission,status:'Pending'},access:{...base.access,mission:{...mission,status:'Pending'}}});
assert.equal(wrong.authorized,false,'different executor must not execute the mission');
assert.ok(wrong.reasons.includes('responsibility_not_held'),'wrong executor must fail responsibility');
const driver=evaluateSecuredActionAuthorization({session:{role:'driver',driverId:7,tenantId:100,identityId:'driver:7'},access:{accessKind:'owner-driver',tenantId:100,mission:{id:249,company_id:100,driver_id:7}},actionCode:'confirm_arrival',mission:{id:249,company_id:100,status:'Pending',driver_id:7}});
assert.equal(driver.authorized,true,'driver authorization must remain intact');
const custody=evaluateSecuredActionAuthorization({session:{role:'executor',executorId:42,tenantId:0,identityId:'executor:42'},access:{accessKind:'custody-recipient',tenantId:100,mission:{id:249,company_id:100,custody_target_type:'executor',custody_target_id:42}},actionCode:'accept_custody',mission:{id:249,company_id:100,status:'InTransit',custody_target_type:'executor',custody_target_id:42}});
assert.equal(custody.authorized,true,`executor custody acceptance must authorize: ${custody.reasons.join(',')}`);
assert.equal(custody.checks.tenant,true,'executor custody acceptance must pass identity boundary');

for(const f of [
 'src/worker/extensions/action-execution/secured-action-authorization.contract.js',
 'src/worker/security/mission-access.js',
 'src/worker/modules/missions/missions.service.js',
 'src/worker/modules/files/files.service.js',
 'src/worker/modules/files/files.routes.js',
 'src/worker/application/actions/action-service-map.js',
 'src/worker/extensions/actions-intelligence/action-capability.engine.js',
 'src/worker/extensions/actions-intelligence/action-contract.engine.js'
]) execFileSync(process.execPath,['--check',f]);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.match(pkg.version,/^10\.31\./,'protected 10.31.x descendants must retain the verified 10.31.52 lifecycle baseline');
assert.ok(Number(pkg.version.split('.')[2])>=52,'candidate must be at or beyond the protected 10.31.52 baseline');
console.log(`10.31.52 Independent Executor full lifecycle baseline preserved by ${pkg.version}: PASS`);
