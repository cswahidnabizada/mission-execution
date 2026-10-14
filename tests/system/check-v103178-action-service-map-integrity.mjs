import assert from 'node:assert/strict';
import {ACTION_SERVICE_MAP,resolveActionTarget} from '../../src/worker/application/actions/action-service-map.js';
import {ACTION_REGISTRY} from '../../src/worker/application/actions/action-registry.js';

const context={missionId:246,role:'admin',forYouRequestId:111,networkInvitationId:22,openExceptionId:3,requirementId:4,payload:{}};
for(const code of Object.keys(ACTION_REGISTRY)){
  assert.ok(ACTION_SERVICE_MAP[code],`${code}: missing canonical service map`);
  const target=resolveActionTarget(code,context);
  if(ACTION_SERVICE_MAP[code].kind!=='ui' && ACTION_SERVICE_MAP[code].kind!=='navigate') assert.ok(target,`${code}: target did not resolve`);
  if(target?.kind==='api') assert.ok(target.endpoint,`${code}: API endpoint missing`);
}
const withdraw=resolveActionTarget('withdraw_foryou',context);
assert.equal(withdraw.endpoint,'/api/missions/246/distribution/withdraw-foryou');
assert.equal(withdraw.forYouRequestId,111);
console.log('10.31.79 action service-map integrity: PASS');
