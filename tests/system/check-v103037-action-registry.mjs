import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ACTION_REGISTRY,ACTION_CODES} from '../../src/worker/application/actions/action-registry.js';
import {ACTION_SERVICE_MAP} from '../../src/worker/application/actions/action-service-map.js';
import {auditActionRegistry} from '../../src/worker/extensions/actions-intelligence/action-registry-audit.js';
const root=process.cwd();
const uiRegistry=fs.readFileSync(`${root}/public/assets/js/core/action-registry.js`,'utf8');
const bridge=fs.readFileSync(`${root}/public/assets/js/extensions/canonical-action-experience-103037.js`,'utf8');
const html=fs.readFileSync(`${root}/public/admin.html`,'utf8');
const dmc=fs.readFileSync(`${root}/public/assets/js/extensions/dashboard-mission-context-103037.js`,'utf8');
const dash=fs.readFileSync(`${root}/public/assets/js/extensions/dashboard-experience-103037.js`,'utf8');
assert.equal(Object.keys(ACTION_REGISTRY).length,46);
assert.equal(Object.keys(ACTION_SERVICE_MAP).length,46);
assert.deepEqual(auditActionRegistry(),[]);
for(const code of Object.keys(ACTION_REGISTRY)){
  assert.equal(ACTION_REGISTRY[code].id,code,`${code}: stable identity missing`);
  assert.equal(ACTION_REGISTRY[code].canonical,true,`${code}: not canonical`);
  assert.ok(ACTION_SERVICE_MAP[code],`${code}: missing service map`);
}
assert.equal(Object.values(ACTION_CODES).length,46);
assert.ok(uiRegistry.includes('ACTION_ID_LIST')&&uiRegistry.includes('ACTION_GROUPS'));
assert.ok(bridge.includes('hasCanonicalAction')&&!bridge.includes('CANONICAL_CODES'));
assert.ok(dmc.includes('hasCanonicalAction')&&dmc.includes('ACTION_GROUPS'));
assert.ok(dash.includes('canonicalActionId')&&dash.includes('openCanonicalMissionAction'));
assert.ok(html.includes('dashboard-experience-103037.js'));
assert.ok(html.includes('dashboard-experience-103037.css'));
const routes=fs.readFileSync(`${root}/src/worker/extensions/actions-intelligence/actions-intelligence.routes.js`,'utf8');
assert.ok(routes.includes('/api\\/actions\\/registry'));
console.log('10.30.37 canonical Action Registry + A→G migration gate: PASS');
