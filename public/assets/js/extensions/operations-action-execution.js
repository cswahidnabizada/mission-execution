import {executeActionTarget as executeSecuredActionTarget} from "./actions-intelligence.js?v=16.10.14-h3";
import {recordActionExecutionTelemetry} from "./operations-action-telemetry.js?v=16.10.14";

export async function executeAction(action,handlers={},options={}){
  const startedAt=Date.now();
  const missionId=Number(options.missionId||action?.missionId||0)||null;
  const actionCode=String(action?.code||"").slice(0,120);
  const context={missionId,actionCode};
  void recordActionExecutionTelemetry({...context,phase:"presented"});
  try{
    void recordActionExecutionTelemetry({...context,phase:"started"});
    const result=await executeSecuredActionTarget(action,handlers,options);
    void recordActionExecutionTelemetry({...context,phase:result?"succeeded":"abandoned",outcome:result?"success":"abandoned",durationMs:Date.now()-startedAt});
    return result;
  }catch(error){
    void recordActionExecutionTelemetry({...context,phase:"failed",outcome:"failed",errorCode:error?.code||error?.message,durationMs:Date.now()-startedAt});
    throw error;
  }
}
