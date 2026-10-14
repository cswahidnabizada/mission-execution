import {json} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {summary,acknowledgeMission} from "./awareness.service.js";
export function registerAwarenessRoutes(router){
  router.get("/api/mission-awareness",async({request,env})=>{try{
    const s=await requireSession(request,env);await limitAction(env,s,"mission-awareness",{limit:30,windowSeconds:60});
    return json({success:true,...await summary(env,s)});
  }catch(e){return fail(e);}});
  router.post(/^\/api\/mission-awareness\/(?<id>\d+)\/ack$/,async({request,env,params})=>{try{
    const s=await requireSession(request,env);await limitAction(env,s,"mission-awareness-ack",{limit:60,windowSeconds:60});
    return json({success:true,...await acknowledgeMission(env,s,Number(params.id))});
  }catch(e){return fail(e);}});
}
function fail(e){return json({success:false,error:e?.message||"Mission awareness operation failed"},e?.status||500);}
