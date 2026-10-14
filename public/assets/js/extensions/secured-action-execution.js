/* Canonical legacy compatibility reference: actions-intelligence.js?v=16.10.10 */
/* ON Mission 10.35.5 — canonical application action runtime. */
import {recordActionExecutionTelemetry} from "./operations-action-telemetry.js?v=16.10.10";

async function preparePresentationAction(action,options={}){
  const missionId=Number(options.missionId||action?.missionId||0)||null;
  const token=String(options.expectedUpdatedAt||action?.stateToken||"");
  if(!missionId||!action?.code)return {ready:false,error:"Mission and action are required."};
  const headers={"Content-Type":"application/json"};if(token)headers["X-Mission-State-Token"]=token;
  const response=await fetch(`/api/secured-actions/missions/${missionId}/prepare`,{method:"POST",credentials:"same-origin",headers,body:JSON.stringify({actionCode:action.code,stateToken:token,actionPayload:options.actionPayload&&typeof options.actionPayload==="object"?options.actionPayload:{}})});
  const data=await response.json().catch(()=>null);
  if(!response.ok){
    const reasons=[...(Array.isArray(data?.problems)?data.problems:[]),...(Array.isArray(data?.preparation?.authorization?.reasons)?data.preparation.authorization.reasons:[]),...(Array.isArray(data?.preparation?.preconditions?.reasons)?data.preparation.preconditions.reasons:[])].filter(Boolean);
    const serverCode=String(data?.error||data?.code||"");
      const staleProblems=Array.isArray(data?.problems)?data.problems:[];
    const inferred=serverCode.includes("MISSION_CHANGED")||reasons.includes("stale_state_token")?"MISSION_CHANGED":serverCode||null;
    const e=new Error(data?.error||reasons.join(" · ")||`Action preparation was rejected (${response.status}).`);e.status=response.status;e.code=inferred;e.details=data;throw e;
  }
  return data?.preparation||{};
}

export async function executeAction(action,handlers={},options={}){
  const startedAt=Date.now();
  const missionId=Number(options.missionId||action?.missionId||0)||null;
  const actionCode=String(action?.code||"").slice(0,120);
  const context={missionId,actionCode};
  void recordActionExecutionTelemetry({...context,phase:"presented"});
  try{
    void recordActionExecutionTelemetry({...context,phase:"started"});
    const targetKind=String(action?.target?.kind||"");

    // Presentation actions still use the secured preparation surface because the
    // browser must resolve a local UI intent/navigation handler. No mutation is
    // performed here.
    if(targetKind==="ui"||targetKind==="navigate"){
      const preparation=await preparePresentationAction(action,options);
      if(!preparation?.preconditions?.ready){const e=new Error((preparation?.preconditions?.reasons||[]).join(" · ")||"This action is no longer ready.");e.code=preparation?.lifecycle?.state||"BLOCKED";throw e;}
      if(targetKind==="navigate"){location.href=preparation.target.href;return {result:true,preparation};}
      const fn=handlers[preparation.target.intent];if(typeof fn!=="function")throw new Error(`Action ${preparation.target.intent} is not available on this screen`);
      await fn({...action,target:preparation.target,stateToken:preparation.state.currentToken});
      return {result:true,preparation};
    }

    // All executable API/lifecycle mutations now converge on the single
    // application-level server pipeline. The server re-resolves WHAT, context,
    // authorization, policy, state token and WHERE before invoking the domain service.
    const expectedUpdatedAt=String(options.expectedUpdatedAt||action?.stateToken||"");
    const requestBody={actionCode,missionId,stateToken:expectedUpdatedAt||undefined,actionPayload:options.actionPayload&&typeof options.actionPayload==="object"?options.actionPayload:action?.input&&typeof action.input==="object"?action.input:{}};
    const send=async token=>{
      const response=await fetch("/api/actions/execute",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",...(token?{"X-Mission-State-Token":token}:{}),"X-Idempotency-Key":crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`},body:JSON.stringify({...requestBody,stateToken:token||undefined})});
      const data=await response.json().catch(()=>null);
      return {response,data};
    };
    let {response,data}=await send(expectedUpdatedAt);
    if(!response.ok||data?.success===false){
      const reasons=[...(Array.isArray(data?.problems)?data.problems:[]),...(Array.isArray(data?.preparation?.preconditions?.reasons)?data.preparation.preconditions.reasons:[])].filter(Boolean);
      const serverCode=String(data?.error||data?.code||"");
      const staleProblems=Array.isArray(data?.problems)?data.problems:[];
      // Safe stale-read recovery: the first request was rejected during the
      // canonical preparation gate, so no mutation was dispatched. Re-read
      // authoritative Truth once and retry the same action with the fresh token.
      const stale=response.status===409&&(serverCode.includes("stale_state_token")||serverCode.includes("MISSION_CHANGED")||serverCode.includes("MISSION_STATE_TOKEN_REQUIRED")||reasons.includes("stale_state_token")||reasons.includes("MISSION_STATE_TOKEN_REQUIRED")||staleProblems.includes("stale_state_token"));
      if(stale&&missionId){
        const latest=await fetch(`/api/missions/${missionId}/details?history=0`,{credentials:"same-origin",headers:{Accept:"application/json"}});
        const latestData=await latest.json().catch(()=>null);
        const freshToken=String(latestData?.stateToken||latestData?.mission?.stateToken||"");
        if(latest.ok&&freshToken&&freshToken.startsWith("v:")){
          ({response,data}=await send(freshToken));
        }
      }
      if(!response.ok||data?.success===false){
        const finalReasons=[...(Array.isArray(data?.problems)?data.problems:[]),...(Array.isArray(data?.preparation?.preconditions?.reasons)?data.preparation.preconditions.reasons:[])].filter(Boolean);
        const code=String(data?.error||data?.code||"");
        const e=new Error(data?.error||finalReasons.join(" · ")||`Canonical action failed (${response.status}).`);e.status=response.status;e.code=code;e.details=data;throw e;
      }
    }
    const result=data?.execution?.result||data?.execution||data;
    void recordActionExecutionTelemetry({...context,phase:"succeeded",outcome:"success",durationMs:Date.now()-startedAt});
    return {result,preparation:data?.preparation||null};
  }catch(error){
    void recordActionExecutionTelemetry({...context,phase:"failed",outcome:"failed",errorCode:error?.code||error?.message,durationMs:Date.now()-startedAt});
    throw error;
  }
}
