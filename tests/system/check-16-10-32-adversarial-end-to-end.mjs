import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Router,matchRoute} from '../../src/worker/core/router.js';

const version=fs.readFileSync('VERSION','utf8').trim();
assert.equal(version,'16.10.32');

// Regression for the production defect: string route declarations containing
// :param used to be compared literally, causing API route not found responses.
const cases=[
  ['/api/platform/admin/objective-runs/:runId','/api/platform/admin/objective-runs/run-abc',{runId:'run-abc'}],
  ['/api/platform/admin/objective-runs/:runId/input','/api/platform/admin/objective-runs/run-abc/input',{runId:'run-abc'}],
  ['/api/platform/admin/objective-runs/:runId/outcome/reconcile','/api/platform/admin/objective-runs/run-abc/outcome/reconcile',{runId:'run-abc'}],
  ['/api/platform/admin/objective-approvals/:approvalId/decide','/api/platform/admin/objective-approvals/approval-123/decide',{approvalId:'approval-123'}],
  ['/api/platform/admin/agentic-control/pilots/:pilotId/missions/:missionId/enroll','/api/platform/admin/agentic-control/pilots/pilot-1/missions/42/enroll',{pilotId:'pilot-1',missionId:'42'}]
];
for(const [pattern,path,params] of cases){const match=matchRoute(pattern,path);assert.equal(match.matched,true,`${pattern} must match ${path}`);assert.deepEqual(match.params,params);}
assert.equal(matchRoute('/api/platform/admin/objective-runs/:runId','/api/platform/admin/objective-runs/a/extra').matched,false,'route must be exact');
assert.equal(matchRoute('/api/platform/admin/objective-runs/:runId','/api/platform/admin/objective-runs/').matched,false,'empty parameter must not match');
assert.equal(matchRoute('/api/platform/admin/objective-runs/:runId','/api/platform/admin/objective-runs/a%2Fb').matched,false,'encoded slash must not escape a route segment');
assert.equal(matchRoute('/api/platform/admin/objectives','/api/platform/admin/objectives').matched,true,'static routes must remain unchanged');

// Exercise the actual router dispatch path as well as the pure matcher.
const routerInstance=new Router();
routerInstance.get('/api/test-objectives/:runId',({params})=>new Response(JSON.stringify({runId:params.runId}),{headers:{'Content-Type':'application/json'}}));
const dispatched=await routerInstance.fetch(new Request('https://unit.test/api/test-objectives/run-live-123'),{},{});
assert.equal(dispatched.status,200,'parameterized string route must dispatch instead of 404');
assert.deepEqual(await dispatched.json(),{runId:'run-live-123'});

const routerSource=fs.readFileSync('src/worker/core/router.js','utf8');
assert.match(routerSource,/Route declarations throughout the worker use Express-style/);
const command=fs.readFileSync('src/worker/modules/admin-control/command-center.service.js','utf8');
assert.match(command,/COUNT\(DISTINCT c\.id\) count/,'organization metrics must count canonical active organizations');
assert.match(command,/c\.deletion_status='active'/,'organization metrics must exclude deleted organizations');
const control=fs.readFileSync('src/worker/modules/admin-control/control-plane.service.js','utf8');
assert.match(control,/SELECT COUNT\(\*\) count FROM companies WHERE deletion_status='active'/,'organization overview must not use a capped 100-row list as the total');
assert.match(control,/FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id ORDER BY c.id DESC LIMIT 100/,'specialist company listing must retain the bounded recovery/admin inventory');
assert.match(control,/companyCount\.warning\?null:Number\(companyCount\.data\?\.count\|\|0\)/,'failed count reads must be unavailable, not fake zero');
const ui=fs.readFileSync('public/assets/js/frontend/admin/command-center.js','utf8');
assert.match(ui,/x\.latest_run_id\|\|'No run'/,'objective list must make missing run IDs explicit');
assert.match(ui,/API route not found|Objective history unavailable/,'UI must surface objective API failures rather than infer success');
console.log('16.10.32 adversarial route + canonical organization-count regression: PASS');
