import {json,readJson} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {recordActionExecutionTelemetry,recordActionExecutionTelemetryBatch} from "./action-execution-telemetry.service.js";

export function registerTelemetryRoutes(router){
  router.post("/api/telemetry/action-execution",async({request,env,requestId})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"action-execution-telemetry",{limit:180,windowSeconds:60});
      const body=await readJson(request);
      const result=Array.isArray(body?.events)
        ? await recordActionExecutionTelemetryBatch(env,session,body.events,{requestId})
        : await recordActionExecutionTelemetry(env,session,body,{requestId});
      return json({success:true,...result},202);
    }catch(error){
      const status=Number(error?.status)||500;
      if(status>=500)console.error("ACTION EXECUTION TELEMETRY ERROR",{code:error?.code||"INTERNAL_ERROR",message:String(error?.message||"").slice(0,160)});
      return json({success:false,error:status>=500?"Telemetry unavailable":error?.message||"Telemetry rejected"},status);
    }
  });
}
