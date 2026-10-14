import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildMissionContext} from '../../src/worker/modules/intelligence/mission-context.js';
import {buildMissionConditions} from '../../src/worker/modules/intelligence/mission-conditions.js';
import {deriveActionCapabilities} from '../../src/worker/extensions/actions-intelligence/action-capability.engine.js';
import {buildActionContract} from '../../src/worker/extensions/actions-intelligence/action-contract.engine.js';
import {resolveActionTarget} from '../../src/worker/application/actions/action-service-map.js';

const mission={id:249,reference:'SN:100073',company_id:1,status:'Pending',public_enabled:1,updated_at:'2026-09-13T10:00:00Z'};
const context=buildMissionContext(mission,{role:'admin',accessKind:'owner'});
const conditions=buildMissionConditions(context);
const capabilities=deriveActionCapabilities({conditions,featureState:{foryou:{pending:true,relation:'owner',id:501}}});
const contract=buildActionContract(capabilities,{conditions,featureState:{foryou:{pending:true,relation:'owner',id:501}},missionId:249,forYouRequestId:501});

const approve=contract.all.find(a=>a.code==='approve_foryou_request');
const decline=contract.all.find(a=>a.code==='decline_foryou_request');
assert.ok(approve,'owner must receive approve action');
assert.ok(decline,'owner must receive decline action');
assert.equal(approve.target?.endpoint,'/api/public/requests/501/approve');
assert.equal(decline.target?.endpoint,'/api/public/requests/501/decline');
assert.equal(approve.target?.forYouRequestId,501);
assert.equal(decline.target?.forYouRequestId,501);

const direct=resolveActionTarget('approve_foryou_request',{missionId:249,forYouRequestId:501});
assert.equal(direct?.forYouRequestId,501);
assert.equal(resolveActionTarget('decline_foryou_request',{missionId:249,forYouRequestId:501})?.forYouRequestId,501);

const map=fs.readFileSync('src/worker/application/actions/action-service-map.js','utf8');
const workspace=fs.readFileSync('public/assets/ui/canonical-mission-workspace.js','utf8');
assert.match(map,/forYouRequestId:id\(context\.forYouRequestId\)/);
assert.match(workspace,/APPROVE REQUEST/);
assert.match(workspace,/DECLINE REQUEST/);
assert.match(workspace,/data-review-action="\$\{accept\}"/);
assert.match(workspace,/runSecured\(a,body\)/);
console.log('PASS: 10.31.44 owner ForYou request management is canonical and target-complete');
