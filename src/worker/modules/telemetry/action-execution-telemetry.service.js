import {getForSession} from "../missions/missions.service.js";

const PHASES=new Set(["presented","selected","preflighted","started","authorized","succeeded","failed","stale","recovered","abandoned","next_action_generated","workspace_reconciled"]);
const OUTCOMES=new Set(["success","failed","abandoned","stale","recovered","null"]);

export function normalizeTelemetryInput(body={}){
  const phase=String(body.phase||"").trim();
  if(!PHASES.has(phase))throw error("Invalid telemetry phase",400,"TELEMETRY_PHASE_INVALID");
  const actionCode=String(body.actionCode||"").trim().slice(0,120);
  if(!/^[A-Za-z0-9_.:-]{1,120}$/.test(actionCode))throw error("Invalid telemetry action",400,"TELEMETRY_ACTION_INVALID");
  const missionId=Number(body.missionId||0)||null;
  const duration=body.durationMs==null?null:Number(body.durationMs);
  if(duration!==null&&(!Number.isFinite(duration)||duration<0||duration>86400000))throw error("Invalid telemetry duration",400,"TELEMETRY_DURATION_INVALID");
  const outcome=body.outcome==null?null:String(body.outcome).slice(0,40);
  if(outcome!==null&&!OUTCOMES.has(outcome))throw error("Invalid telemetry outcome",400,"TELEMETRY_OUTCOME_INVALID");
  const traceId=String(body.traceId||"").trim().slice(0,128);
  if(traceId&&!/^[A-Za-z0-9._:-]{8,128}$/.test(traceId))throw error("Invalid telemetry trace",400,"TELEMETRY_TRACE_INVALID");
  const sequence=body.sequence==null?null:Number(body.sequence);
  if(sequence!==null&&(!Number.isInteger(sequence)||sequence<1||sequence>1000000000))throw error("Invalid telemetry sequence",400,"TELEMETRY_SEQUENCE_INVALID");
  return Object.freeze({missionId,actionCode,phase,outcome,durationMs:duration===null?null:Math.round(duration),errorCode:body.errorCode?String(body.errorCode).slice(0,120):null,clientTimestamp:validClientTimestamp(body.clientTimestamp),traceId:traceId||null,sequence});
}

function validClientTimestamp(value){
  if(!value)return null;
  const t=Date.parse(String(value));
  if(!Number.isFinite(t))return null;
  const now=Date.now();
  if(t<now-86400000||t>now+300000)return null;
  return new Date(t).toISOString();
}

export async function recordActionExecutionTelemetry(env,session,input,{requestId=null}={}){
  const data=normalizeTelemetryInput(input);
  let mission=null;
  if(data.missionId){
    // Access is checked before recording tenant-scoped mission telemetry. The
    // telemetry service never becomes a substitute for mission authorization.
    mission=await getForSession(env,session,data.missionId);
    if(!mission)throw error("Mission not found or access denied",404,"MISSION_NOT_FOUND");
  }
  try{
    await env.DB.prepare(`
      INSERT INTO action_execution_telemetry(
        company_id,mission_id,actor_role,action_code,phase,outcome,duration_ms,
        error_code,request_id,client_timestamp,trace_id,event_sequence,created_at,expires_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,datetime('now','+90 days'))
    `).bind(
      Number(session?.tenantId||mission?.company_id||0)||null,
      data.missionId,
      String(session?.role||"unknown"),
      data.actionCode,
      data.phase,
      data.outcome,
      data.durationMs,
      data.errorCode,
      requestId?String(requestId).slice(0,128):null,
      data.clientTimestamp,
      data.traceId,
      data.sequence
    ).run();
    return {recorded:true};
  }catch(err){
    // Observability must never break mission execution when the telemetry table
    // is temporarily unavailable during a rolling deployment.
    if(/no such table:\s*action_execution_telemetry/i.test(String(err?.message||"")))return {recorded:false,reason:"table_unavailable"};
    throw err;
  }
}

export async function recordActionExecutionTelemetryBatch(env,session,events,{requestId=null}={}){
  if(!Array.isArray(events)||events.length<1||events.length>24)throw error("Invalid telemetry batch",400,"TELEMETRY_BATCH_INVALID");
  const normalized=events.map(normalizeTelemetryInput);
  const missionIds=[...new Set(normalized.map(x=>Number(x.missionId||0)).filter(Boolean))];
  const missions=new Map();
  // Authorize each distinct mission once. Telemetry remains downstream of the
  // canonical mission access authority and never becomes an authorization source.
  for(const missionId of missionIds){
    const mission=await getForSession(env,session,missionId);
    if(!mission)throw error("Mission not found or access denied",404,"MISSION_NOT_FOUND");
    missions.set(missionId,mission);
  }
  const statements=normalized.map(data=>{
    const mission=data.missionId?missions.get(Number(data.missionId)):null;
    return env.DB.prepare(`
      INSERT INTO action_execution_telemetry(
        company_id,mission_id,actor_role,action_code,phase,outcome,duration_ms,
        error_code,request_id,client_timestamp,trace_id,event_sequence,created_at,expires_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,datetime('now','+90 days'))
    `).bind(
      Number(session?.tenantId||mission?.company_id||0)||null,
      data.missionId,
      String(session?.role||"unknown"),
      data.actionCode,
      data.phase,
      data.outcome,
      data.durationMs,
      data.errorCode,
      requestId?String(requestId).slice(0,128):null,
      data.clientTimestamp,
      data.traceId,
      data.sequence
    );
  });
  try{
    if(statements.length)await env.DB.batch(statements);
    return {recorded:normalized.length,received:normalized.length};
  }catch(err){
    if(/no such table:\s*action_execution_telemetry/i.test(String(err?.message||"")))return {recorded:false,reason:"table_unavailable",received:normalized.length};
    throw err;
  }
}

function error(message,status,code){const e=new Error(message);e.status=status;e.code=code;return e;}
