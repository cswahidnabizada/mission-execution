import assert from 'node:assert/strict';
import {evaluateSecuredActionAuthorization} from '../../src/worker/extensions/action-execution/secured-action-authorization.contract.js';
const mission={id:242,status:'Pending',company_id:7};
const owner={identityId:'a1',tenantId:7,role:'admin'};
const ownerAccess={tenantId:7,accessKind:'owner',mission};
const ownerAdminAccess={tenantId:7,accessKind:'owner-admin',mission};
const foreign={identityId:'a2',tenantId:8,role:'admin'};
const foreignAccess={tenantId:7,accessKind:'shared-tenant',mission};
for(const code of ['share_network','share_foryou']){
  for(const access of [ownerAccess,ownerAdminAccess]){
    const a=evaluateSecuredActionAuthorization({session:owner,access,actionCode:code,mission});
    assert.equal(a.authorized,true,`${code} owner admin must authorize`);
    assert.equal(a.reasons.includes('responsibility_not_held'),false,`${code} must not fail responsibility for owner`);
  }
  const f=evaluateSecuredActionAuthorization({session:foreign,access:foreignAccess,actionCode:code,mission});
  assert.equal(f.authorized,false,`${code} foreign admin must remain denied`);
}
console.log('10.30.33 sharing authority regression: PASS');
