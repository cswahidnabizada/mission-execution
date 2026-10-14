const TTL_SECONDS=60;
const MAX_ACTIONS=10;
export const OPERATIONAL_ACCESS_VERSION='1.1.0';
export const OPERATIONAL_ACCESS_TTL_SECONDS=TTL_SECONDS;
export const OPERATIONAL_ACCESS_MAX_ACTIONS=MAX_ACTIONS;
export function operationalAccessKey(token){return `operational-access:${String(token||'').slice(0,180)}`;}
async function tokenHash(token){
  const bytes=new TextEncoder().encode(String(token||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function readLeaseRecord(env,token){
  if(!env?.DB||!token)return null;
  try{return await env.DB.prepare(`SELECT token_hash,issued_at,expires_at,action_count FROM operational_access_leases WHERE token_hash=? LIMIT 1`).bind(await tokenHash(token)).first();}catch{return null;}
}
export async function readOperationalAccess(env,token){
  if(!token||!env?.KV_BINDING)return null;
  try{
    const raw=await env.KV_BINDING.get(operationalAccessKey(token));if(!raw)return null;
    const v=JSON.parse(raw);if(Number(v.expiresAt||0)<=Date.now())return null;
    const lease=await readLeaseRecord(env,token);
    if(lease){if(Number(lease.expires_at||0)<=Date.now())return null;v.actionCount=Number(lease.action_count||0);v.issuedAt=Number(lease.issued_at||v.issuedAt||0);v.expiresAt=Number(lease.expires_at||v.expiresAt||0);}
    return v;
  }catch{return null;}
}
export async function writeOperationalAccess(env,token,snapshot){
  if(!token||!env?.KV_BINDING)return false;
  const issuedAt=Date.now(),expiresAt=issuedAt+TTL_SECONDS*1000,hash=await tokenHash(token);
  const value={version:OPERATIONAL_ACCESS_VERSION,issuedAt,expiresAt,actionCount:0,...snapshot};
  try{
    if(env.DB)await env.DB.prepare(`INSERT INTO operational_access_leases(token_hash,issued_at,expires_at,action_count) VALUES(?,?,?,0) ON CONFLICT(token_hash) DO UPDATE SET issued_at=excluded.issued_at,expires_at=excluded.expires_at,action_count=0`).bind(hash,issuedAt,expiresAt).run();
    await env.KV_BINDING.put(operationalAccessKey(token),JSON.stringify(value),{expirationTtl:TTL_SECONDS});
    return true;
  }catch{return false;}
}
export async function consumeOperationalAccess(env,token){
  if(!token)return null;
  // D1 is authoritative for the bounded action count. The conditional UPDATE
  // is atomic at the database level, so concurrent requests cannot both consume
  // the same action slot. KV remains a read/cache projection only.
  if(env?.DB){
    try{
      const hash=await tokenHash(token),now=Date.now();
      const result=await env.DB.prepare(`UPDATE operational_access_leases SET action_count=action_count+1 WHERE token_hash=? AND expires_at>? AND action_count<?`).bind(hash,now,MAX_ACTIONS).run();
      if(Number(result.meta?.changes||0)!==1)return null;
      const lease=await env.DB.prepare(`SELECT issued_at,expires_at,action_count FROM operational_access_leases WHERE token_hash=? LIMIT 1`).bind(hash).first();
      if(!lease||Number(lease.expires_at||0)<=now)return null;
      const current=await readOperationalAccess(env,token);
      if(!current)return null;
      const next={...current,issuedAt:Number(lease.issued_at),expiresAt:Number(lease.expires_at),actionCount:Number(lease.action_count)};
      await env.KV_BINDING?.put(operationalAccessKey(token),JSON.stringify(next),{expirationTtl:Math.max(1,Math.ceil((next.expiresAt-now)/1000))});
      return next;
    }catch{return null;}
  }
  // No database means there is no authoritative concurrency primitive. Fail
  // closed so callers re-resolve canonical authorization instead of trusting a
  // non-atomic cache counter.
  return null;
}
export async function clearOperationalAccess(env,token){
  if(!token)return;
  try{if(env?.DB)await env.DB.prepare(`DELETE FROM operational_access_leases WHERE token_hash=?`).bind(await tokenHash(token)).run();}catch{}
  if(env?.KV_BINDING)await env.KV_BINDING.delete(operationalAccessKey(token));
}
export async function clearOperationalAccessForSession(env,session){
  if(!env||!session)return;
  // Cache keys are token-scoped. The authoritative lease can be revoked by the
  // exact session token; identity-wide revocation remains bounded by TTL unless
  // the domain state itself rejects the action.
  if(session.__sessionToken)await clearOperationalAccess(env,session.__sessionToken);
}
