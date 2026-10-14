import fs from 'node:fs';
import assert from 'node:assert/strict';
import {deriveActionCapabilities} from '../../src/worker/extensions/actions-intelligence/action-capability.engine.js';
import {buildActionContract} from '../../src/worker/extensions/actions-intelligence/action-contract.engine.js';

// A mission may be public/ForYou while still being owned by the current tenant.
// Presentation flags must never override the authoritative resolved access kind.
const ownerPublic={
  missionId:246,role:'admin',status:'Pending',accessKind:'owner',
  mission:{id:246,public_enabled:1,status:'Pending'},
  perspective:{isOwner:true,isExecutingTenant:false,isPersonal:false},
  responsibility:{assignmentRequired:true,assignmentMutable:true,canAssign:true,responsibilityOwner:'owner'},
  source:{owned:true,shared:false,publicEnabled:true},
  assignmentFeature:{assignmentRequired:true,assignmentMutable:true},
  missingRequired:[]
};
const ownerCodes=deriveActionCapabilities(ownerPublic).capabilities.map(x=>x.code);
assert.ok(ownerCodes.includes('open_mission'));
assert.ok(ownerCodes.includes('message'));
assert.ok(!ownerCodes.includes('request_foryou_mission'));

const ownerContract=buildActionContract(deriveActionCapabilities(ownerPublic),{
  conditions:ownerPublic,
  managementActions:[
    {code:'edit_mission',label:'Edit Mission'},
    {code:'delete_mission',label:'Delete Mission'},
    {code:'cancel_mission',label:'Cancel Mission'}
  ]
});
assert.equal(ownerContract.accessKind,'owner');
assert.ok(ownerContract.all.some(x=>x.code==='edit_mission'));
assert.ok(ownerContract.all.some(x=>x.code==='delete_mission'));
assert.ok(ownerContract.all.some(x=>x.code==='cancel_mission'));
assert.ok(!ownerContract.all.some(x=>x.code==='request_foryou_mission'));

const sharedPublic={...ownerPublic,
  accessKind:'shared-tenant',
  perspective:{isOwner:false,isExecutingTenant:true,isPersonal:false},
  source:{owned:false,shared:true,publicEnabled:true},
  responsibility:{assignmentRequired:true,assignmentMutable:true,canAssign:true,canReassign:true,responsibilityOwner:'shared-tenant'}
};
const sharedCodes=deriveActionCapabilities(sharedPublic).capabilities.map(x=>x.code);
assert.ok(sharedCodes.includes('open_mission'));
assert.ok(!sharedCodes.includes('request_foryou_mission'));

const orchestrator=fs.readFileSync('src/worker/extensions/mission-flow/mission-flow.orchestrator.js','utf8');
assert.match(orchestrator,/resolveMissionAccess/);
assert.match(orchestrator,/const accessKind=String\(access\.accessKind\|\|"owner"\)/);
assert.match(orchestrator,/const authoritativeMission=access\.mission\|\|mission/);
assert.doesNotMatch(orchestrator,/function deriveAccessKind\(/);

const management=fs.readFileSync('src/worker/extensions/mission-management/mission-management.service.js','utf8');
assert.match(management,/resolveMissionAccess/);
assert.match(management,/const accessKind=String\(access\.accessKind\|\|"owner"\)/);
assert.doesNotMatch(management,/function accessKindFor\(/);

console.log('PASS: 10.31.40 authoritative access kind preserves owner/shared actions while isolating ForYou discovery');
