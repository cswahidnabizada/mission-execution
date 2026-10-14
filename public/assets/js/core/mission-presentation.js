
export function missionAddressParts(m={},prefix="pickup"){const legacy=String(m?.[`${prefix}_address`]||m?.[`${prefix}Address`]||"").trim();return {street:String(m?.[`${prefix}_street`]||m?.[`${prefix}Street`]||"").trim(),zipCode:String(m?.[`${prefix}_zip_code`]||m?.[`${prefix}ZipCode`]||"").trim(),city:String(m?.[`${prefix}_city`]||m?.[`${prefix}City`]||"").trim(),legacy};}
export function formatMissionAddress(m={},prefix="pickup"){const a=missionAddressParts(m,prefix);const structured=[a.street,[a.zipCode,a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");return structured||a.legacy||"Address unavailable";}
import {MISSION_STATUS_FLOW,canonicalMissionStatus,nextLifecycleStatus,lifecycleDefinition} from "./lifecycle-registry.js";
export {MISSION_STATUS_FLOW};

export const MISSION_ACTIONS={
  Pending:{next:"Arrived",icon:"📍",label:"CONFIRM ARRIVAL",title:"Reach the pickup",hint:"The mission is moving toward pickup. Confirm when the pickup site is reached."},
  Arrived:{next:"PickedUp",icon:"📦",label:"CONFIRM PICKUP",title:"Secure the pickup",hint:"The pickup site has been reached. Confirm once the shipment is collected."},
  PickedUp:{next:"InTransit",icon:"▶",label:"START TRANSIT",title:"Start the journey",hint:"The shipment is secured. Start transit when the vehicle leaves pickup."},
  InTransit:{next:"Delivered",icon:"📷",label:"PROVE & CONFIRM DELIVERY",title:"Finish the delivery",hint:"The mission is on the road. Delivery proof is required at the destination."},
  Delivered:{next:"Completed",icon:"✓",label:"COMPLETE MISSION",title:"Close the mission",hint:"Delivery is confirmed. Complete the mission when execution is fully closed."}
};

const STATUS_LABELS={Pending:"Pending",Arrived:"Arrived",PickedUp:"Picked up",InTransit:"In transit",Delivered:"Delivered",Completed:"Completed"};
const STATUS_HEADLINES={
  Pending:"Ready to begin",
  Arrived:"At pickup",
  PickedUp:"Pickup secured",
  InTransit:"Moving to destination",
  Delivered:"Delivery confirmed",
  Completed:"Mission complete"
};
const STATUS_SUMMARIES={
  Pending:"The mission is ready and waiting for pickup execution.",
  Arrived:"The execution team has reached the pickup site.",
  PickedUp:"The shipment has been collected and is ready to move.",
  InTransit:"The shipment is travelling from pickup to delivery.",
  Delivered:"The shipment reached its destination and delivery is confirmed.",
  Completed:"Execution is closed. The mission record remains available."
};

export function missionStatusLabel(status){const s=canonicalMissionStatus(status);return STATUS_LABELS[s]||s||"-";}

export function buildMissionPresentationState({mission={},permissions={},role="",openExceptions=0}={}){
  const status=canonicalMissionStatus(mission.status);
  const index=MISSION_STATUS_FLOW.indexOf(status);
  const progress=[5,20,38,62,82,100][Math.max(0,index)]??5;
  const action=MISSION_ACTIONS[status]||null;
  const lifecycle=lifecycleDefinition(status);
  const canAct=Boolean(permissions?.canUpdateStatus)&&["driver","executor"].includes(role)&&Boolean(action);
  const completed=status==="Completed";
  const attention=Number(openExceptions||0)>0;
  const publicMission=Number(mission.public_enabled)===1;

  return {
    reference:mission.reference||"Mission",
    status,
    statusLabel:missionStatusLabel(status),
    headline:STATUS_HEADLINES[status]||missionStatusLabel(status),
    summary:STATUS_SUMMARIES[status]||"Mission execution is in progress.",
    progress,
    completed,
    lifecycle:lifecycle?{stage:lifecycle.stage,terminal:lifecycle.terminal,allowedSuccessors:lifecycle.allowedSuccessors}:null,
    attention,
    attentionCount:Number(openExceptions||0),
    visibility:publicMission?"FORYOU":"PRIVATE",
    owner:mission.owner_company_name||mission.company_name||mission.companyName||"Logistics tenant",
    executor:mission.shared_driver_name||mission.driver_name||mission.executor_name||"Unassigned",
    start:{
      company:mission.pickup_company||"Pickup",
      address:formatMissionAddress(mission,"pickup")
    },
    finish:{
      company:mission.delivery_company||"Delivery",
      address:formatMissionAddress(mission,"delivery")
    },
    next:action?{
      status:action.next,
      statusLabel:missionStatusLabel(action.next),
      icon:action.icon,
      label:action.label,
      title:action.title,
      hint:action.hint,
      actionable:canAct
    }:null,
    roleLabel:role==="driver"?"EXECUTOR":role==="executor"?"EXECUTOR":permissions?.canEdit?"OWNER TENANT":"MISSION ACCESS"
  };
}
