import fs from 'node:fs';
import path from 'node:path';
import {ACTION_REGISTRY,allActionDefinitions} from '../../src/worker/application/actions/action-registry.js';
import {mappedActionCodes,resolveActionTarget,serviceDefinition} from '../../src/worker/application/actions/action-service-map.js';
import {evaluateSecuredActionAuthorization} from '../../src/worker/extensions/action-execution/secured-action-authorization.contract.js';

const root=process.cwd(),fail=[];
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ui=read('public/assets/ui/canonical-mission-workspace.js');
const routes=read('src/worker/extensions/action-execution/secured-action-execution.routes.js');
const network=read('src/worker/modules/network/network.service.js');
const auth=read('src/worker/extensions/action-execution/secured-action-authorization.contract.js');

// Every registered action must have one canonical service-map definition.
for(const {code} of allActionDefinitions()){
  if(!serviceDefinition(code))fail.push(`Action Registry action has no service-map target: ${code}`);
}

// Resolve every mapped target with a complete representative context. No executable
// API target may leak an unevaluated function or a missing endpoint.
const context={
  missionId:246,role:'admin',networkInvitationId:91,forYouRequestId:92,openExceptionId:93,requirementId:94,
  personId:11,relationshipId:12,partnerId:13,customerId:14,
  payload:{driverId:21,recipientType:'tenant',recipientId:22,message:'test',publicDescription:'test',confirmation:'DELETE',
    exceptionType:'delay',note:'test',reasonCode:'other',channel:'driver',targetDriverId:23}
};
for(const code of mappedActionCodes()){
  const def=serviceDefinition(code),target=resolveActionTarget(code,context);
  if(['ui','navigate'].includes(String(def?.kind||'')))continue;
  if(!target)fail.push(`Mapped executable action resolved without target: ${code}`);
  if(target&&target.kind==='api'){
    if(!target.endpoint||typeof target.endpoint!=='string')fail.push(`API action has no concrete endpoint: ${code}`);
    if(typeof target.body==='function')fail.push(`API action leaked executable body function: ${code}`);
  }
}

// Pending Network tenant access is deliberately recipient-scoped: the receiving
// tenant may respond even though access.tenantId identifies the mission owner.
const pendingMission={id:246,company_id:10,status:'Pending',recipient_type:'tenant',recipient_company_id:20,network_invitation_pending:1};
const pendingAccess={tenantId:10,accessKind:'pending-network',mission:pendingMission};
const good=evaluateSecuredActionAuthorization({
  session:{identityId:'u20',role:'admin',tenantId:20},access:pendingAccess,actionCode:'accept_network',mission:pendingMission
});
if(!good.authorized)fail.push(`Pending Network recipient tenant cannot accept: ${good.reasons.join(',')}`);
const bad=evaluateSecuredActionAuthorization({
  session:{identityId:'u21',role:'admin',tenantId:21},access:pendingAccess,actionCode:'accept_network',mission:pendingMission
});
if(bad.authorized)fail.push('Unrelated tenant can accept a pending Network invitation');

// Canonical acceptance must require a driver for a receiving tenant and the
// workspace must present that choice before sending ACCEPT.
if(!network.includes('Choose the driver who will execute this shared mission before accepting it'))fail.push('Network service must require receiving-driver selection for tenant acceptance');
if(!ui.includes('tenantRecipient&&String(role())==="admin"'))fail.push('Canonical workspace must present driver assignment for every pending tenant Network invitation');
if(!ui.includes('data-review-driver'))fail.push('Canonical workspace Network acceptance must carry a receiving-driver control');
if(!routes.includes('accessResult?.mission?.network_invitation_id'))fail.push('Secured preparation must recover invitation identity from pending mission access');
if(!auth.includes('pendingNetworkRecipient'))fail.push('Secured authorization must explicitly validate pending Network recipient identity');

for(const f of [
  'src/worker/application/actions/action-service-map.js',
  'src/worker/extensions/action-execution/secured-action-authorization.contract.js',
  'src/worker/extensions/action-execution/secured-action-execution.routes.js',
  'src/worker/modules/network/network.service.js',
  'public/assets/ui/canonical-mission-workspace.js'
]){
  const {spawnSync}=await import('node:child_process');
  const r=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});
  if(r.status!==0)fail.push(`${f} syntax error: ${r.stderr}`);
}

if(fail.length){console.error('FAIL 10.31.34 Canonical Action Permanence');for(const x of fail)console.error(' - '+x);process.exit(1)}
console.log('PASS 10.31.34 Canonical Action Permanence');
