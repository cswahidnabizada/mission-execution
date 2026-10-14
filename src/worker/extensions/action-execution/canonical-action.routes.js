import {json,readJson} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {executeCanonicalAction} from "../../application/actions/canonical-action.application.service.js";

/** Canonical application-level action execution endpoint. */
export function registerCanonicalActionRoutes(router){
  router.post("/api/actions/execute",async({request,env})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"canonical-action-execute",{limit:120,windowSeconds:60});
      const body=await readJson(request);
      const result=await executeCanonicalAction(env,request,router,session,{
        missionId:Number(body.missionId||0)||null,
        body
      });
      return json(result.body,result.status);
    }catch(e){
      return json({success:false,error:e?.message||"Canonical action execution unavailable"},e?.status||500);
    }
  });
}
