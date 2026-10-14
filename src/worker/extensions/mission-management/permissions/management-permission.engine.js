import {isPreCustodyStatus,isCustodyStatus} from "../../../domains/logistics/logistics-lifecycle.contract.js";
export function managementPermissions({flow={},conditions={},featureState={},session={},ownershipSnapshot=null}={}){
  const terminal=Boolean(flow.terminal);
  const owner=session.role==="admin"&&Boolean(conditions.perspective?.isOwner);
  const personal=["driver","executor"].includes(session.role)&&Boolean(conditions.perspective?.isPersonal);
  const status=String(flow.status||conditions.status||"Pending");
  const physicalCustodyActive=isCustodyStatus(status);
  const restrictedForYouContext=["foryou-discovery","pending-foryou"].includes(String(conditions.accessKind||flow.conditions?.accessKind||""));

  return Object.freeze({
    // Mission Management is intentionally narrow: lifecycle, responsibility,
    // custody and completion recovery. Navigation/location stay in their
    // dedicated operational surfaces.
    canEdit:Boolean(owner&&!terminal&&!restrictedForYouContext),
    canDelete:Boolean(owner&&!restrictedForYouContext),
    cancelMission:Boolean(owner&&!terminal&&!restrictedForYouContext&&isPreCustodyStatus(status)),
    reclaimExecution:Boolean(
      owner&&!terminal&&!physicalCustodyActive&&
      ownershipSnapshot?.ownerCount===1&&
      Boolean(ownershipSnapshot?.executorId||ownershipSnapshot?.sharedTenantId)
    ),
    manageDistribution:false,
    navigate:false,
    requestCurrentLocation:false,
    shareCurrentLocation:false,
    resolveTraffic:false,
    resolveWaiting:false,
    completeManagementRequirement:Boolean(personal&&!terminal)
  });
}
