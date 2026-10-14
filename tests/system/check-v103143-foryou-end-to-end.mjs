import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildMissionContext} from '../../src/worker/modules/intelligence/mission-context.js';
import {buildMissionConditions} from '../../src/worker/modules/intelligence/mission-conditions.js';
import {deriveActionCapabilities} from '../../src/worker/extensions/actions-intelligence/action-capability.engine.js';
import {buildActionContract} from '../../src/worker/extensions/actions-intelligence/action-contract.engine.js';
import {resolveActionTarget} from '../../src/worker/application/actions/action-service-map.js';
import {evaluateSecuredActionAuthorization} from '../../src/worker/extensions/action-execution/secured-action-authorization.contract.js';

const read=p=>fs.readFileSync(p,'utf8');
const baseMission={
  id:249,reference:'SN:100073',company_id:1,status:'Pending',public_enabled:1,
  pickup_address:'Rahlstedter Grenzweg 5, 22143 Hamburg',delivery_address:'Sportallee 70, 22335 Hamburg',
  updated_at:'2026-09-13T10:00:00Z',created_at:'2026-09-13T09:00:00Z'
};

// Tenant B discovery: use the exact production-shaped Conditions contract.
// There is deliberately NO raw mission.public_enabled on Conditions; publication
// truth must come from conditions.source.publicEnabled.
const discoveryContext=buildMissionContext(baseMission,{role:'admin',accessKind:'foryou-discovery',now:Date.parse('2026-09-13T12:00:00Z')});
const discovery=buildMissionConditions(discoveryContext);
const discoveryCapabilities=deriveActionCapabilities({conditions:discovery,featureState:{}});
assert.deepEqual(discoveryCapabilities.capabilities.map(x=>x.code),['request_foryou_mission']);
const discoveryContract=buildActionContract(discoveryCapabilities,{conditions:discovery,featureState:{},missionId:249});
assert.equal(discoveryContract.primary?.code,'request_foryou_mission');
assert.deepEqual(discoveryContract.all.map(x=>x.code),['request_foryou_mission']);
const requestTarget=resolveActionTarget('request_foryou_mission',{missionId:249,payload:{message:'Please execute this mission',driverId:null}});
assert.equal(requestTarget.method,'POST');
assert.equal(requestTarget.endpoint,'/api/public/missions/249/request');
assert.equal(requestTarget.body.message,'Please execute this mission');
const discoveryAuth=evaluateSecuredActionAuthorization({
  session:{identityId:10,tenantId:2,role:'admin'},
  access:{accessKind:'foryou-discovery',tenantId:1,mission:baseMission},
  actionCode:'request_foryou_mission',mission:baseMission
});
assert.equal(discoveryAuth.authorized,true);

// Tenant B after request: only the canonical cancel action remains while the
// owner decides. Management actions are intentionally absent.
const pendingMission={...baseMission,requester_type:'tenant',requester_company_id:2};
const pendingConditions={...discovery,accessKind:'pending-foryou'};
const pendingCapabilities=deriveActionCapabilities({
  conditions:pendingConditions,
  featureState:{foryou:{pending:true,relation:'requester',id:501}}
});
assert.deepEqual(pendingCapabilities.capabilities.map(x=>x.code),['cancel_foryou_request']);
const pendingContract=buildActionContract(pendingCapabilities,{conditions:pendingConditions,featureState:{foryou:{pending:true,relation:'requester',id:501}},missionId:249,forYouRequestId:501});
assert.equal(pendingContract.primary?.code,'cancel_foryou_request');
assert.deepEqual(pendingContract.all.map(x=>x.code),['cancel_foryou_request']);
const cancelAuth=evaluateSecuredActionAuthorization({
  session:{identityId:10,tenantId:2,role:'admin'},
  access:{accessKind:'pending-foryou',tenantId:1,mission:pendingMission},
  actionCode:'cancel_foryou_request',mission:pendingMission
});
assert.equal(cancelAuth.authorized,true);

// Tenant A owner after Tenant B request: owner context must expose review +
// approve/decline actions and never expose request_foryou_mission.
const ownerContext=buildMissionContext({...baseMission,public_enabled:1},{role:'admin',accessKind:'owner',now:Date.parse('2026-09-13T12:00:00Z')});
const ownerConditions=buildMissionConditions(ownerContext);
const ownerCapabilities=deriveActionCapabilities({
  conditions:ownerConditions,
  featureState:{foryou:{pending:true,relation:'owner',id:501}}
});
const ownerCodes=ownerCapabilities.capabilities.map(x=>x.code);
assert.ok(ownerCodes.includes('review_foryou'));
assert.ok(ownerCodes.includes('approve_foryou_request'));
assert.ok(ownerCodes.includes('decline_foryou_request'));
assert.ok(!ownerCodes.includes('request_foryou_mission'));
const ownerContract=buildActionContract(ownerCapabilities,{conditions:ownerConditions,featureState:{foryou:{pending:true,relation:'owner',id:501}},missionId:249,forYouRequestId:501});
assert.equal(ownerContract.primary?.code,'review_foryou');
assert.ok(ownerContract.all.some(x=>x.code==='approve_foryou_request'));
assert.ok(ownerContract.all.some(x=>x.code==='decline_foryou_request'));
assert.equal(resolveActionTarget('approve_foryou_request',{missionId:249,forYouRequestId:501})?.endpoint,'/api/public/requests/501/approve');
assert.equal(resolveActionTarget('decline_foryou_request',{missionId:249,forYouRequestId:501})?.endpoint,'/api/public/requests/501/decline');
const ownerApproveAuth=evaluateSecuredActionAuthorization({
  session:{identityId:20,tenantId:1,role:'admin'},
  access:{accessKind:'owner',tenantId:1,mission:{...baseMission,foryou_request_id:501}},
  actionCode:'approve_foryou_request',mission:{...baseMission,foryou_request_id:501}
});
assert.equal(ownerApproveAuth.authorized,true);

// Tenant B after approval: shared-tenant is the authoritative context and
// ForYou request actions disappear. Normal execution/assignment intelligence
// may now become available according to the shared assignment state.
const sharedContext=buildMissionContext({...baseMission,public_enabled:0,shared_access:1,executing_tenant_id:2},{role:'admin',accessKind:'shared-tenant',now:Date.parse('2026-09-13T12:00:00Z')});
const sharedConditions=buildMissionConditions(sharedContext);
const sharedCapabilities=deriveActionCapabilities({
  conditions:sharedConditions,
  featureState:{assignment:{assignmentRequired:true,assignmentMutable:true,canAssign:true,canReassign:false}}
});
const sharedCodes=sharedCapabilities.capabilities.map(x=>x.code);
assert.ok(sharedCodes.includes('open_mission'));
assert.ok(!sharedCodes.includes('request_foryou_mission'));
assert.ok(!sharedCodes.includes('cancel_foryou_request'));

// Static route/transaction invariants for the complete journey.
const routes=read('src/worker/modules/public/public.routes.js');
const service=read('src/worker/modules/public/public.service.js');
const access=read('src/worker/security/mission-access.js');
const workspace=read('public/assets/ui/canonical-mission-workspace.js');
const safety=read('src/worker/modules/transitions/transition-safety.service.js');
const auth=read('src/worker/extensions/action-execution/secured-action-authorization.contract.js');
assert.match(routes,/actionCode:"foryou_request"/);
assert.match(routes,/actionCode:"foryou_approve"/);
assert.match(routes,/actionCode:"foryou_decline"/);
assert.match(routes,/actionCode:"foryou_cancel"/);
assert.match(routes,/const body=await readJson\(request\),requestId=Number\(params\.requestId\)/);
assert.match(service,/createTenantPublicRequest/);
assert.match(service,/grantTenantAccess/);
assert.match(service,/approveRequestStatus/);
assert.match(service,/closeMarketplaceAfterApproval/);
assert.match(access,/accessKind:"pending-foryou"/);
assert.match(access,/accessKind:"foryou-discovery"/);
assert.match(access,/accessKind:"shared-tenant"/);
assert.match(workspace,/renderForYouRequest/);
assert.match(workspace,/renderCancelForYouRequest/);
assert.doesNotMatch(workspace,/disabled=\$\{custody\?"disabled":""\}/);
assert.match(workspace,/id="cmwForYouRequest"\$\{custody\?" disabled":""\}/);
assert.match(safety,/canonical_foryou_request_exists/);
assert.match(safety,/action==='foryou_approve' \|\| action==='foryou_decline' \|\| action==='foryou_cancel'/);
assert.match(auth,/code==="request_foryou_mission"/);
assert.match(auth,/code==="cancel_foryou_request"/);
assert.match(auth,/approve_foryou_request.*decline_foryou_request/s);

console.log('PASS: 10.31.43 complete ForYou TenantA/TenantB canonical journey');
