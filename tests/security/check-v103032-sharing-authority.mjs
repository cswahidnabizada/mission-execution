import assert from 'node:assert/strict';
import {evaluateSecuredActionAuthorization} from '../../src/worker/extensions/action-execution/secured-action-authorization.contract.js';

const mission={id:242,status:'Pending',company_id:7};
const owner={identityId:'a1',tenantId:7,role:'admin'};
const ownerAccess={tenantId:7,accessKind:'owner',mission};
const sharedAccess={tenantId:7,accessKind:'shared-tenant',mission};

for (const code of ['share_network','share_foryou']) {
  const allowed=evaluateSecuredActionAuthorization({session:owner,access:ownerAccess,actionCode:code,mission});
  assert.equal(allowed.authorized,true,`${code} owner admin should be authorized`);
  assert.equal(allowed.reasons.includes('responsibility_not_held'),false,`${code} must not require execution responsibility`);
  const denied=evaluateSecuredActionAuthorization({session:owner,access:sharedAccess,actionCode:code,mission});
  assert.equal(denied.authorized,false,`${code} shared tenant must be denied`);
  assert.equal(denied.reasons.includes('responsibility_not_held'),true,`${code} shared tenant must remain responsibility denied`);
}
console.log('10.30.32 sharing authority regression: PASS');
