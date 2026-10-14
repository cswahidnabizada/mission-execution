const PHASES=new Set(["presented","selected","preflighted","started","authorized","succeeded","failed","stale","recovered","abandoned","next_action_generated","workspace_reconciled"]);
const MAX_QUEUE=24;
const FLUSH_DELAY=250;
let queue=[];
let flushTimer=null;
let sequence=0;
const traceId=(()=>{try{return crypto.randomUUID()}catch{return `ops-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}})();

function scheduleFlush(){
  if(flushTimer)return;
  flushTimer=setTimeout(()=>{flushTimer=null;void flush();},FLUSH_DELAY);
}

async function flush(){
  if(!queue.length)return false;
  const batch=queue.splice(0,MAX_QUEUE);
  try{
    const response=await fetch("/api/telemetry/action-execution",{
      method:"POST",credentials:"same-origin",keepalive:true,
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({events:batch})
    });
    if(!response.ok&&queue.length<MAX_QUEUE)queue.unshift(...batch.slice(-Math.max(0,MAX_QUEUE-queue.length)));
    return response.ok;
  }catch{
    if(queue.length<MAX_QUEUE)queue.unshift(...batch.slice(-Math.max(0,MAX_QUEUE-queue.length)));
    return false;
  }
}

export function recordActionExecutionTelemetry({missionId=null,actionCode="",phase,outcome=null,durationMs=null,errorCode=null}={}){
  if(!PHASES.has(String(phase||"")))return Promise.resolve(false);
  const payload={
    missionId:Number(missionId)||null,
    actionCode:String(actionCode||"").slice(0,120),
    phase:String(phase),
    outcome:outcome?String(outcome).slice(0,40):null,
    durationMs:Number.isFinite(Number(durationMs))?Math.max(0,Math.round(Number(durationMs))):null,
    errorCode:errorCode?String(errorCode).slice(0,120):null,
    traceId,
    sequence:++sequence,
    clientTimestamp:new Date().toISOString()
  };
  if(!payload.actionCode)return Promise.resolve(false);
  queue.push(payload);
  if(queue.length>=MAX_QUEUE)return flush();
  scheduleFlush();
  return Promise.resolve(true);
}

export function flushActionExecutionTelemetry(){return flush();}

try{window.addEventListener("pagehide",()=>{if(queue.length)void flush();},{capture:true});}catch{}
