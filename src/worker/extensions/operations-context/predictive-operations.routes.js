import {json} from "../../core/http.js";
import {requireAdmin} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {listForSession} from "../../modules/missions/missions.service.js";
import {attentionForSession} from "../../modules/attention/attention.service.js";
import {listDrivers} from "../../modules/people/people.service.js";
import {executionPartners} from "../../modules/network/network.service.js";
import {buildPredictiveOperations} from "../../modules/intelligence/predictive-operations.engine.js";

export function registerPredictiveOperationsRoutes(router){
  router.get("/api/operations/predictive",async({request,env,url})=>{
    try{
      const session=await requireAdmin(request,env);
      await limitAction(env,session,"operations-predictive-read",{limit:30,windowSeconds:60});
      const limit=Math.max(1,Math.min(Number(url.searchParams.get("limit"))||100,200));
      const [missions,attention,drivers,partners]=await Promise.all([
        listForSession(env,session,{limit:5000,offset:0}),
        attentionForSession(env,session,{limit:50}),
        listDrivers(env,Number(session.tenantId)),
        executionPartners(env,session)
      ]);
      const model=buildPredictiveOperations({missions:Array.isArray(missions)?missions:[],attentionItems:attention?.items||[],drivers:drivers||[],networkPartners:partners||[],now:Date.now()});
      return json({success:true,...model,predictions:model.predictions.slice(0,limit)});
    }catch(e){return json({success:false,error:e?.message||"Predictive operations unavailable"},e?.status||500);}
  });
}
