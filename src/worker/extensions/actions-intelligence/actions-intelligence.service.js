import {deriveActionCapabilities} from "./action-capability.engine.js";
import {buildActionContract} from "./action-contract.engine.js";

/** Backward-compatible V7.8.0 capability API. */
export function actionsForMissionIntelligence({
  conditions,viewerDriverId=null,viewerExecutorId=null,
  openException=false,canResolveException=false,
  networkInvitation=null,forYouRequest=null,driverUnavailable=false,featureState=null
}={}){
  if(!conditions)throw new Error("Actions Intelligence requires authorized mission Conditions");
  return deriveActionCapabilities({conditions,viewerDriverId,viewerExecutorId,openException,canResolveException,networkInvitation,forYouRequest,driverUnavailable,featureState});
}

/** V7.8.1 stable Action Contract API. */
export function actionContractForMissionIntelligence({
  conditions,viewerDriverId=null,viewerExecutorId=null,
  openException=false,openExceptionId=null,canResolveException=false,
  networkInvitation=null,forYouRequest=null,driverUnavailable=false,featureState=null,missionUpdatedAt=null,stateToken=null,now=Date.now(),managementActions=[]
}={}){
  const capabilities=actionsForMissionIntelligence({conditions,viewerDriverId,viewerExecutorId,openException,canResolveException,networkInvitation,forYouRequest,driverUnavailable,featureState});
  return buildActionContract(capabilities,{
    conditions,featureState,openException,canResolveException,driverUnavailable,networkInvitation,forYouRequest,
    missionId:conditions.missionId,openExceptionId,networkInvitationId:networkInvitation?.id||null,forYouRequestId:forYouRequest?.id||null,missionUpdatedAt,stateToken,now,
    managementActions
  });
}
