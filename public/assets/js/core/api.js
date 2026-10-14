import {resilientRead} from "../extensions/runtime-resilience.js";

const inflightReads=new Map();

function readCoalescingKey(url,method,headers){
  if(!["GET","HEAD"].includes(method))return null;
  // Only coalesce requests whose response is identical by URL + request headers.
  // AbortSignal-bearing reads stay independent so one consumer cannot cancel another.
  const pairs=[];
  headers.forEach((value,key)=>pairs.push([String(key).toLowerCase(),String(value)]));
  pairs.sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
  return `${method} ${String(url||"")} ${JSON.stringify(pairs)}`;
}

function coalesceRead(key,request){
  if(!key)return request();
  const existing=inflightReads.get(key);
  if(existing)return existing;
  const pending=Promise.resolve().then(request);
  inflightReads.set(key,pending);
  pending.finally(()=>{if(inflightReads.get(key)===pending)inflightReads.delete(key);}).catch(()=>{});
  return pending;
}

export async function api(url, options = {}) {
  const method=String(options.method||"GET").toUpperCase();
  const headers=new Headers(options.headers||{});

  // Protected mission mutations must never be sent tokenless.  Older UI rows,
  // optional coordination loads, or a freshly opened progressive control can
  // temporarily know the mission but not yet carry its state token.  In that
  // narrow case, resolve canonical mission truth before the mutation.  An
  // already-bound action token is NEVER replaced here.
  if(!["GET","HEAD"].includes(method)&&!headers.has("X-Mission-State-Token")){
    const missionId=protectedMissionIdFromRequest(url,options);
    if(missionId){
      const token=await fetchCanonicalMissionStateToken(missionId,url);
      if(token)headers.set("X-Mission-State-Token",token);
    }
  }

  if(!["GET","HEAD"].includes(method)&&!headers.has("X-Idempotency-Key")){
    headers.set("X-Idempotency-Key",globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`);
  }
  const readKey=options.signal?null:readCoalescingKey(url,method,headers);
  const performRead=async(signal)=>{
    const response = await fetch(url, { credentials: "same-origin", ...options, signal, headers });
    const type = response.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await response.json() : null;
    return {response,data};
  };
  const readKeyForResilience=options.signal?`api:${method}:${String(url||"")}:signal:${Math.random().toString(36).slice(2)}`:`api:${method}:${String(url||"")}`;
  const read=()=>resilientRead(readKeyForResilience,async signal=>performRead(signal),{signal:options.signal,maxAttempts:3});
  const {response,data}=await coalesceRead(readKey,read);
  if (!response.ok) {
    const code=String(data?.error||`HTTP_${response.status}`);
    const friendly=code==="MISSION_CHANGED"
      ?"Mission changed. The latest valid action is now shown."
      :code==="MISSION_STATE_TOKEN_REQUIRED"
        ?"Mission changed. Refresh and use the latest valid action."
        :code==="ACTION_ALREADY_PROCESSING"
          ?"This action is already processing."
          :code==="TRANSITION_OUTCOME_UNCERTAIN"
            ?"The previous action is being reconciled. Mission state was not changed blindly; refresh the mission context before continuing."
            :code==="MISSION_EVENT_COMMIT_FAILED"
              ?"The action reached the execution boundary but its final confirmation is being reconciled. Refresh the mission context before continuing."
              :(data?.message||data?.error||`Request failed (${response.status})`);
    const error=new Error(friendly);
    error.code=code;error.status=response.status;error.details=data?.details||null;error.payload=data||null;
    if(["MISSION_CHANGED","MISSION_STATE_TOKEN_REQUIRED"].includes(code)){
      window.dispatchEvent(new CustomEvent("onmission:stale-mission",{detail:{url,code,status:response.status,details:data?.details||null}}));
    }
    throw error;
  }
  const stateToken=findStateToken(data);
  if(stateToken){
    const missionId=missionIdFromExchange(url,options,data);
    window.dispatchEvent(new CustomEvent("onmission:state-advanced",{detail:{url,method,missionId,stateToken}}));
  }
  return data;
}


function protectedMissionIdFromRequest(url,options={}){
  const method=String(options.method||"GET").toUpperCase();
  if(["GET","HEAD"].includes(method))return null;
  const path=String(url||"");

  if(path==="/api/missions/status"){
    try{return Number(JSON.parse(options?.body||"{}")?.missionId||0)||null;}catch{return null;}
  }

  const protectedPatterns=[
    /^\/api\/mission-management\/missions\/(\d+)\/intents\/[a-z_]+(?:\?|$)/,
    /^\/api\/network\/missions\/(\d+)\/invite(?:\?|$)/,
    /^\/api\/shared\/missions\/(\d+)\/driver(?:\?|$)/,
    /^\/api\/public\/missions\/(\d+)\/request(?:\?|$)/,
    /^\/api\/missions\/(\d+)\/(?:driver-assignment|assignment|execution\/reclaim|delivery-proof)(?:\?|$)/,
    /^\/api\/missions\/(\d+)\/distribution\/(?:withdraw-foryou|withdraw-network)(?:\?|$)/,
    /^\/api\/missions\/(\d+)\/exceptions(?:\/\d+\/resolve)?(?:\?|$)/,
    /^\/api\/missions\/(\d+)(?:\?|$)/
  ];
  for(const pattern of protectedPatterns){
    const match=path.match(pattern);
    if(match)return Number(match[1])||null;
  }
  return null;
}

async function fetchCanonicalMissionStateToken(missionId,path=""){
  try{
    // Marketplace requests may target a mission owned by another tenant. The
    // requester is intentionally not authorized for tenant-scoped mission details,
    // so the canonical token must come from the public marketplace projection.
    if(/^\/api\/public\/missions\/\d+\/request(?:\?|$)/.test(String(path||""))){
      const response=await fetch(`/api/public/missions`,{method:"GET",credentials:"same-origin",headers:{"Accept":"application/json"}});
      if(response.ok){
        const data=await response.json().catch(()=>null);
        const row=(Array.isArray(data?.missions)?data.missions:[]).find(x=>Number(x?.id)===Number(missionId));
        const version=Number(row?.state_version||0);
        if(version>0)return `v:${version}`;
      }
      return null;
    }
    const response=await fetch(`/api/missions/${Number(missionId)}/details`,{
      method:"GET",
      credentials:"same-origin",
      headers:{"Accept":"application/json"}
    });
    if(!response.ok)return null;
    const data=await response.json().catch(()=>null);
    const explicit=String(data?.stateToken||"");
    if(explicit.startsWith("v:"))return explicit;
    const version=Number(data?.mission?.state_version||0);
    return version>0?`v:${version}`:null;
  }catch{
    return null;
  }
}

function findStateToken(data){
  const values=[
    data?.stateToken,
    data?.mission?.stateToken,
    data?.proof?.stateToken,
    data?.exception?.stateToken,
    data?.result?.stateToken
  ];
  const token=values.find(v=>typeof v==="string"&&v.startsWith("v:"));
  return token||null;
}
function missionIdFromExchange(url,options,data){
  const direct=Number(data?.missionId||data?.mission?.id||data?.proof?.mission_id||data?.exception?.mission_id||0);
  if(direct)return direct;
  const path=String(url||"");
  const patterns=[
    /\/api\/mission-management\/missions\/(\d+)/,
    /\/api\/network\/missions\/(\d+)/,
    /\/api\/public\/missions\/(\d+)/,
    /\/api\/shared\/missions\/(\d+)/,
    /\/api\/missions\/(\d+)/
  ];
  for(const pattern of patterns){const m=path.match(pattern);if(m)return Number(m[1]);}
  if(path==="/api/missions/status"){
    try{return Number(JSON.parse(options?.body||"{}")?.missionId||0)||null;}catch{return null;}
  }
  return null;
}

export function jsonOptions(method, body, {expectedUpdatedAt=null,idempotencyKey=null}={}) {
  const headers={"Content-Type":"application/json"};
  if(expectedUpdatedAt)headers["X-Mission-State-Token"]=String(expectedUpdatedAt);
  if(idempotencyKey)headers["X-Idempotency-Key"]=String(idempotencyKey);
  return { method, headers, body: JSON.stringify(body) };
}
