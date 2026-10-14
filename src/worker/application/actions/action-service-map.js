import {operationalMissionHref} from "../../modules/intelligence/operational-mission-route.js";
/**
 * Actions Intelligence — Action Service Map V1
 *
 * Declarative routing only.
 * WHAT is decided by capability/ranking.
 * WHERE is described here.
 * WHETHER an action may execute remains the responsibility of the existing secured API/service.
 */
export const ACTION_SERVICE_MAP=Object.freeze({
  open_mission:route("navigation",{kind:"navigate",href:({missionId,role})=>operationalMissionHref(missionId,{role:role||"admin"}),refresh:"none"}),
  check_assignment:route("assignment",{kind:"api",method:"GET",endpoint:({missionId})=>`/api/missions/${id(missionId)}/assignment-state`,refresh:"actions"}),
  edit_mission:route("mission_data",{kind:"api",method:"PATCH",endpoint:({missionId})=>`/api/missions/${id(missionId)}`,body:ctx=>missionEditBody(ctx),refresh:"mission"}),
  // Internal compatibility alias. It is normalized to the single user-facing edit_mission action.
  edit_mission_data:route("mission_data",{kind:"api",method:"PATCH",endpoint:({missionId})=>`/api/missions/${id(missionId)}`,body:ctx=>missionEditBody(ctx),refresh:"mission"}),
  review_network:route("operations",{kind:"ui",intent:"open_distribution_collaboration",refresh:"actions"}),
  review_foryou:route("operations",{kind:"ui",intent:"open_distribution_collaboration",refresh:"actions"}),
  share_foryou:route("foryou",{kind:"api",method:"PATCH",endpoint:({missionId})=>`/api/missions/${id(missionId)}/driver-assignment`,body:ctx=>({mode:"foryou",publicDescription:String(ctx.payload?.publicDescription||"").slice(0,2000)}),refresh:"mission"}),
  share_network:route("network",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/network/missions/${id(missionId)}/invite`,body:ctx=>({recipientType:String(ctx.payload?.recipientType||"tenant").slice(0,20),recipientId:id(ctx.payload?.recipientId),message:String(ctx.payload?.message||"").slice(0,500)}),refresh:"mission"}),
  assign_driver:route("assignment",{kind:"api",method:"PATCH",endpoint:({missionId})=>`/api/missions/${id(missionId)}/driver-assignment`,body:ctx=>({mode:"driver",driverId:id(ctx.payload?.driverId)}),refresh:"mission"}),
  change_driver:route("assignment",{kind:"api",method:"PATCH",endpoint:({missionId})=>`/api/missions/${id(missionId)}/driver-assignment`,body:ctx=>({mode:"driver",driverId:id(ctx.payload?.driverId)}),refresh:"mission"}),
  reclaim_execution:route("responsibility",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/missions/${id(missionId)}/execution/reclaim`,body:{reason:"tenant_driver_requested"},refresh:"mission"}),

  advance_execution:route("mission_flow",{kind:"ui",intent:"advance_execution",refresh:"mission"}),
  confirm_arrival:status("Arrived"),
  confirm_pickup:status("PickedUp"),
  start_transit:status("InTransit"),
  start_operation:status("InProgress"),
  capture_delivery_proof:route("delivery_proof",{kind:"ui",intent:"capture_delivery_proof",refresh:"mission"}),
  confirm_delivery:status("Delivered"),
  complete_mission:status("Completed"),
  complete_operation:status("Completed"),

  report_exception:route("exception",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/missions/${id(missionId)}/exceptions`,body:ctx=>({exceptionType:String(ctx.payload?.exceptionType||"other").slice(0,80),note:String(ctx.payload?.note||"").slice(0,500)}),refresh:"mission"}),
  resolve_exception:route("exception",{kind:"api",method:"PATCH",endpoint:({missionId,openExceptionId})=>openExceptionId?`/api/missions/${id(missionId)}/exceptions/${id(openExceptionId)}/resolve`:null,refresh:"mission"}),

  message:route("communication",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/missions/${id(missionId)}/messages`,body:ctx=>({message:String(ctx.payload?.message||"").slice(0,2000)}),refresh:"mission"}),
  message_executor:route("communication",{kind:"api",method:"POST",endpoint:({personId})=>`/api/drivers/${id(personId)}/direct-messages`,body:ctx=>({message:String(ctx.payload?.message||"").slice(0,2000)}),refresh:"people"}),
  navigate:route("navigation",{kind:"ui",intent:"navigate_route",refresh:"none"}),
  review_availability:route("availability",{kind:"navigate",href:()=>"/app#work",refresh:"none"}),
  start_navigation:route("management",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/start_navigation`,body:ctx=>({requirementId:id(ctx.payload?.requirementId)}),refresh:"mission"}),
  request_current_location:route("management",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/request_current_location`,refresh:"mission"}),
  share_current_location:route("management",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/share_current_location`,body:ctx=>({requirementId:id(ctx.payload?.requirementId)}),refresh:"mission"}),
  resolve_traffic:route("management",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/resolve_traffic`,body:ctx=>({requirementId:id(ctx.payload?.requirementId)}),refresh:"mission"}),
  resolve_waiting:route("management",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/resolve_waiting`,body:ctx=>({requirementId:id(ctx.payload?.requirementId)}),refresh:"mission"}),
  cancel_mission:route("management",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/cancel_mission`,body:ctx=>({reasonCode:String(ctx.payload?.reasonCode||"").slice(0,64),note:String(ctx.payload?.note||"").slice(0,500)}),refresh:"mission"}),
  delete_mission:route("management",{kind:"api",method:"DELETE",endpoint:({missionId})=>`/api/missions/${id(missionId)}`,body:ctx=>({confirmation:String(ctx.payload?.confirmation||"").slice(0,200)}),refresh:"mission"}),
  edit_customer:route("customer_data",{kind:"api",method:"PATCH",endpoint:({customerId})=>`/api/network/customers/${id(customerId)}`,body:ctx=>({companyName:String(ctx.payload?.companyName||"").slice(0,200),contactName:String(ctx.payload?.contactName||"").slice(0,200),email:String(ctx.payload?.email||"").slice(0,250),phone:String(ctx.payload?.phone||"").slice(0,80),address:String(ctx.payload?.address||"").slice(0,500),customerReference:String(ctx.payload?.customerReference||"").slice(0,120),notes:String(ctx.payload?.notes||"").slice(0,1000)}),refresh:"people"}),
  delete_customer:route("customer_data",{kind:"api",method:"DELETE",endpoint:({customerId})=>`/api/network/customers/${id(customerId)}`,body:ctx=>({confirmation:String(ctx.payload?.confirmation||"").slice(0,200)}),refresh:"people"}),
  edit_driver:route("people",{kind:"api",method:"PATCH",endpoint:({personId})=>`/api/drivers/${id(personId)}`,body:ctx=>({name:String(ctx.payload?.name||"").slice(0,160)}),refresh:"people"}),
  edit_driver_operational_profile:route("people",{kind:"api",method:"PATCH",endpoint:({personId})=>`/api/drivers/${id(personId)}/operational-profile`,body:ctx=>({vehicleType:String(ctx.payload?.vehicleType||"").slice(0,80),currentLocation:String(ctx.payload?.currentLocation||"").slice(0,180)}),refresh:"people"}),
  toggle_driver_status:route("people",{kind:"api",method:"PATCH",endpoint:({personId})=>`/api/drivers/${id(personId)}/status`,body:ctx=>({active:Boolean(ctx.payload?.active)}),refresh:"people"}),
  remove_driver:route("people",{kind:"api",method:"DELETE",endpoint:({personId})=>`/api/drivers/${id(personId)}`,refresh:"people"}),
  request_trust:route("network",{kind:"api",method:"POST",endpoint:({partnerId})=>`/api/network/tenants/${id(partnerId)}/trust`,refresh:"network"}),
  accept_trust:route("network",{kind:"api",method:"POST",endpoint:({relationshipId})=>`/api/network/tenant-trust/${id(relationshipId)}/accept`,refresh:"network"}),
  reject_trust:route("network",{kind:"api",method:"POST",endpoint:({relationshipId})=>`/api/network/tenant-trust/${id(relationshipId)}/reject`,refresh:"network"}),
  suspend_trust:route("network",{kind:"api",method:"POST",endpoint:({relationshipId})=>`/api/network/tenant-trust/${id(relationshipId)}/suspend`,refresh:"network"}),
  add_customer_location:route("customer_data",{kind:"api",method:"POST",endpoint:({customerId})=>`/api/network/customers/${id(customerId)}/locations`,refresh:"people"}),
  archive_customer:route("customer_data",{kind:"api",method:"DELETE",endpoint:({customerId})=>`/api/network/customers/${id(customerId)}`,refresh:"people"}),
  repost_foryou:route("distribution",{kind:"api",method:"PATCH",endpoint:({missionId})=>`/api/missions/${id(missionId)}/driver-assignment`,body:ctx=>({mode:"foryou",publicDescription:String(ctx.payload?.publicDescription||"").slice(0,2000)}),refresh:"mission"}),
  restart_network:route("distribution",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/network/missions/${id(missionId)}/invite`,body:ctx=>({recipientType:String(ctx.payload?.recipientType||"tenant").slice(0,20),recipientId:id(ctx.payload?.recipientId),message:String(ctx.payload?.message||"").slice(0,500)}),refresh:"mission"}),
  withdraw_foryou:route("distribution",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/missions/${id(missionId)}/distribution/withdraw-foryou`,refresh:"mission"}),
  withdraw_network:route("distribution",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/missions/${id(missionId)}/distribution/withdraw-network`,refresh:"mission"}),
  reactivate_mission:route("management",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/reactivate_mission`,body:()=>({}),refresh:"mission"}),
  start_custody_resolution:route("custody",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/start_custody_resolution`,body:ctx=>custodyBody(ctx,"start_custody_resolution"),refresh:"mission"}),
  start_custody_recovery:route("custody",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/start_custody_recovery`,body:ctx=>custodyBody(ctx,"start_custody_recovery"),refresh:"mission"}),
  confirm_custody_release:route("custody",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/confirm_custody_release`,body:ctx=>({requirementId:id(ctx.payload?.requirementId)}),refresh:"mission"}),
  finalize_custody_transfer:route("custody",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/finalize_custody_transfer`,body:()=>({}),refresh:"mission"}),
  accept_custody:route("custody",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/accept_custody`,body:ctx=>({requirementId:id(ctx.payload?.requirementId)}),refresh:"mission"}),
  reassign_custody_receiver:route("custody",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/reassign_custody_receiver`,body:ctx=>({targetDriverId:id(ctx.payload?.targetDriverId)}),refresh:"mission"}),
  abort_custody_transfer:route("custody",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/mission-management/missions/${id(missionId)}/intents/abort_custody_transfer`,body:()=>({}),refresh:"mission"}),
  review_completion_blocker:route("completion",{kind:"ui",intent:"review_completion_blocker",refresh:"actions"}),

  accept_network:route("network",{kind:"api",method:"POST",endpoint:({networkInvitationId})=>networkInvitationId?`/api/network/invitations/${id(networkInvitationId)}/accept`:null,body:ctx=>({driverId:id(ctx.payload?.driverId)}),refresh:"mission"}),
  request_foryou_mission:route("foryou",{kind:"api",method:"POST",endpoint:({missionId})=>`/api/public/private-missions/${id(missionId)}/request-application`,body:ctx=>({message:String(ctx.payload?.message||"").slice(0,1500),driverId:id(ctx.payload?.driverId),accessCode:String(ctx.payload?.accessCode||"").slice(0,32)}),refresh:"mission"}),
  cancel_foryou_request:route("foryou",{kind:"api",method:"POST",endpoint:({forYouRequestId})=>forYouRequestId?`/api/public/requests/${id(forYouRequestId)}/cancel`:null,refresh:"mission"}),
  reject_network:route("network",{kind:"api",method:"POST",endpoint:({networkInvitationId})=>networkInvitationId?`/api/network/invitations/${id(networkInvitationId)}/reject`:null,refresh:"mission"}),

  approve_foryou_request:route("foryou",{kind:"api",method:"POST",endpoint:({forYouRequestId})=>forYouRequestId?`/api/public/requests/${id(forYouRequestId)}/approve`:null,refresh:"mission"}),
  decline_foryou_request:route("foryou",{kind:"api",method:"POST",endpoint:({forYouRequestId})=>forYouRequestId?`/api/public/requests/${id(forYouRequestId)}/decline`:null,refresh:"mission"}),
});

export function serviceDefinition(code){return ACTION_SERVICE_MAP[String(code||"")]||null;}

export function resolveActionTarget(code,context={}){
  const def=serviceDefinition(code);if(!def)return null;
  if(def.kind==="navigate"){
    const href=value(def.href,context);return href?{kind:"navigate",href,refresh:def.refresh}:null;
  }
  if(def.kind==="ui")return {kind:"ui",intent:def.intent,refresh:def.refresh};
  if(def.kind==="mission_status"){
    return {kind:"mission_status",method:"POST",endpoint:"/api/missions/status",body:{missionId:id(context.missionId),status:def.nextStatus,nextStatus:def.nextStatus},refresh:def.refresh};
  }
  if(def.kind==="api"){
    const endpoint=value(def.endpoint,context);if(!endpoint)return null;
    const body=value(def.body,context);
    // Permanent execution-boundary invariant: a resolved target may never carry
    // an executable function. Dynamic builders are evaluated here, once, against
    // the canonical action context before the target leaves the service map.
    if(typeof body==="function")throw new Error(`Unresolved action payload builder: ${String(code||"")}`);
    return Object.freeze({
      kind:"api",method:def.method||"POST",endpoint,body,refresh:def.refresh,
      // Preserve canonical contextual identifiers on the resolved target. The
      // endpoint may already contain the identifier, but the secured preparation
      // gate re-resolves the Action Service Map and needs the same identifier to
      // reconstruct the exact target without relying on presentation state.
      ...(id(context.networkInvitationId)?{networkInvitationId:id(context.networkInvitationId)}:{}),
      ...(id(context.forYouRequestId)?{forYouRequestId:id(context.forYouRequestId)}:{}),
      ...(id(context.openExceptionId)?{openExceptionId:id(context.openExceptionId)}:{}),
      ...(id(context.requirementId)?{requirementId:id(context.requirementId)}:{})
    });
  }
  return null;
}

export function mappedActionCodes(){return Object.keys(ACTION_SERVICE_MAP);}

function status(nextStatus){return route("mission_flow",{kind:"mission_status",nextStatus,refresh:"mission"});}
function route(domain,config){return Object.freeze({domain,...config});}
function value(v,ctx){return typeof v==="function"?v(ctx):v;}
function custodyBody(ctx,code){const p=ctx?.payload||{};return {channel:String(p.channel||"driver").slice(0,24),recovery:code==="start_custody_recovery"||Boolean(p.recovery),targetDriverId:id(p.targetDriverId),recipientType:String(p.recipientType||"").slice(0,24),recipientId:id(p.recipientId),note:String(p.note||"").slice(0,500)};}
function missionEditBody(ctx){const p=ctx?.payload||{};const text=(v,n)=>String(v??"").slice(0,n);const num=(v)=>v===null||v===undefined||v===""?null:(Number.isFinite(Number(v))?Number(v):null);return {
  pickupCompany:text(p.pickupCompany,200),pickupAddress:text(p.pickupAddress,500),pickupStreet:text(p.pickupStreet,200),pickupZipCode:text(p.pickupZipCode,5),pickupCity:text(p.pickupCity,120),
  deliveryCompany:text(p.deliveryCompany,200),deliveryAddress:text(p.deliveryAddress,500),deliveryStreet:text(p.deliveryStreet,200),deliveryZipCode:text(p.deliveryZipCode,5),deliveryCity:text(p.deliveryCity,120),
  missionDate:text(p.missionDate,32),pickupTime:text(p.pickupTime,8),deliveryTime:text(p.deliveryTime,8),deadlineAt:text(p.deadlineAt,32),scheduleTimezone:text(p.scheduleTimezone,80),missionEndTime:text(p.missionEndTime,8),
  pickupAtUtc:text(p.pickupAtUtc,40),deliveryAtUtc:text(p.deliveryAtUtc,40),deadlineAtUtc:text(p.deadlineAtUtc,40),
  pickupAccessFrom:text(p.pickupAccessFrom,8),pickupAccessTo:text(p.pickupAccessTo,8),deliveryAccessFrom:text(p.deliveryAccessFrom,8),deliveryAccessTo:text(p.deliveryAccessTo,8),
  pickupLatitude:num(p.pickupLatitude),pickupLongitude:num(p.pickupLongitude),deliveryLatitude:num(p.deliveryLatitude),deliveryLongitude:num(p.deliveryLongitude),
  objectType:text(p.objectType,120),objectDescription:text(p.objectDescription,1000),weightKg:num(p.weightKg),volumeM3:num(p.volumeM3),palletCount:num(p.palletCount),vehicleRequirement:text(p.vehicleRequirement,120),loadingType:text(p.loadingType,80),unloadingType:text(p.unloadingType,80),matchingNotes:text(p.matchingNotes,1000),
  publicDescription:text(p.publicDescription,2000),adminMessage:text(p.adminMessage,2000),customerId:num(p.customerId)
};}
function id(v){const n=Number(v||0);return Number.isFinite(n)&&n>0?n:0;}
