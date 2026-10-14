import {json,readJson} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {decideCanonicalAction,decideCanonicalActions} from "../../application/actions/canonical-action-decision.service.js";
import {buildCanonicalActionOrchestration} from "../../application/actions/canonical-action-orchestration.service.js";
import {buildCanonicalOperationalJourney} from "../../application/actions/canonical-operational-journey.service.js";

export function registerCanonicalActionDecisionRoutes(router){
  router.post("/api/actions/decision",async({request,env})=>{
    try{const session=await requireSession(request,env);await limitAction(env,session,"canonical-action-decision",{limit:120,windowSeconds:60});const body=await readJson(request);const result=await decideCanonicalAction(env,request,session,{missionId:Number(body.missionId||0)||null,body});return json({success:true,decision:result});}
    catch(e){return json({success:false,error:e?.message||"Canonical action decision unavailable"},e?.status||500);}
  });
  router.post("/api/actions/decisions",async({request,env})=>{
    try{const session=await requireSession(request,env);await limitAction(env,session,"canonical-action-decisions",{limit:60,windowSeconds:60});const body=await readJson(request);const result=await decideCanonicalActions(env,request,session,{missionId:Number(body.missionId||0)||null,body,limit:body.limit});return json({success:true,...result});}
    catch(e){return json({success:false,error:e?.message||"Canonical action decisions unavailable"},e?.status||500);}
  });
  router.get(/^\/api\/actions\/orchestration\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{const session=await requireSession(request,env);await limitAction(env,session,"canonical-action-orchestration",{limit:60,windowSeconds:60});const result=await buildCanonicalActionOrchestration(env,request,session,{missionId:Number(params.missionId),body:{missionId:Number(params.missionId)}});return json({success:true,orchestration:result});}
    catch(e){return json({success:false,error:e?.message||"Canonical action orchestration unavailable"},e?.status||500);}
  });
  router.get(/^\/api\/actions\/journeys\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{const session=await requireSession(request,env);await limitAction(env,session,"canonical-operational-journey",{limit:60,windowSeconds:60});const result=await buildCanonicalOperationalJourney(env,request,session,{missionId:Number(params.missionId),body:{missionId:Number(params.missionId)}});return json({success:true,journey:result});}
    catch(e){return json({success:false,error:e?.message||"Canonical operational journey unavailable"},e?.status||500);}
  });
}
