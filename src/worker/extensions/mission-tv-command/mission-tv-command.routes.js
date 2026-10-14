import {json,readJson,cleanText} from "../../core/http.js";
import {requireAdmin} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {getForSession} from "../../modules/missions/missions.service.js";
import {guardedMissionMutation} from "../../modules/transitions/transition-route.helper.js";
import {withdrawForYou,withdrawNetworkInvitation} from "./distribution-control.service.js";

export function registerMissionTvCommandRoutes(router){
  router.post(/^\/api\/missions\/(?<missionId>\d+)\/distribution\/withdraw-foryou$/,async({request,env,params})=>{
    try{
      const session=await requireAdmin(request,env),missionId=Number(params.missionId);
      await limitAction(env,session,"tv-withdraw-foryou",{limit:15,windowSeconds:60});
      const body=await readJson(request),mission=await getForSession(env,session,missionId);
      if(!mission||Number(mission.company_id)!==Number(session.tenantId))return json({success:false,error:"Only the owning tenant can withdraw ForYou distribution"},403);
      const result=await guardedMissionMutation({env,session,request,body,companyId:Number(mission.company_id),missionId,actionCode:"withdraw_foryou",requireStateToken:true,run:(_,fence)=>withdrawForYou(env,session,missionId,fence)});
      return json({success:true,...result});
    }catch(e){return fail(e);}
  });
  router.post(/^\/api\/missions\/(?<missionId>\d+)\/distribution\/withdraw-network$/,async({request,env,params})=>{
    try{
      const session=await requireAdmin(request,env),missionId=Number(params.missionId);
      await limitAction(env,session,"tv-withdraw-network",{limit:15,windowSeconds:60});
      const body=await readJson(request),mission=await getForSession(env,session,missionId);
      if(!mission||Number(mission.company_id)!==Number(session.tenantId))return json({success:false,error:"Only the owning tenant can withdraw a trusted-network invitation"},403);
      const result=await guardedMissionMutation({env,session,request,body,companyId:Number(mission.company_id),missionId,actionCode:"withdraw_network",requireStateToken:true,run:(_,fence)=>withdrawNetworkInvitation(env,session,missionId,fence)});
      return json({success:true,...result});
    }catch(e){return fail(e);}
  });
}
function fail(e){return json({success:false,error:e?.message||"Mission TV command failed",details:e?.details||null},e?.status||500);}
