import {isPreCustodyStatus,isCustodyStatus} from "../../../domains/logistics/logistics-lifecycle.contract.js";
export const CANCELLATION_REASONS=Object.freeze([
  "customer_cancelled","address_impossible","execution_unavailable","duplicate_mission","operational_failure","other"
]);
export function cancellationPolicy({flow={},session={}}={}){
  const owner=session.role==="admin"&&flow.viewer?.isOwner;
  const status=String(flow.status||"Pending");
  const terminal=Boolean(flow.terminal);
  const cancellableBeforeCustody=isPreCustodyStatus(status);
  const physicalCustodyActive=isCustodyStatus(status);
  const deliveryConfirmed=status==="Delivered";
  return Object.freeze({
    allowed:Boolean(owner&&!terminal&&cancellableBeforeCustody),
    reviewRequired:Boolean(owner&&!terminal&&physicalCustodyActive),
    postDeliveryLocked:Boolean(owner&&!terminal&&deliveryConfirmed),
    blockReason:physicalCustodyActive?"custody_resolution_required":deliveryConfirmed?"delivery_already_confirmed":null,
    requiresReason:true,
    requiresConfirmation:true,
    reasonOptions:CANCELLATION_REASONS
  });
}
