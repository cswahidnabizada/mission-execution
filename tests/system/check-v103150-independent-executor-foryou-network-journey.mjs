import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8');
const access=read('src/worker/security/mission-access.js');
const missions=read('src/worker/modules/missions/missions.service.js');
const publicRepo=read('src/worker/repositories/public.repository.js');
const publicService=read('src/worker/modules/public/public.service.js');
const publicRoutes=read('src/worker/modules/public/public.routes.js');
const registry=read('src/worker/application/actions/action-registry.js');
const uiRegistry=read('public/assets/js/core/action-registry.js');
const cap=read('src/worker/extensions/actions-intelligence/action-capability.engine.js');
const contract=read('src/worker/extensions/actions-intelligence/action-contract.engine.js');
const map=read('src/worker/application/actions/action-service-map.js');
const auth=read('src/worker/extensions/action-execution/secured-action-authorization.contract.js');
const dashboard=read('public/assets/js/pages/canonical-role-workspace.js');
const html=read('public/driver/dashboard.html');
for(const [src,need] of [
 [access,'if(session.role==="executor")'],
 [access,'accessKind:"pending-foryou"'],
 [access,'accessKind:"foryou-discovery"'],
 [missions,'incomingNetwork'],
 [missions,'publicOpportunities'],
 [missions,'source:"network"'],
 [missions,'source:pending?"foryou-pending":"foryou"'],
 [publicRepo,'createExecutorPublicRequest'],
 [publicService,'if(session.role==="executor")'],
 [publicService,'createExecutorPublicRequest'],
 [publicRoutes,'requestMission(env,missionId,session'],
 [registry,'REQUEST_FORYOU_MISSION:"request_foryou_mission"'],
 [registry,'CANCEL_FORYOU_REQUEST:"cancel_foryou_request"'],
 [uiRegistry,'"request_foryou_mission"'],
 [uiRegistry,'"cancel_foryou_request"'],
 [cap,'ctx.accessKind==="foryou-discovery"'],
 [cap,'ctx.accessKind==="pending-foryou"'],
 [contract,'accessKind==="foryou-discovery"'],
 [contract,'accessKind==="pending-foryou"'],
 [map,'request_foryou_mission:route("foryou"'],
 [map,'cancel_foryou_request:route("foryou"'],
 [auth,'code==="request_foryou_mission"'],
 [auth,'code==="cancel_foryou_request"'],
 [dashboard,'sourceLabel(m)'],
 [dashboard,'m?.accessKind==="foryou-discovery"'],
 [dashboard,'m?.accessKind==="pending-foryou"'],
 [dashboard,'m?.accessKind==="pending-network"'],
 [dashboard,'return "request_foryou_mission"'],
 [dashboard,'return "cancel_foryou_request"'],
 [dashboard,'return "accept_network"'],
 [html,'data-category="foryou"'],
 [html,'data-category="network"']
]) assert.ok(src.includes(need),`missing ${need}`);
// The dashboard must not present the same mission twice when a public/network
// representation overlaps with active execution or another source.
assert.ok(missions.includes('if(!id||byId.has(id))continue'),'missing executor mission de-duplication');
// The public request route remains the single canonical mutation path for both
// tenant and independent-executor ForYou requesters.
assert.ok(publicRoutes.includes('requestMission(env,missionId,session'),'ForYou route bypasses canonical service');
for(const f of [
 'src/worker/security/mission-access.js',
 'src/worker/modules/missions/missions.service.js',
 'src/worker/repositories/public.repository.js',
 'src/worker/modules/public/public.service.js',
 'src/worker/modules/public/public.routes.js',
 'src/worker/application/actions/action-registry.js',
 'src/worker/extensions/actions-intelligence/action-capability.engine.js',
 'src/worker/extensions/actions-intelligence/action-contract.engine.js',
 'src/worker/application/actions/action-service-map.js',
 'src/worker/extensions/action-execution/secured-action-authorization.contract.js',
 'public/assets/js/pages/canonical-role-workspace.js'
]) execFileSync(process.execPath,['--check',f]);
console.log('10.31.50 Independent Executor ForYou + Trusted Network dashboard journey: PASS');
