const REQUEST_ID_RE=/^[A-Za-z0-9._:-]{8,128}$/;

export function requestIdFor(request){
  const supplied=String(request.headers.get("X-Request-ID")||"").trim();
  return REQUEST_ID_RE.test(supplied)?supplied:crypto.randomUUID();
}

export function withRequestObservability(response,{requestId,durationMs=0}={}){
  const headers=new Headers(response.headers);
  if(requestId)headers.set("X-Request-ID",String(requestId));
  if(Number.isFinite(Number(durationMs)))headers.set("Server-Timing",`app;dur=${Math.max(0,Number(durationMs)).toFixed(1)}`);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export function performanceBucket(durationMs=0){
  const ms=Math.max(0,Number(durationMs)||0);
  if(ms<100)return "fast";
  if(ms<250)return "normal";
  if(ms<500)return "slow";
  if(ms<1000)return "very_slow";
  return "critical";
}

export function createPerformanceTrace(name="operation"){
  const started=performance.now();
  const marks=[];
  return Object.freeze({
    mark(label){
      const at=performance.now();
      marks.push({label:String(label||"stage"),durationMs:Math.max(0,at-(marks.length?marks[marks.length-1].at:started))});
      marks[marks.length-1].at=at;
      return marks[marks.length-1].durationMs;
    },
    finish(){
      const durationMs=Math.max(0,performance.now()-started);
      return Object.freeze({name:String(name),durationMs:Math.round(durationMs*10)/10,bucket:performanceBucket(durationMs),stages:marks.map(({label,durationMs})=>({label,durationMs:Math.round(durationMs*10)/10}))});
    }
  });
}

export function logPerformanceTrace({trace,requestId,route,session=null,always=false}={}){
  if(!trace)return;
  const diagnostics=String(globalThis?.ON_MISSION_PERFORMANCE_DIAGNOSTICS||"").toLowerCase()==="true";
  if(!always&&!diagnostics&&trace.durationMs<250)return;
  const payload={type:"performance_trace",requestId:String(requestId||""),route:String(route||"unknown"),name:String(trace.name||"operation"),durationMs:Math.round(Number(trace.durationMs)||0),bucket:String(trace.bucket||performanceBucket(trace.durationMs)),role:String(session?.role||"anonymous"),stages:Array.isArray(trace.stages)?trace.stages.slice(0,24):[]};
  try{console.log(JSON.stringify(payload));}catch{}
}

export function logRequest({request,requestId,status,durationMs,route="unknown",session=null,error=null}={}){
  const ms=Math.round(Number(durationMs)||0);
  // Keep logs operational and non-content-bearing: never emit bodies, cookies,
  // addresses, mission messages, names or raw authorization material.
  const diagnostics=String(globalThis?.ON_MISSION_PERFORMANCE_DIAGNOSTICS||"").toLowerCase()==="true";
  if(!error && ms<1000 && !diagnostics)return;
  const payload={
    type:"http_request",
    requestId:String(requestId||""),
    method:String(request?.method||"GET"),
    route:String(route||"unknown"),
    status:Number(status)||0,
    durationMs:ms,
    performanceBucket:performanceBucket(ms),
    role:String(session?.role||"anonymous")
  };
  if(error)payload.errorCode=String(error?.code||error?.message||"INTERNAL_ERROR").slice(0,120);
  try{console.log(JSON.stringify(payload));}catch{}
}

