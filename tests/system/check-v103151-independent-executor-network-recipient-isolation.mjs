import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {deriveActionCapabilities} from '../../src/worker/extensions/actions-intelligence/action-capability.engine.js';
import {buildActionContract} from '../../src/worker/extensions/actions-intelligence/action-contract.engine.js';
import {evaluateSecuredActionAuthorization} from '../../src/worker/extensions/action-execution/secured-action-authorization.contract.js';

const pendingNetwork={
  accessKind:'pending-network',role:'executor',missionId:249,status:'Pending',
  networkInvitation:{id:77,status:'Pending',relation:'recipient'},
  perspective:{viewer:'executor'},
  responsibility:{},
  source:{},
  execution:{},
  featureState:{network:{pending:true,id:77,status:'Pending',relation:'recipient'}}
};
const caps=deriveActionCapabilities({conditions:pendingNetwork,networkInvitation:{id:77,status:'Pending',relation:'recipient'},viewerExecutorId:42});
const codes=caps.capabilities.map(x=>x.code);
assert.deepEqual(codes.sort(),['accept_network','reject_network','review_network'].sort(),'pending Network recipient must expose only review/accept/reject');
assert.ok(!codes.some(c=>['confirm_arrival','confirm_pickup','start_transit','capture_delivery_proof','confirm_delivery','complete_mission','report_exception','navigate','message','assign_driver','edit_mission','share_foryou','share_network'].includes(c)),'execution/management actions leaked into pending Network recipient context');

const contract=buildActionContract({
  capabilities:caps.capabilities,role:'executor',viewer:'executor',missionId:249,status:'Pending',
  stateToken:'v:3'
},{
  missionId:249,role:'executor',conditions:{...pendingNetwork},accessKind:'pending-network',networkInvitationId:77,
  managementActions:[{code:'confirm_arrival',label:'Confirm Arrival'},{code:'edit_mission_data',label:'Edit'}],
  stateToken:'v:3'
});
const contractCodes=contract.all.map(x=>x.code);
assert.deepEqual(contractCodes.sort(),['accept_network','reject_network','review_network'].sort(),'action contract leaked management actions for pending Network recipient');

const auth=evaluateSecuredActionAuthorization({
  session:{role:'executor',executorId:42,tenantId:0,identityId:'executor:42'},
  access:{accessKind:'pending-network',tenantId:100,mission:{id:249,recipient_type:'executor',recipient_executor_id:42}},
  actionCode:'accept_network',
  mission:{id:249,company_id:100,status:'Pending',recipient_type:'executor',recipient_executor_id:42}
});
assert.equal(auth.authorized,true,`executor Network acceptance must authorize: ${auth.reasons.join(',')}`);
assert.equal(auth.checks.tenant,true,'executor Network acceptance must pass tenant boundary using executor identity');

const authForYou=evaluateSecuredActionAuthorization({
  session:{role:'executor',executorId:42,tenantId:0,identityId:'executor:42'},
  access:{accessKind:'foryou-discovery',tenantId:100,mission:{id:249}},
  actionCode:'request_foryou_mission',
  mission:{id:249,company_id:100,status:'Pending',public_enabled:1}
});
assert.equal(authForYou.authorized,true,`executor ForYou request must authorize: ${authForYou.reasons.join(',')}`);
assert.equal(authForYou.checks.tenant,true,'executor ForYou request must pass tenant boundary using executor identity');

for(const f of [
 'src/worker/extensions/actions-intelligence/action-capability.engine.js',
 'src/worker/extensions/actions-intelligence/action-contract.engine.js',
 'src/worker/extensions/action-execution/secured-action-authorization.contract.js'
]) execFileSync(process.execPath,['--check',f]);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const currentVersion=pkg.version.split('.').map(Number);
assert.ok(currentVersion[0]>10 || (currentVersion[0]===10 && (currentVersion[1]>31 || (currentVersion[1]===31 && currentVersion[2]>=51))),`current release must preserve 10.31.51+ protections; found ${pkg.version}`);
console.log('10.31.51 Independent Executor Network recipient isolation + ForYou authorization: PASS');
