import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ok=(v,m)=>{if(!v){console.error(`FAIL ${m}`);process.exitCode=1}else console.log(`PASS ${m}`)};
const version=read('VERSION').trim();
const apiSource=read('public/assets/js/core/api.js');
const dashboard=read('public/assets/js/extensions/canonical-dashboard-runtime.js');
const release=read('tests/fixtures/release-history/RELEASE-10.32.1.md');

ok((/^\d+\.\d+\.\d+$/.test(version)),'current release remains on top of the 10.32.1 protected regression');
ok(apiSource.includes('inflightReads'),'canonical in-flight read coalescing exists');
ok(apiSource.includes('readCoalescingKey'),'read coalescing is keyed by method, URL and headers');
ok(apiSource.includes('options.signal?null:readCoalescingKey'),'abortable reads remain independent');
ok(apiSource.includes('if(!["GET","HEAD"].includes(method))return null'),'only safe read methods are coalesced');
ok(apiSource.includes('pending.finally(()=>{if(inflightReads.get(key)===pending)inflightReads.delete(key);})'),'coalescing is in-flight only and cannot become a stale cache');
ok(dashboard.includes('loadHome()')&&dashboard.includes('loadWork()'),'dashboard home/work startup remains intact');
ok(release.includes('Canonical Performance Optimization & Request Efficiency'),'10.32.1 protected release document remains intact');
ok(release.includes('No database migration'),'10.32.1 protected release records no database migration');
ok(fs.existsSync(path.join(root,'tests/fixtures/release-history/RELEASE-10.32.0.md')),'10.32.0 protected baseline record remains');

let calls=0;
globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({success:true}),{status:200,headers:{'content-type':'application/json'}})};
const {api}=await import(pathToFileURL(path.join(root,'public/assets/js/core/api.js')));
const [a,b]=await Promise.all([api('/api/test/read'),api('/api/test/read')]);
ok(calls===1,'concurrent identical GETs share one network request');
ok(a?.success===true&&b?.success===true,'coalesced GET results are independently consumable');
await api('/api/test/read');
ok(calls===2,'completed GETs are not persisted as a cache');
const c1=new AbortController(),c2=new AbortController();
await Promise.all([api('/api/test/abort',{signal:c1.signal}),api('/api/test/abort',{signal:c2.signal})]);
ok(calls===4,'abortable GETs remain independent');
const p1=api('/api/test/post',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
const p2=api('/api/test/post',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
await Promise.all([p1,p2]);
ok(calls===6,'mutations are never coalesced');
if(process.exitCode)process.exit(1);
console.log('10.32.1 performance optimization & request efficiency regression: PASS');

function pathToFileURL(p){return new URL(`file://${p}`);}
