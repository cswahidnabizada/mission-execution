import {json} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {getForSession} from "../../modules/missions/missions.service.js";
import {listMissionExceptions} from "../../modules/attention/attention.service.js";
import {coordinateMissionEngines} from "./engine-coordinator.service.js";

export function registerEngineCoordinatorRoutes(router){
  router.get(/^\/api\/engine-coordinator\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      const missionId=Number(params.missionId);
      const mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      const exceptions=await listMissionExceptions(env,session,missionId);
      const result=await coordinateMissionEngines(env,session,mission,{exceptions});
      if(result.problems.length){
        console.warn("ENGINE_COORDINATION_CONTRACT_VIOLATION",{missionId,problems:result.problems});
      }
      return json({success:true,stateToken:result.coordination.stateToken,truth:result.coordination.truth,surface:result.coordination.surface,coordination:result.coordination,problems:result.problems});
    }catch(e){
      return json({success:false,error:e?.message||"Engine Coordinator unavailable"},e?.status||500);
    }
  });
}
