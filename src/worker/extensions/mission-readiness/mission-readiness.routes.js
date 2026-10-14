import {json} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {getForSession} from "../../modules/missions/missions.service.js";
import {listMissionExceptions} from "../../modules/attention/attention.service.js";
import {buildMissionContext} from "../../modules/intelligence/mission-context.js";
import {buildMissionConditions} from "../../modules/intelligence/mission-conditions.js";
import {buildActionContext} from "../actions-intelligence/action-context.gateway.js";
import {missionReadiness} from "./mission-readiness.service.js";
import {executionHandoffForMission} from "./execution-handoff.service.js";
import {executionAvailabilityState} from "./providers/execution-availability.provider.js";
import {resolveMissionBlocker} from "./blocker-resolution.engine.js";
import {buildInterventionContract} from "./intervention-contract.js";

export function registerMissionReadinessRoutes(router){
  router.get(/^\/api\/mission-readiness\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"mission-readiness-read",{limit:120,windowSeconds:60});
      const missionId=Number(params.missionId);
      const mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);

      const accessKind=session.role==="executor"?"executor":
        session.role==="driver"?(Number(mission.shared_access||0)===1?"shared-driver":"owner-driver"):
        mission?.custody_recipient_pending?"custody-recipient":(Number(mission.shared_access||0)===1?"shared-tenant":"owner");
      const context=buildMissionContext(mission,{role:session.role,accessKind});
      const conditions=buildMissionConditions(context);
      const exceptions=await listMissionExceptions(env,session,missionId);
      const featureState=await buildActionContext(env,session,mission,conditions,{exceptions});
      const executionAvailability=await executionAvailabilityState(env,featureState,conditions);
      const readiness=missionReadiness({mission,featureState,conditions,executionAvailability});
      const resolutions=(readiness.blockers||[]).map(blocker=>resolveMissionBlocker({
        blocker,conditions,featureState,executionAvailability,session
      }));
      const intervention=buildInterventionContract({readiness,resolutions,session});
      const handoff=executionHandoffForMission({conditions,featureState,readiness,session});

      return json({success:true,readiness,handoff,intervention,executionAvailability});
    }catch(e){return fail(e);}
  });
}
function fail(e){
  const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:e?.message==="FORBIDDEN"?403:500);
  return json({success:false,error:e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message||"Mission Readiness unavailable"},status);
}
