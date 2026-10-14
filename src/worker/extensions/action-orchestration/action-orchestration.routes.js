import {json} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {getForSession} from "../../modules/missions/missions.service.js";
import {listMissionExceptions} from "../../modules/attention/attention.service.js";
import {unifiedActionForMission} from "../unified-action/unified-action.service.js";
import {buildAdaptiveActionOrchestration} from "./adaptive-action-orchestration.engine.js";
export function registerAdaptiveActionOrchestrationRoutes(router){router.get(/^\/api\/operations\/action-orchestration\/(?<missionId>\d+)$/,async({request,env,params})=>{try{const session=await requireSession(request,env);await limitAction(env,session,"adaptive-action-orchestration-read",{limit:180,windowSeconds:60});const mission=await getForSession(env,session,Number(params.missionId));if(!mission)return json({success:false,error:"Mission not found or access denied"},404);const exceptions=await listMissionExceptions(env,session,Number(params.missionId));const {surface}=await unifiedActionForMission(env,session,mission,{exceptions:exceptions||[]});const orchestration=buildAdaptiveActionOrchestration({mission,unified:surface,availableActions:surface?.utilities||[],exceptions:exceptions||[]});return json({success:true,orchestration});}catch(e){return json({success:false,error:e?.message||"Adaptive action orchestration unavailable"},e?.status||500);}});}
