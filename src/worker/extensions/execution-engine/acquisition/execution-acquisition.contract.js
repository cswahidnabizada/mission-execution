export const EXECUTION_ACQUISITION_VERSION="1.0";

export const ACQUISITION_SOURCE=Object.freeze({
  DIRECT_ASSIGNMENT:"DIRECT_ASSIGNMENT",
  TRUSTED_NETWORK:"TRUSTED_NETWORK",
  FORYOU:"FORYOU"
});

export function buildAcquisitionContract({
  missionId,ownerCompanyId,source,recipientType,recipientId,
  executionMode,status="READY",grantedAt=null,requestId=null,invitationId=null
}={}){
  const contract=Object.freeze({
    version:EXECUTION_ACQUISITION_VERSION,
    missionId:Number(missionId)||null,
    ownerCompanyId:Number(ownerCompanyId)||null,
    source:String(source||""),
    recipient:Object.freeze({
      type:String(recipientType||""),
      id:Number(recipientId)||null
    }),
    executionMode:String(executionMode||""),
    status:String(status||"READY"),
    grantedAt:grantedAt||null,
    requestId:Number(requestId||0)||null,
    invitationId:Number(invitationId||0)||null
  });
  return contract;
}

export function validateAcquisitionContract(c){
  const problems=[];
  if(!c?.missionId)problems.push("mission_id_missing");
  if(!c?.ownerCompanyId)problems.push("owner_company_missing");
  if(!Object.values(ACQUISITION_SOURCE).includes(c?.source))problems.push("invalid_source");
  if(!["driver","tenant","executor"].includes(c?.recipient?.type))problems.push("invalid_recipient_type");
  if(!c?.recipient?.id)problems.push("recipient_id_missing");
  if(!["OWNER_DRIVER","SHARED_TENANT","INDEPENDENT_EXECUTOR"].includes(c?.executionMode))problems.push("invalid_execution_mode");
  return problems;
}

export function directDriverAcquisition({missionId,ownerCompanyId,driverId,grantedAt=null}={}){
  return buildAcquisitionContract({
    missionId,ownerCompanyId,source:ACQUISITION_SOURCE.DIRECT_ASSIGNMENT,
    recipientType:"driver",recipientId:driverId,executionMode:"OWNER_DRIVER",grantedAt
  });
}
export function networkTenantAcquisition({missionId,ownerCompanyId,tenantId,invitationId,grantedAt=null}={}){
  return buildAcquisitionContract({
    missionId,ownerCompanyId,source:ACQUISITION_SOURCE.TRUSTED_NETWORK,
    recipientType:"tenant",recipientId:tenantId,executionMode:"SHARED_TENANT",invitationId,grantedAt
  });
}
export function networkExecutorAcquisition({missionId,ownerCompanyId,executorId,invitationId,grantedAt=null}={}){
  return buildAcquisitionContract({
    missionId,ownerCompanyId,source:ACQUISITION_SOURCE.TRUSTED_NETWORK,
    recipientType:"executor",recipientId:executorId,executionMode:"INDEPENDENT_EXECUTOR",invitationId,grantedAt
  });
}
export function foryouTenantAcquisition({missionId,ownerCompanyId,tenantId,requestId,grantedAt=null}={}){
  return buildAcquisitionContract({
    missionId,ownerCompanyId,source:ACQUISITION_SOURCE.FORYOU,
    recipientType:"tenant",recipientId:tenantId,executionMode:"SHARED_TENANT",requestId,grantedAt
  });
}
export function foryouExecutorAcquisition({missionId,ownerCompanyId,executorId,requestId,grantedAt=null}={}){
  return buildAcquisitionContract({
    missionId,ownerCompanyId,source:ACQUISITION_SOURCE.FORYOU,
    recipientType:"executor",recipientId:executorId,executionMode:"INDEPENDENT_EXECUTOR",requestId,grantedAt
  });
}
