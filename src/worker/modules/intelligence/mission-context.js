import {MISSION_STATUS_FLOW,canonicalMissionStatus,nextLifecycleStatus,isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";

/**
 * Mission Context — one normalized, read-only input contract for intelligence engines.
 * It receives an already-authorized mission row plus session context.
 * It performs no DB access and no mutations.
 */
export function buildMissionContext(mission,{role="",accessKind="owner",now=Date.now()}={}){
  const m=mission||{};
  const status=canonicalMissionStatus(m.status);
  const statusIndex=MISSION_STATUS_FLOW.indexOf(status);
  const deadlineAt=parseTime(m.deadline_at_utc||m.deadline_at);
  const pickupAt=parseTime(m.pickup_at_utc||m.pickup_at);
  const statusChangedAt=parseTime(m.status_changed_at||m.updated_at||m.created_at);
  const updatedAt=parseTime(m.updated_at||m.created_at);
  const createdAt=parseTime(m.created_at);

  return Object.freeze({
    kind:"mission_context",
    now:Number(now),
    role:String(role||""),
    accessKind:String(accessKind||"owner"),

    identity:Object.freeze({
      missionId:Number(m.id||0),
      reference:String(m.reference||""),
      ownerCompanyId:Number(m.company_id||0)||null,
      ownerCompanyName:String(m.owner_company_name||m.company_name||"")
    }),

    lifecycle:Object.freeze({
      status,
      statusIndex,
      completed:status==="Completed",
      terminal:isLifecycleTerminal(status),
      nextStatus:nextLifecycleStatus(status)
    }),

    route:Object.freeze({
      pickupCompany:String(m.pickup_company||""),
      pickupAddress:String(m.pickup_address||""),
      pickupStreet:String(m.pickup_street||""),
      pickupZipCode:String(m.pickup_zip_code||""),
      pickupCity:String(m.pickup_city||""),
      deliveryCompany:String(m.delivery_company||""),
      deliveryAddress:String(m.delivery_address||""),
      deliveryStreet:String(m.delivery_street||""),
      deliveryZipCode:String(m.delivery_zip_code||""),
      deliveryCity:String(m.delivery_city||"")
    }),

    cargo:Object.freeze({
      type:String(m.object_type||""),description:String(m.object_description||""),weightKg:Number(m.weight_kg||0)||null,volumeM3:Number(m.volume_m3||0)||null,palletCount:Number(m.pallet_count||0)||null
    }),

    requirements:Object.freeze({
      vehicle:String(m.vehicle_requirement||""),loading:String(m.loading_type||""),unloading:String(m.unloading_type||""),matchingNotes:String(m.matching_notes||"")
    }),

    schedule:Object.freeze({
      pickupAt,
      deadlineAt
    }),

    timestamps:Object.freeze({
      createdAt,
      updatedAt,
      statusChangedAt
    }),

    execution:Object.freeze({
      driverId:Number(m.owner_driver_id||0)||null,
      sharedDriverId:Number(m.shared_driver_id||0)||null,
      executorId:Number(m.assigned_executor_id||m.owner_assigned_executor_id||0)||null,
      driverName:String(m.shared_driver_name||m.owner_driver_name||m.driver_name||""),
      executorName:String(m.owner_executor_name||m.executor_name||""),
      ownerDriverId:Number(m.owner_driver_id||0)||null,
      ownerDriverName:String(m.owner_driver_name||m.driver_name||""),
      ownerExecutorId:Number(m.owner_assigned_executor_id||m.assigned_executor_id||0)||null,
      ownerExecutorName:String(m.owner_executor_name||m.executor_name||""),
      executingTenantId:Number(m.executing_tenant_id||0)||null,
      executingTenantName:String(m.executing_tenant_name||""),
      executingTenantDriverId:Number(m.executing_tenant_driver_id||m.shared_driver_id||0)||null,
      executingTenantDriverName:String(m.executing_tenant_driver_name||m.shared_driver_name||""),
      hasExecutor:Boolean(m.owner_driver_id||m.shared_driver_id||m.assigned_executor_id||m.owner_assigned_executor_id||m.executing_tenant_driver_id)
    }),

    distribution:Object.freeze({
      owned:accessKind==="owner",
      shared:Number(m.shared_access||0)===1||accessKind==="shared-tenant",
      publicEnabled:Number(m.public_enabled||0)===1,
      marketplace:Boolean(Number(m.public_enabled||0)===1&&!m.owner_driver_id&&!m.shared_driver_id&&!m.assigned_executor_id)
    }),

    marketplace:Object.freeze({
      published:Boolean(Number(m.public_enabled||0)===1),
      routeReady:Boolean(String(m.pickup_city||m.pickup_address||m.pickup_street||"").trim()&&String(m.delivery_city||m.delivery_address||m.delivery_street||"").trim()),
      waitingForExecutor:Boolean(Number(m.public_enabled||0)===1&&!m.owner_driver_id&&!m.shared_driver_id&&!m.assigned_executor_id),
      eligible:Boolean(Number(m.public_enabled||0)===1&&!m.owner_driver_id&&!m.shared_driver_id&&!m.assigned_executor_id&&status==="Pending"),
      channel:"MARKETPLACE",
      recommendationReady:Boolean(Number(m.public_enabled||0)===1&&status==="Pending")
    }),

    proof:Object.freeze({
      deliveryProofPresent:Boolean(m.delivery_proof_url||m.delivery_proof_key||m.proof_url||m.proof_key),
      completionTimestampPresent:Boolean(m.completed_at)
    }),

    dataQuality:Object.freeze({
      hasReference:Boolean(String(m.reference||"").trim()),
      hasPickupAddress:Boolean(String(m.pickup_address||m.pickup_street||"").trim()),
      hasDeliveryAddress:Boolean(String(m.delivery_address||m.delivery_street||"").trim()),
      hasStructuredPickupAddress:Boolean(String(m.pickup_street||"").trim()&&String(m.pickup_city||"").trim()),
      hasStructuredDeliveryAddress:Boolean(String(m.delivery_street||"").trim()&&String(m.delivery_city||"").trim()),
      hasCargo:Boolean(String(m.object_type||m.object_description||"").trim()||Number(m.weight_kg||0)>0||Number(m.volume_m3||0)>0||Number(m.pallet_count||0)>0),
      hasExecutionRequirements:Boolean(String(m.vehicle_requirement||m.loading_type||m.unloading_type||"").trim()),
      hasPickupTime:pickupAt!==null,
      hasDeadline:deadlineAt!==null,
      hasUpdatedAt:updatedAt!==null
    })
  });
}

export function isMissionContext(value){return value?.kind==="mission_context"&&value?.identity&&value?.lifecycle;}

function parseTime(v){
  if(v===null||v===undefined||v==="")return null;
  if(typeof v==="number"&&Number.isFinite(v))return v;
  const raw=String(v).trim();
  // D1 CURRENT_TIMESTAMP is UTC but may arrive without a zone. Normalize it explicitly.
  const normalized=/Z$|[+-]\d\d:\d\d$/.test(raw)?raw:(raw.includes("T")?`${raw}Z`:`${raw.replace(" ","T")}Z`);
  const n=Date.parse(normalized);
  return Number.isFinite(n)?n:null;
}
