import {json} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {getForSession} from "../../modules/missions/missions.service.js";
import {completionGate} from "./completion-gate.service.js";
import {missionInvariantState} from "./mission-invariants.service.js";

export function registerCompletionGateRoutes(router){
  router.get(/^\/api\/completion-gate\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env),missionId=Number(params.missionId);
      const mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      return json({success:true,completion:await completionGate(env,mission)});
    }catch(e){return json({success:false,error:e?.message||"Completion Gate unavailable"},e?.status||500);}
  });
  router.get(/^\/api\/mission-invariants\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env),missionId=Number(params.missionId);
      const mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      return json({success:true,invariants:await missionInvariantState(env,mission)});
    }catch(e){return json({success:false,error:e?.message||"Mission invariants unavailable"},e?.status||500);}
  });

}
