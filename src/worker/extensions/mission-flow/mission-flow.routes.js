import {json} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {getForSession} from "../../modules/missions/missions.service.js";
import {listMissionExceptions} from "../../modules/attention/attention.service.js";
import {orchestrateMissionFlow} from "./mission-flow.orchestrator.js";

export function registerMissionFlowRoutes(router){
  router.get(/^\/api\/mission-flow\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"mission-flow-read",{limit:120,windowSeconds:60});
      const missionId=Number(params.missionId);
      const mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      const exceptions=await listMissionExceptions(env,session,missionId);
      const result=await orchestrateMissionFlow(env,session,mission,{exceptions});
      if(result.problems.length){
        console.warn("MISSION_FLOW_CONTRACT_VIOLATION",{missionId,problems:result.problems});
      }
      return json({success:true,flow:result.contract,problems:result.problems});
    }catch(e){return fail(e);}
  });
}
function fail(e){
  const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:e?.message==="FORBIDDEN"?403:500);
  return json({success:false,error:e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message||"Mission Flow unavailable"},status);
}
