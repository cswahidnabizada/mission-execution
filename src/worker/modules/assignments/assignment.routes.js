import {cleanText,json,numberParam,readJson} from "../../core/http.js";
import {requireAdmin} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {assignmentQueue,assignmentState,assignDriver,publishToForYou,reclaimExecution} from "../../extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {getForSession} from "../missions/missions.service.js";
import {guardedMissionMutation} from "../transitions/transition-route.helper.js";
import {listAssignmentCandidates,suggestAssignmentAction,assignMission} from "../../extensions/mission-assignment/mission-assignment.capability.js";

export function registerAssignmentRoutes(router){
  router.get("/api/assignments/queue",async({request,env,url})=>{try{
    const s=await requireAdmin(request,env);await limitAction(env,s,"assignment-queue",{limit:45,windowSeconds:60});
    return json({success:true,...await assignmentQueue(env,s,{limit:numberParam(url.searchParams.get("limit"))||30})});
  }catch(e){return fail(e);}});

  router.get(/^\/api\/missions\/(?<missionId>\d+)\/assignment-state$/,async({request,env,params})=>{try{
    const s=await requireAdmin(request,env);await limitAction(env,s,"assignment-state",{limit:90,windowSeconds:60});
    return json({success:true,assignment:await assignmentState(env,s,Number(params.missionId))});
  }catch(e){return fail(e);}});


  router.get(/^\/api\/missions\/(?<missionId>\d+)\/assignment-candidates$/,async({request,env,params,url})=>{try{
    const s=await requireAdmin(request,env);await limitAction(env,s,"assignment-candidates",{limit:60,windowSeconds:60});
    const result=await listAssignmentCandidates(env,{companyId:Number(s.tenantId),missionId:Number(params.missionId),limit:numberParam(url.searchParams.get("limit"))||20});
    return json({success:true,...result});
  }catch(e){return fail(e);}});

  router.get(/^\/api\/missions\/(?<missionId>\d+)\/assignment-recommendation$/,async({request,env,params})=>{try{
    const s=await requireAdmin(request,env);await limitAction(env,s,"assignment-recommendation",{limit:45,windowSeconds:60});
    const decision=await suggestAssignmentAction(env,{companyId:Number(s.tenantId),missionId:Number(params.missionId),action:"recommend"});
    return json({success:true,decision});
  }catch(e){return fail(e);}});

  router.post(/^\/api\/missions\/(?<missionId>\d+)\/assignment-commit$/,async({request,env,params})=>{try{
    const s=await requireAdmin(request,env);const missionId=Number(params.missionId);await limitAction(env,s,"assignment-commit",{limit:12,windowSeconds:60});await limitAction(env,s,`assignment-commit:${missionId}`,{limit:3,windowSeconds:20});
    const b=await readJson(request),m=await getForSession(env,s,missionId);if(!m)return json({success:false,error:"Mission not found"},404);
    const result=await guardedMissionMutation({env,session:s,request,body:b,companyId:Number(m.company_id),missionId,actionCode:"mission_assignment",requireStateToken:true,run:async()=>assignMission(env,{session:s,companyId:Number(m.company_id),missionId,targetType:b.targetType,targetId:numberParam(b.targetId),requestId:b.requestId||null,decisionId:numberParam(b.decisionId)||null,reason:cleanText(b.reason||"approved_assignment",500)})});
    return json({success:true,...result});
  }catch(e){return fail(e);}});

  router.post(/^\/api\/missions\/(?<missionId>\d+)\/execution\/reclaim$/,async({request,env,params})=>{try{
    const s=await requireAdmin(request,env);
    const missionId=Number(params.missionId);
    await limitAction(env,s,"execution-reclaim",{limit:12,windowSeconds:60});
    await limitAction(env,s,`execution-reclaim:${missionId}`,{limit:2,windowSeconds:10});
    const b=await readJson(request),m=await getForSession(env,s,missionId);
    if(!m)return json({success:false,error:"Mission not found"},404);
    const result=await guardedMissionMutation({
      env,session:s,request,body:b,companyId:Number(m.company_id),missionId,actionCode:"reclaim_execution",requireStateToken:true,
      run:(_,fence)=>reclaimExecution(env,s,missionId,{reason:cleanText(b.reason||"tenant_driver_requested",80)},fence)
    });
    return json({success:true,...result});
  }catch(e){return fail(e);}});

  router.patch(/^\/api\/missions\/(?<missionId>\d+)\/driver-assignment$/,async({request,env,params})=>{try{
    const s=await requireAdmin(request,env);await limitAction(env,s,"driver-assignment",{limit:20,windowSeconds:60});await limitAction(env,s,`driver-assignment:${Number(params.missionId)}`,{limit:4,windowSeconds:10});
    const missionId=Number(params.missionId),b=await readJson(request),mode=cleanText(b.mode||"driver",20).toLowerCase();
    const m=await getForSession(env,s,missionId);if(!m)return json({success:false,error:"Mission not found"},404);
    if(mode==="foryou"){
      const result=await guardedMissionMutation({
        env,session:s,request,body:b,companyId:Number(m.company_id),missionId,actionCode:"publish_foryou",requireStateToken:true,
        run:(_,fence)=>publishToForYou(env,s,missionId,cleanText(b.publicDescription,2000),fence)
      });
      return json({success:true,...result});
    }
    const driverId=numberParam(b.driverId);if(!driverId)return json({success:false,error:"Choose a driver"},400);
    const result=await guardedMissionMutation({
      env,session:s,request,body:b,companyId:Number(m.company_id),missionId,actionCode:"assign_driver",requireStateToken:true,
      run:(_,fence)=>assignDriver(env,s,missionId,driverId,fence)
    });
    return json({success:true,...result});
  }catch(e){return fail(e);}});
}
function fail(e){const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:e?.message==="FORBIDDEN"?403:500);return json({success:false,error:e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message==="FORBIDDEN"?"Assignment permission required":e?.message||"Assignment operation failed",details:e?.details||null},status);}
