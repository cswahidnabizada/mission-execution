import {json} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {getForSession} from "../../modules/missions/missions.service.js";
import {listMissionExceptions} from "../../modules/attention/attention.service.js";
import {executionStateForMission} from "./execution.service.js";
import {describeExecutionTransition} from "./transition/execution-transition.service.js";

export function registerExecutionEngineRoutes(router){
  router.get(/^\/api\/execution-engine\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env),missionId=Number(params.missionId);
      const mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      const exceptions=await listMissionExceptions(env,session,missionId);
      const result=await executionStateForMission(env,session,mission,{exceptions});
      if(result.problems.length)console.warn("EXECUTION_ENGINE_CONTRACT_VIOLATION",{missionId,problems:result.problems});
      return json({success:true,execution:result.execution,problems:result.problems});
    }catch(e){return json({success:false,error:e?.message||"Execution Engine unavailable"},e?.status||500);}
  });
  router.get(/^\/api\/execution-engine\/missions\/(?<missionId>\d+)\/transitions\/(?<intent>[a-z_]+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env),missionId=Number(params.missionId);
      const mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      const exceptions=await listMissionExceptions(env,session,missionId);
      const result=await executionStateForMission(env,session,mission,{exceptions});
      const target={
        driverId:Number(new URL(request.url).searchParams.get("driverId")||0)||null,
        tenantId:Number(new URL(request.url).searchParams.get("tenantId")||0)||null,
        executorId:Number(new URL(request.url).searchParams.get("executorId")||0)||null
      };
      const described=describeExecutionTransition({execution:result.execution,intent:params.intent,target});
      return json({success:true,...described});
    }catch(e){return json({success:false,error:e?.message||"Execution transition unavailable"},e?.status||500);}
  });

}
