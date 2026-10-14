import {cleanText,json,readJson} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {getForSession} from "../../modules/missions/missions.service.js";
import {listMissionExceptions} from "../../modules/attention/attention.service.js";
import {missionManagement} from "./mission-management.service.js";
import {executeManagementIntent} from "./management-intent.service.js";
import {guardedMissionMutation} from "../../modules/transitions/transition-route.helper.js";

export function registerMissionManagementRoutes(router){
  router.get(/^\/api\/mission-management\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"mission-management-read",{limit:120,windowSeconds:60});
      const missionId=Number(params.missionId),mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      const exceptions=await listMissionExceptions(env,session,missionId);
      const executionLocation=await executionLocationFromMission(env,mission);
      const management=await missionManagement(env,session,mission,{exceptions,executionLocation});
      return json({success:true,management});
    }catch(e){return fail(e);}
  });

  router.post(/^\/api\/mission-management\/missions\/(?<missionId>\d+)\/intents\/(?<intent>[a-z_]+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env),missionId=Number(params.missionId);
      await limitAction(env,session,"mission-management-intent",{limit:20,windowSeconds:60});
      await limitAction(env,session,`mission-management-intent:${missionId}`,{limit:4,windowSeconds:10});
      const b=await readJson(request);
      const input={
        requirementId:Number(b.requirementId||0)||null,
        channel:cleanText(b.channel,24),
        targetDriverId:Number(b.targetDriverId||0)||null,
        recipientType:cleanText(b.recipientType,24),
        recipientId:Number(b.recipientId||0)||null,
        recovery:Boolean(b.recovery),
        reasonCode:cleanText(b.reasonCode,64),
        note:cleanText(b.note,500)
      };
      const mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      const result=await guardedMissionMutation({
        env,session,request,body:b,companyId:Number(mission.company_id),missionId,actionCode:`management:${params.intent}`,requireStateToken:true,
        run:(_,fence)=>executeManagementIntent(env,session,missionId,params.intent,input,fence)
      });
      return json({success:true,...result});
    }catch(e){return fail(e);}
  });
}

async function executionLocationFromMission(env,mission){
  const executorId=Number(mission.assigned_executor_id||mission.owner_assigned_executor_id||0)||null;
  if(executorId){
    const p=await env.DB.prepare(`
      SELECT situation,current_location,location_updated_at FROM executor_operational_profiles
      WHERE executor_id=? LIMIT 1
    `).bind(executorId).first();
    return {situation:p?.situation||"Available",currentLocation:p?.current_location||null,locationUpdatedAt:p?.location_updated_at||null};
  }
  const driverId=Number(mission.shared_driver_id||mission.owner_driver_id||0)||null;
  if(driverId){
    const companyId=Number(mission.executing_tenant_id||mission.company_id||0);
    const p=await env.DB.prepare(`
      SELECT situation,current_location,location_updated_at FROM driver_operational_profiles
      WHERE company_id=? AND driver_id=? LIMIT 1
    `).bind(companyId,driverId).first();
    return {situation:p?.situation||"Available",currentLocation:p?.current_location||null,locationUpdatedAt:p?.location_updated_at||null};
  }
  return {situation:null,currentLocation:null,locationUpdatedAt:null};
}
function fail(e){const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:500);return json({success:false,error:e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message||"Mission Management unavailable",details:e?.details||null},status);}
