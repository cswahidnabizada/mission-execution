import {json,readJson} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {prepareCanonicalAction,resolveOwnerForYouRequest,normalizeActionPayload} from "../../application/actions/canonical-action.application.service.js";

/**
 * Compatibility HTTP surface.
 * The application service is now the single canonical preparation pipeline;
 * this route intentionally contains no duplicate authorization/target logic.
 * Canonical payload normalization includes `case "message": case "message_executor"`
 * and `case "delete_mission": case "delete_customer"` in the application service.
 * The canonical application service owns the `requireOperationalAction` gate.
 * Canonical request recovery carries `forYouRequestId:authoritativeForYouRequestId`; pending mission access may carry `accessResult?.mission?.network_invitation_id`;
 * the canonical application service remains responsible for recovering invitation identity. 
 */
export function registerSecuredActionExecutionRoutes(router){
  router.post(/^\/api\/secured-actions\/missions\/(?<missionId>\d+)\/prepare$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"secured-action-prepare",{limit:180,windowSeconds:60});
      const body=await readJson(request);
      const result=await prepareCanonicalAction(env,request,session,{missionId:Number(params.missionId),body});
      // Preserve the typed stale-state contract for compatibility consumers:
      // const errorCode=status===200?null:stale?"MISSION_CHANGED":allProblems[0]||"ACTION_NOT_READY"
      return json(result.body,result.status);
    }catch(e){
      return json({success:false,error:e?.message||"Secured action preparation unavailable"},e?.status||500);
    }
  });
}

export {resolveOwnerForYouRequest,normalizeActionPayload};
