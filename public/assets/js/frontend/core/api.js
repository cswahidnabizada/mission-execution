const mutationMethod=method=>['POST','PUT','PATCH','DELETE'].includes(String(method||'GET').toUpperCase());
const readInFlight=new Map();
export async function api(path,options={}){
  const headers={Accept:'application/json',...(options.headers||{})};
  const method=String(options.method||'GET').toUpperCase();
  if(mutationMethod(method)&&!headers['Idempotency-Key']&&!headers['idempotency-key'])headers['Idempotency-Key']=crypto.randomUUID();
  const request={credentials:'same-origin',cache:'no-store',...options,headers};
  if(request.body&&typeof request.body==='object'&&!(request.body instanceof FormData)&&!(request.body instanceof Blob)&&!(request.body instanceof ArrayBuffer))request.body=JSON.stringify(request.body);
  const key=method==='GET'?String(path):null;
  if(key&&readInFlight.has(key))return readInFlight.get(key);
  const execute=(async()=>{
    const r=await fetch(path,request);
    const type=r.headers.get('content-type')||'';
    const d=type.includes('json')?await r.json().catch(()=>({})):{}; 
    if(!r.ok||d.success===false){
      const e=new Error(d.error||d.message||`Request failed (${r.status})`);
      e.status=r.status;e.code=d.code||d.error||`HTTP_${r.status}`;e.details=d.details||d.errorContract||null;e.payload=d;throw e;
    }
    return d;
  })();
  if(key){
    readInFlight.set(key,execute);
    execute.finally(()=>{if(readInFlight.get(key)===execute)readInFlight.delete(key)}).catch(()=>{});
  }
  return execute;
}
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
