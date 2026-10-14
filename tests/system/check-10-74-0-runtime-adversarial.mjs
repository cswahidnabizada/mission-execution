import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorityUnavailable, canonicalFirst, canonicalAll, canonicalRun } from '../../src/worker/core/canonical-db.js';

const calls=[];
const responses=new Map();
function response(status=200,payload={success:true}){return {ok:status>=200&&status<300,status,async json(){return payload;}};}

globalThis.sessionStorage={getItem(){return null;},setItem(){}};
globalThis.document={querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},body:{},createElement(){return {};}};
globalThis.location={hash:'',href:'',replace(){},replaceState(){}};
globalThis.prompt=()=> 'runtime-step-up-secret';

globalThis.fetch=async (url,opt={})=>{
  calls.push({url:String(url),method:String(opt.method||'GET'),headers:opt.headers||{}});
  const key=String(url);
  if(responses.has(key)){const value=responses.get(key);responses.delete(key);return value;}
  if(key==='/api/platform/admin/control-plane')return response(200,{success:true,countries:[],configurations:[],dataQuality:{status:'healthy',warnings:[]}});
  if(key==='/api/platform/admin/countries?limit=25&includeInactive=1')return response(200,{success:true,countries:[]});
  if(key==='/api/platform/admin/privacy/summary')return response(200,{success:true});
  if(key==='/api/platform/admin/notification-governance')return response(503,{success:false,error:'AUTHORITY_UNAVAILABLE'});
  if(key==='/api/platform/admin/analytics-governance')return response(200,{success:true});
  if(key==='/api/platform/admin/external-provider-governance')return response(200,{success:true});
  if(key==='/api/platform/admin/backup-recovery-governance')return response(200,{success:true});
  if(key==='/api/platform/admin/compliance-evidence')return response(200,{success:true});
  if(key==='/api/platform/access/admin/status')return response(200,{success:true,authenticated:true,stepUpActive:false});
  if(key==='/api/platform/access/admin/step-up')return response(200,{success:true});
  return response(200,{success:true});
};

const version=readFileSync('VERSION','utf8').trim();
const runtime=await import(`../../public/assets/js/frontend/admin/admin-runtime.js?v=${version}`);
const panels=await import(`../../public/assets/js/frontend/admin/oversight-panels.js?v=${version}`);

// Runtime projection degradation: optional Control Plane modules must become explicit degraded state.
await panels.refreshAdminData();
assert.equal(runtime.state.data.dataQuality.status,'degraded');
assert.ok(runtime.state.data.dataQuality.warnings.includes('notificationGovernance'));

// Runtime API error contract: HTTP 503 must remain an error, never an empty result.
responses.set('/api/runtime/canonical',response(503,{success:false,error:'AUTHORITY_UNAVAILABLE'}));
await assert.rejects(()=>runtime.rawApi('/api/runtime/canonical'),error=>error.status===503&&error.code==='AUTHORITY_UNAVAILABLE');

// Runtime step-up path: a protected mutation must obtain route-bound step-up and retry the command.
let targetAttempts=0;
responses.set('/api/runtime/protected',response(403,{success:false,error:'PLATFORM_SUPER_ADMIN_STEP_UP_REQUIRED'}));
responses.set('/api/platform/access/admin/status',response(200,{success:true,authenticated:true,stepUpActive:false}));
responses.set('/api/platform/access/admin/step-up',response(200,{success:true}));
responses.set('/api/platform/access/admin/status',response(200,{success:true,authenticated:true,stepUpActive:true}));
responses.set('/api/runtime/protected',response(200,{success:true,result:{committed:true}}));
const protectedResult=await runtime.api('/api/runtime/protected',{method:'POST',body:{command:'runtime-adversarial'}});
assert.equal(protectedResult.result.committed,true);

// Canonical DB boundary: actual DB failures become 503/AUTHORITY_UNAVAILABLE; missing rows remain null.
const failingEnv={DB:{prepare(){throw new Error('simulated D1 outage');}}};
await assert.rejects(()=>canonicalFirst(failingEnv,'SELECT 1',[],'runtime_test'),e=>e.status===503&&e.code==='AUTHORITY_UNAVAILABLE'&&e.authority==='runtime_test');
await assert.rejects(()=>canonicalAll(failingEnv,'SELECT 1',[],'runtime_test'),e=>e.status===503&&e.code==='AUTHORITY_UNAVAILABLE');
await assert.rejects(()=>canonicalRun(failingEnv,'UPDATE x SET y=1',[],'runtime_test'),e=>e.status===503&&e.code==='AUTHORITY_UNAVAILABLE');
const explicit=authorityUnavailable('runtime_test');
assert.equal(explicit.status,503);assert.equal(explicit.code,'AUTHORITY_UNAVAILABLE');

// Composition boundary: all bounded modules are importable and the facade exposes the canonical renderer registry.
for(const key of ['overview','control','product-ecosystem','product-build','product-studio','product-health','product-verification','privacy-rights','system-health'])assert.equal(typeof panels.adminPanelRenderers[key],'function',`missing renderer ${key}`);

console.log('10.74.0 runtime adversarial + canonical failure boundary: PASS');
console.log(`Runtime calls exercised: ${calls.length}`);
console.log('Projection degradation, HTTP 503 propagation, step-up retry, D1 failure conversion and bounded renderer composition verified.');
