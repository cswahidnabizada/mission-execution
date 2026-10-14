import fs from 'node:fs';
import assert from 'node:assert/strict';
import {deriveActionCapabilities} from '../../src/worker/extensions/actions-intelligence/action-capability.engine.js';
import {buildActionContract} from '../../src/worker/extensions/actions-intelligence/action-contract.engine.js';

const discovery={
  missionId:247,role:'admin',status:'Pending',accessKind:'foryou-discovery',
  mission:{id:247,public_enabled:1,status:'Pending'},
  perspective:{isOwner:false,isExecutingTenant:false,isPersonal:false},
  responsibility:{},source:{owned:false,shared:false,publicEnabled:true},assignmentFeature:{}
};
assert.deepEqual(deriveActionCapabilities(discovery).capabilities.map(x=>x.code),['request_foryou_mission']);
const contract=buildActionContract(
  deriveActionCapabilities(discovery),
  {conditions:discovery,managementActions:[
    {code:'edit_mission',label:'Edit Mission'},
    {code:'delete_mission',label:'Delete Mission'},
    {code:'cancel_mission',label:'Cancel Mission'}
  ]}
);
assert.equal(contract.accessKind,'foryou-discovery');
assert.deepEqual(contract.all.map(x=>x.code),['request_foryou_mission']);
assert.equal(contract.primary?.code,'request_foryou_mission');

const pending={...discovery,accessKind:'pending-foryou',forYouRequest:{pending:true,status:'Pending',relation:'requester'}};
const pendingContract=buildActionContract(deriveActionCapabilities(pending),{conditions:pending,managementActions:[
  {code:'edit_mission',label:'Edit Mission'},
  {code:'delete_mission',label:'Delete Mission'},
  {code:'cancel_mission',label:'Cancel Mission'}
]});
assert.equal(pendingContract.accessKind,'pending-foryou');
assert.equal(pendingContract.accessKind,'pending-foryou');
assert.deepEqual(pendingContract.all.map(x=>x.code),[]); // target-less synthetic request remains suppressed; live route supplies forYouRequestId

const auth=fs.readFileSync('src/worker/extensions/action-execution/secured-action-authorization.contract.js','utf8');
const workspace=fs.readFileSync('public/assets/ui/canonical-mission-workspace.js','utf8');
const management=fs.readFileSync('src/worker/extensions/mission-management/permissions/management-permission.engine.js','utf8');
assert.match(auth,/code==="request_foryou_mission"/);
assert.match(workspace,/c==="request_foryou_mission"\)return renderForYouRequest/);
assert.match(management,/restrictedForYouContext/);
assert.match(management,/!restrictedForYouContext/);
console.log('PASS: 10.31.39 canonical ForYou requester isolation and request precedence');
