import * as missionRepo from "../../../repositories/mission.repository.js";
import * as networkRepo from "../../../repositories/network.repository.js";
import * as publicRepo from "../../../repositories/public.repository.js";
import {executionOwnershipSnapshot} from "../../mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
import {
  directDriverAcquisition,networkTenantAcquisition,networkExecutorAcquisition,
  foryouTenantAcquisition,foryouExecutorAcquisition,validateAcquisitionContract
} from "./execution-acquisition.contract.js";

export async function acquisitionStateForMission(env,ownerCompanyId,missionId){
  const mission=await missionRepo.findMission(env,Number(ownerCompanyId),Number(missionId));
  if(!mission)return {acquisition:null,problems:["mission_not_found"]};

  const ownership=await executionOwnershipSnapshot(env,Number(ownerCompanyId),Number(missionId));

  if(ownership.localDriverId){
    const a=directDriverAcquisition({missionId,ownerCompanyId,driverId:ownership.localDriverId,grantedAt:mission.updated_at});
    return {acquisition:a,problems:validateAcquisitionContract(a)};
  }

  const network=await networkRepo.findActiveMissionInvitation?.(env,Number(ownerCompanyId),Number(missionId));
  if(network?.status==="Accepted"){
    const a=network.recipient_type==="tenant"
      ?networkTenantAcquisition({missionId,ownerCompanyId,tenantId:network.recipient_company_id,invitationId:network.id,grantedAt:network.responded_at})
      :networkExecutorAcquisition({missionId,ownerCompanyId,executorId:network.recipient_executor_id,invitationId:network.id,grantedAt:network.responded_at});
    return {acquisition:a,problems:validateAcquisitionContract(a)};
  }

  const approved=await publicRepo.findApprovedMissionRequest?.(env,Number(ownerCompanyId),Number(missionId));
  if(approved?.status==="Approved"){
    const a=approved.requester_type==="tenant"
      ?foryouTenantAcquisition({missionId,ownerCompanyId,tenantId:approved.requester_company_id,requestId:approved.id,grantedAt:approved.updated_at})
      :foryouExecutorAcquisition({missionId,ownerCompanyId,executorId:approved.executor_id,requestId:approved.id,grantedAt:approved.updated_at});
    return {acquisition:a,problems:validateAcquisitionContract(a)};
  }

  return {acquisition:null,problems:[]};
}
