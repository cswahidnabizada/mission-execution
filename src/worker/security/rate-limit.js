export async function consumeRateLimit(env,key,{limit=10,windowSeconds=900}={}){
  const storageKey=`ratelimit:${key}`;

  if(env.DB){
    try{
      const row=await env.DB.prepare(`
        INSERT INTO security_rate_limits(rate_key,request_count,window_expires_at,updated_at)
        VALUES (?,1,datetime('now',? || ' seconds'),CURRENT_TIMESTAMP)
        ON CONFLICT(rate_key) DO UPDATE SET
          request_count=CASE
            WHEN datetime(security_rate_limits.window_expires_at)<=datetime('now') THEN 1
            ELSE security_rate_limits.request_count+1
          END,
          window_expires_at=CASE
            WHEN datetime(security_rate_limits.window_expires_at)<=datetime('now')
              THEN datetime('now',? || ' seconds')
            ELSE security_rate_limits.window_expires_at
          END,
          updated_at=CURRENT_TIMESTAMP
        RETURNING request_count,window_expires_at
      `).bind(storageKey,String(Number(windowSeconds)),String(Number(windowSeconds))).first();

      if(Number(row?.request_count||0)>Number(limit)){
        const error=new Error("TOO_MANY_ATTEMPTS");
        error.status=429;
        throw error;
      }
      return;
    }catch(error){
      if(error?.message==="TOO_MANY_ATTEMPTS")throw error;
      if(!/no such table:\s*security_rate_limits/i.test(String(error?.message||"")))throw error;
      if(String(env.SECURITY_STRICT_MODE||"").toLowerCase()==="true"){
        const unavailable=new Error("SECURITY_RATE_LIMIT_STORAGE_UNAVAILABLE");
        unavailable.status=503;
        throw unavailable;
      }
    }
  }

  // Rolling-deploy fallback only. Production should set SECURITY_STRICT_MODE=true
  // after migration 0008 so security-sensitive rate limits fail closed to D1.
  const raw=await env.KV_BINDING.get(storageKey);
  const current=raw?Number(raw)||0:0;
  if(current>=limit){
    const error=new Error("TOO_MANY_ATTEMPTS");
    error.status=429;
    throw error;
  }
  await env.KV_BINDING.put(storageKey,String(current+1),{expirationTtl:windowSeconds});
}

export async function clearRateLimit(env,key){
  const storageKey=`ratelimit:${key}`;
  if(env.DB){
    try{await env.DB.prepare(`DELETE FROM security_rate_limits WHERE rate_key=?`).bind(storageKey).run();}catch{}
  }
  try{await env.KV_BINDING.delete(storageKey);}catch{}
}

export function requestIp(request){
  return request.headers.get("CF-Connecting-IP")||"unknown";
}
