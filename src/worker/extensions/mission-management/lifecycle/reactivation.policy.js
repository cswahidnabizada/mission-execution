export function reactivationPolicy({flow={},session={},mission={}}={}){
  const status=String(mission?.status||flow.status||"");
  const cancelled=["Cancelled","Canceled"].includes(status);
  const sessionTenantId=Number(session?.tenantId||0)||null;
  const missionOwnerId=Number(mission?.company_id||flow.ownership?.ownerCompanyId||0)||null;

  const directOwnershipKnown=Boolean(sessionTenantId&&missionOwnerId);
  const ownerByIdentity=Boolean(
    session?.role==="admin"&&directOwnershipKnown&&sessionTenantId===missionOwnerId
  );
  const ownerByProjection=Boolean(
    session?.role==="admin"&&!directOwnershipKnown&&flow.viewer?.isOwner
  );

  return Object.freeze({
    allowed:Boolean(cancelled&&(ownerByIdentity||ownerByProjection)),
    nextStatus:"Pending",
    clearsAssignment:true,
    clearsDistribution:true,
    requiresConfirmation:true,
    ownerVerifiedBy:ownerByIdentity?"mission_owner_id":ownerByProjection?"flow_projection":null
  });
}
