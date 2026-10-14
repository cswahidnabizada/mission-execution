export function clean(v,max=240){return String(v??'').trim().slice(0,max);}
export function nullable(v,max=240){const x=clean(v,max);return x||null;}
export function bad(message,status=400){const e=new Error(message);e.status=status;return e;}
export async function safeAll(query,label){try{return {data:(await query()).results||[],warning:null};}catch(error){console.error('ADMIN_CONTROL_PLANE_QUERY_FAILED',label,String(error?.message||error).slice(0,240));return {data:[],warning:label};}}
export async function safeFirst(query,label,fallback=null){try{return {data:await query(),warning:null};}catch(error){console.error('ADMIN_CONTROL_PLANE_QUERY_FAILED',label,String(error?.message||error).slice(0,240));return {data:fallback,warning:label};}}
export function parseJsonArray(v){try{const x=JSON.parse(String(v||'[]'));return Array.isArray(x)?x.map(String):[]}catch{return[]}}
