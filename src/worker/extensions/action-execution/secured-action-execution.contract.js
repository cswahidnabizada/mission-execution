export const SECURED_ACTION_EXECUTION_VERSION="1.1.0";
export const EXECUTION_STATES=Object.freeze({READY:"READY",EXECUTING:"EXECUTING",SUCCEEDED:"SUCCEEDED",STALE:"STALE",BLOCKED:"BLOCKED",FAILED:"FAILED"});
export function buildSecuredActionPreparation({mission=null,action=null,stateToken=null}={}){
 const currentToken=Number(mission?.state_version||0)>0?`v:${Number(mission.state_version)}`:String(mission?.updated_at||"");
 const supplied=String(stateToken||""),tokenValid=Boolean(supplied&&supplied===currentToken),target=action?.target||null;
 const executable=Boolean(action?.code&&target&&["api","mission_status","ui"].includes(String(target.kind||"")));
 const terminal=["Completed","Cancelled","Canceled"].includes(String(mission?.status||""));
 const blocked=terminal&&String(action?.code||"")!=="reactivate_mission",reasons=[];
 if(!mission?.id)reasons.push("mission_missing"); if(!action?.code)reasons.push("action_missing"); if(!target)reasons.push("service_target_missing"); if(!executable&&target)reasons.push("service_target_not_executable"); if(!tokenValid)reasons.push("stale_state_token"); if(blocked)reasons.push("terminal_mission");
 return Object.freeze({version:SECURED_ACTION_EXECUTION_VERSION,missionId:Number(mission?.id||0)||null,actionCode:String(action?.code||""),state:{currentToken:currentToken||null,suppliedToken:supplied||null,valid:tokenValid},target:target||null,authorization:{contextAvailable:Boolean(action),delegatedToSecuredService:true,serverAuthorizationRequired:true},preconditions:{ready:Boolean(mission?.id&&action?.code&&target&&executable&&tokenValid&&!blocked),reasons:Object.freeze(reasons)},lifecycle:{state:blocked?EXECUTION_STATES.BLOCKED:tokenValid?EXECUTION_STATES.READY:EXECUTION_STATES.STALE},advisory:false});
}
export function validateSecuredActionPreparation(p){const problems=[];if(!p?.missionId)problems.push("mission_id_missing");if(!p?.actionCode)problems.push("action_code_missing");if(!p?.state?.currentToken)problems.push("current_state_token_missing");if(p?.preconditions?.ready&&!p?.target)problems.push("ready_without_target");return problems;}
