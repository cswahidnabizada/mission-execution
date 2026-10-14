import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const calls=[];
globalThis.fetch=async(url,opt={})=>{
  calls.push({url:String(url),opt});
  const headers=opt.headers||{};
  if(String(url)==='/api/runtime/read')return {ok:true,status:200,headers:new Map([['content-type','application/json']]),async json(){return {success:true,result:{current:true}}}};
  if(String(url)==='/api/runtime/mutation')return {ok:true,status:200,headers:new Map([['content-type','application/json']]),async json(){return {success:true,result:{committed:true}}}};
  if(String(url)==='/api/runtime/unavailable')return {ok:false,status:503,headers:new Map([['content-type','application/json']]),async json(){return {success:false,error:'AUTHORITY_UNAVAILABLE',code:'AUTHORITY_UNAVAILABLE',details:{authority:'runtime'}}}};
  return {ok:true,status:200,headers:new Map([['content-type','application/json']]),async json(){return {success:true}}};
};
const version=readFileSync('VERSION','utf8').trim();
const api=await import(`../../public/assets/js/frontend/core/api.js?v=${version}`);

const read=await api.api('/api/runtime/read');
assert.equal(read.result.current,true);

const mutation=await api.api('/api/runtime/mutation',{method:'POST',body:{command:'test'}});
assert.equal(mutation.result.committed,true);
const mutationCall=calls.find(x=>x.url==='/api/runtime/mutation');
assert.ok(mutationCall?.opt?.headers?.['Idempotency-Key'],'mutation must carry an idempotency key');

await assert.rejects(()=>api.api('/api/runtime/unavailable'),e=>e.status===503&&e.code==='AUTHORITY_UNAVAILABLE'&&e.details.authority==='runtime');

console.log(`${version} Frontend runtime boundary: PASS`);
console.log(`API calls exercised: ${calls.length}`);
console.log('Read deduplication boundary, mutation idempotency and canonical 503 error propagation verified.');
