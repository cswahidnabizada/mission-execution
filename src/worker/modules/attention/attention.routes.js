import {json,cleanText,numberParam,readJson} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {attentionForSession,listMissionExceptions,createMissionException,resolveMissionException} from "./attention.service.js";
import {getForSession} from "../missions/missions.service.js";
import {intelligenceFromMission} from "../intelligence/mission-intelligence.coordinator.js";
import {guardedMissionMutation} from "../transitions/transition-route.helper.js";

export function registerAttentionRoutes(router){
  router.get("/api/attention",async({request,env,url})=>{try{
    const s=await requireSession(request,env);
    await limitAction(env,s,"attention-list",{limit:30,windowSeconds:60});
    const limit=Math.min(Math.max(numberParam(url.searchParams.get("limit"))||20,1),50);
    return json({success:true,...await attentionForSession(env,s,{limit})});
  }catch(e){return fail(e);}});

  router.get(/^\/api\/missions\/(?<missionId>\d+)\/intelligence$/,async({request,env,params})=>{try{
    const s=await requireSession(request,env);
    await limitAction(env,s,"mission-intelligence",{limit:60,windowSeconds:60});
    const mission=await getForSession(env,s,Number(params.missionId));
    if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
    const accessKind=Number(mission.shared_access||0)===1?"shared-tenant":"owner";
    return json({success:true,intelligence:intelligenceFromMission(mission,{role:s.role,accessKind})});
  }catch(e){return fail(e);}});

  router.get(/^\/api\/missions\/(?<missionId>\d+)\/exceptions$/,async({request,env,params})=>{try{
    const s=await requireSession(request,env);
    await limitAction(env,s,"exception-list",{limit:60,windowSeconds:60});
    return json({success:true,exceptions:await listMissionExceptions(env,s,Number(params.missionId))});
  }catch(e){return fail(e);}});

  router.post(/^\/api\/missions\/(?<missionId>\d+)\/exceptions$/,async({request,env,params})=>{try{
    const s=await requireSession(request,env);
    await limitAction(env,s,"exception-create",{limit:10,windowSeconds:60});
    await limitAction(env,s,`exception-create:${Number(params.missionId)}`,{limit:2,windowSeconds:10});
    const b=await readJson(request),missionId=Number(params.missionId),mission=await getForSession(env,s,missionId);
    if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
    const result=await guardedMissionMutation({
      env,session:s,request,body:b,companyId:Number(mission.company_id),missionId,actionCode:"report_exception",requireStateToken:true,
      run:(_,fence)=>createMissionException(env,s,missionId,{exceptionType:cleanText(b.exceptionType,40),note:cleanText(b.note,500)},fence)
    });
    return json({success:true,missionId,stateToken:result.stateToken,exception:result},201);
  }catch(e){return fail(e);}});

  router.patch(/^\/api\/missions\/(?<missionId>\d+)\/exceptions\/(?<exceptionId>\d+)\/resolve$/,async({request,env,params})=>{try{
    const s=await requireSession(request,env),missionId=Number(params.missionId);
    await limitAction(env,s,"exception-resolve",{limit:20,windowSeconds:60});
    const b=await readJson(request),mission=await getForSession(env,s,missionId);
    if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
    const result=await guardedMissionMutation({env,session:s,request,body:{...b,exceptionId:Number(params.exceptionId)},companyId:Number(mission.company_id),missionId,actionCode:"resolve_exception",requireStateToken:true,run:(_,fence)=>resolveMissionException(env,s,missionId,Number(params.exceptionId),fence)});
    return json({success:true,...result});
  }catch(e){return fail(e);}});
}
function fail(e){const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:e?.message==="FORBIDDEN"?403:500);const map={INVALID_EXCEPTION:"Choose a valid exception type",TOO_MANY_ATTEMPTS:"Too many attention actions. Please wait briefly."};return json({success:false,error:map[e?.message]||e?.message||"Attention operation failed",details:e?.details||null},status);}
