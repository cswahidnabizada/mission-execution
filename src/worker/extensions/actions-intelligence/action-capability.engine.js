import {ACTION_CODES as A,ACTION_REGISTRY} from "./action-registry.js";
import {missionTerminalState} from "./mission-terminal.contract.js";

/**
 * Pure/read-only capability engine.
 * "Allowed" means logically available to recommend, NOT authorized to mutate.
 */
export function deriveActionCapabilities(input={}){
  const ctx=normalize(input),candidates=[];

  // ForYou requester states are intentionally isolated from the normal mission
  // action inventory. Discovery exposes exactly the existing canonical request
  // action; a pending request exposes no mutation until the owner decides.
  if(ctx.accessKind==="foryou-discovery"||ctx.accessKind==="foryou-code-discovery"){
    if((ctx.role==="admin"||ctx.role==="executor")&&ctx.status==="Pending"&&!ctx.forYouRequest?.pending&&commercialActionAllowed(ctx,"request_foryou_mission")){
      add(candidates,A.REQUEST_FORYOU_MISSION,true,"Request execution access through ForYou.",ctx);
    }
    return result(ctx,candidates);
  }
  if(ctx.accessKind==="pending-foryou"){
    if((ctx.role==="admin"||ctx.role==="executor")&&ctx.forYouRequest?.pending&&ctx.forYouRequest?.relation==="requester")
      add(candidates,A.CANCEL_FORYOU_REQUEST,true,"Withdraw your pending ForYou request before the owner decides.",ctx);
    return result(ctx,candidates);
  }

  // A custody recipient is a valid participant before execution ownership changes.
  if(ctx.accessKind==="custody-recipient"||ctx.custody?.pending){
    const targetMatches=(ctx.role==="driver"&&ctx.custody?.targetType==="driver")||(ctx.role==="executor"&&ctx.custody?.targetType==="executor");
    if(targetMatches&&ctx.custody?.pending){
      add(candidates,A.ACCEPT_CUSTODY,true,"Accept physical custody when the freight is actually in your possession.",ctx,{requirementId:ctx.custody.requirementId});
      add(candidates,A.REPORT_EXCEPTION,true,"Report an operational problem with the handoff.",ctx);
      add(candidates,A.MESSAGE,true,"Mission communication is available while the custody handoff is pending.",ctx);
    }
    return result(ctx,candidates);
  }

  // Pending Trusted Network invitations are a recipient decision surface, not
  // an execution surface. Do not leak lifecycle, assignment, navigation, or
  // management capabilities before the invitation is accepted. Keep exactly
  // the three useful canonical choices visible: review, accept, reject.
  if(ctx.accessKind==="pending-network"){
    if((ctx.role==="admin"||ctx.role==="executor")&&ctx.networkInvitation?.status==="Pending"){
      add(candidates,A.REVIEW_NETWORK,true,"Review the Trusted Network mission before deciding.",ctx);
      if(commercialActionAllowed(ctx,"accept_network"))add(candidates,A.ACCEPT_NETWORK,true,"Accept this Trusted Network mission.",ctx);
      add(candidates,A.REJECT_NETWORK,true,"Reject this Trusted Network mission.",ctx);
    }
    return result(ctx,candidates);
  }

  add(candidates,A.OPEN_MISSION,true,"The mission is visible to this authorized viewer.",ctx);
  add(candidates,A.MESSAGE,Boolean(ctx.missionId),"Mission communication is available for this mission.",ctx);

  // Terminal mission records remain visible/communicable, but Actions Intelligence
  // must not emit operational, assignment or distribution actions.
  if(ctx.terminal){
    if(ctx.role==="admin"&&ctx.perspective?.isOwner&&!ctx.shared){
      add(candidates,A.DELETE_MISSION,true,"The owning tenant can permanently remove this terminal mission.",ctx);
    }
    return result(ctx,candidates);
  }

  add(candidates,A.REVIEW_NETWORK,Boolean(ctx.networkInvitation?.status==="Pending"),"A Network mission requires a user decision.",ctx);
  add(candidates,A.REVIEW_FORYOU,Boolean(ctx.forYouRequest?.status==="Pending"&&ctx.forYouRequest?.relation==="owner"),"A ForYou request requires a user decision.",ctx);


  const missingRequired=Array.isArray(ctx.missingRequired)&&ctx.missingRequired.length>0;
  add(candidates,A.EDIT_MISSION,Boolean(missingRequired&&ctx.role==="admin"&&ctx.perspective?.isOwner),"Required mission data must be completed before execution can safely continue.",ctx);

  if(ctx.role==="admin"){
    if(ctx.perspective?.isOwner&&ctx.responsibility?.transitionRequired&&ctx.responsibility?.canReclaimExecution){
      add(candidates,A.RECLAIM_EXECUTION,true,"External execution responsibility is active. Take it back only when lifecycle and custody rules allow it.",ctx);
    }
    if(ctx.perspective?.isOwner&&ctx.responsibility?.partnerAssignmentMissing){
      add(candidates,A.CHECK_ASSIGNMENT,true,"The execution partner has not assigned its driver yet.",ctx);
    }

    // Reuse the existing Assignment Intelligence as the authoritative decision.
    // Do not infer assignment eligibility from presentation state.
    const ownsDriverAction=Boolean(
      ctx.perspective?.isExecutingTenant ||
      (ctx.perspective?.isOwner && ctx.responsibility?.responsibilityOwner==="owner" && !ctx.shared)
    );
    const assignmentFeature=ctx.assignmentFeature||{};
    const intelligenceCanAssign=Boolean(ctx.responsibility?.canAssign||ctx.responsibility?.canReassign);
    const needsDriver=Boolean(
      ctx.responsibility?.assignmentRequired ||
      ctx.responsibility?.viewerMustAssign ||
      assignmentFeature.assignmentRequired ||
      intelligenceCanAssign
    );
    const acquisitionWaiting=Boolean(
      ctx.responsibility?.acquisitionWaiting ??
      assignmentFeature.acquisitionWaiting
    );
    const assignmentMutable=ctx.responsibility?.assignmentMutable!==false && assignmentFeature.assignmentMutable!==false;
    if((ownsDriverAction||intelligenceCanAssign)&&needsDriver&&!acquisitionWaiting&&assignmentMutable){
      const ownerChoice=Boolean(ctx.perspective?.isOwner&&!ctx.shared);
      add(candidates,A.ASSIGN_DRIVER,true,
        ownerChoice?"Choose how this mission should be executed.":"This tenant owns the unresolved driver assignment.",
        ctx,{label:ownerChoice?"Assign Execution":"Assign Driver"});
    }

    const hasLocalDriver=Boolean(ctx.responsibility?.driverId&&(
      ctx.perspective?.isExecutingTenant ||
      ctx.responsibility?.assignmentSource==="owner"
    ));

    // One adaptive assignment capability owns both states. The action identity
    // stays assign_driver; its presentation changes from Assign Executor to
    // Change Driver once a local executor exists. This prevents two cards for
    // the same responsibility change.
    if(ownsDriverAction&&!ctx.completed&&assignmentMutable){
      const unavailable=ctx.responsibility?.driverAvailable===false;
      if(hasLocalDriver && ctx.responsibility?.canReassign){
        add(candidates,A.ASSIGN_DRIVER,true,
          unavailable?"The assigned driver is unavailable. Choose another valid driver.":"Choose another driver for this mission.",
          ctx,{label:"Change Driver"});
      }else if(!hasLocalDriver&&(ownsDriverAction||intelligenceCanAssign)&&needsDriver&&!acquisitionWaiting){
        const ownerChoice=Boolean(ctx.perspective?.isOwner&&!ctx.shared);
        add(candidates,A.ASSIGN_DRIVER,true,
          ownerChoice?"Choose the executor for this mission.":"Choose an executor for this mission.",
          ctx,{label:ownerChoice?"Assign Executor":"Assign Driver"});
      }
    }

    // Sharing remains available to the owning tenant throughout an open mission
    // while no external execution owner currently controls the mission. The
    // selected sharing route is still revalidated by the secured service.
    const canStartDistribution=Boolean(
      ctx.perspective?.isOwner &&
      (ctx.source?.owned || ctx.accessKind === "owner") &&
      !ctx.shared &&
      !ctx.responsibility?.executorId &&
      !ctx.responsibility?.executingTenantId &&
      !ctx.responsibility?.acquisitionWaiting
    );
    if(canStartDistribution){
      if(commercialActionAllowed(ctx,"share_foryou"))add(candidates,A.SHARE_FORYOU,true,"Offer this mission through ForYou for approved execution requests.",ctx);
      if(commercialActionAllowed(ctx,"share_network"))add(candidates,A.SHARE_NETWORK,true,"Offer this mission to a trusted Network execution partner.",ctx);
    }

    // Distribution control belongs to the same mission action inventory.
    // These are only emitted for the owning tenant while the corresponding
    // channel is actually active; the secured distribution service rechecks it.
    const forYouActive=Boolean(ctx.foryou?.private || ctx.source?.publicEnabled && ctx.source?.owned);
    const networkPending=Boolean(ctx.networkInvitation?.relation==="owner" && ctx.networkInvitation?.status==="Pending");
    if(ctx.role==="admin"&&forYouActive){
      add(candidates,A.WITHDRAW_FORYOU,true,"Remove this mission from ForYou.",ctx);
    }
    if(ctx.role==="admin"&&networkPending){
      add(candidates,A.WITHDRAW_NETWORK,true,"Cancel the current Trusted Network share.",ctx);
    }
  }

  const personalExecutionReady=ctx.readyToGo!==false && ["driver","executor"].includes(ctx.role) && (ctx.executionBelongsToViewer || Boolean(ctx.personalAssignmentId));
  if(personalExecutionReady&&!ctx.completed){
    add(candidates,A.CAPTURE_DELIVERY_PROOF,Boolean(["InTransit","Delivered"].includes(ctx.status)&&ctx.deliveryProofRequired&&ctx.deliveryProofMissing),"Required delivery proof must be captured before the mission can safely continue.",ctx);
    add(candidates,A.ADVANCE_EXECUTION,!ctx.completed,"Continue the current execution step through the canonical lifecycle.",ctx);
    addLifecycleFlowActions(candidates,ctx);
    add(candidates,A.REPORT_EXCEPTION,true,"The active executor may report an operational exception.",ctx);
    add(candidates,A.NAVIGATE,Boolean(ctx.pickupAddress||ctx.deliveryAddress),"Navigation is available for the current mission route.",ctx);
  }

  if(ctx.openException&&["admin","driver","executor"].includes(ctx.role)){
    add(candidates,A.RESOLVE_EXCEPTION,Boolean(ctx.canResolveException),"The current viewer may resolve this open exception under existing mission permissions.",ctx);
  }

  if(ctx.networkInvitation){
    const canRespond=["admin","executor"].includes(ctx.role)&&ctx.networkInvitation.status==="Pending";
    add(candidates,A.ACCEPT_NETWORK,canRespond&&commercialActionAllowed(ctx,"accept_network"),"A pending authorized Network invitation can be accepted.",ctx);
    add(candidates,A.REJECT_NETWORK,canRespond,"A pending authorized Network invitation can be rejected.",ctx);
  }

  if(ctx.forYouRequest){
    const pending=ctx.forYouRequest.status==="Pending";
    const ownerCanRespond=ctx.role==="admin"&&ctx.forYouRequest.relation==="owner";
    if(ownerCanRespond){
      add(candidates,A.APPROVE_FORYOU_REQUEST,pending,"A pending ForYou request can be approved by the mission owner.",ctx);
      add(candidates,A.DECLINE_FORYOU_REQUEST,pending,"A pending ForYou request can be rejected by the mission owner.",ctx);
    }
  }

  return result(ctx,candidates);
}

function result(ctx,candidates){
  return {
    version:"1.1",
    missionId:ctx.missionId,
    role:ctx.role,
    viewer:ctx.perspective?.viewer||ctx.role,
    status:ctx.status,
    terminal:ctx.terminal,
    terminalReason:ctx.terminalReason,
    completed:ctx.completed,
    cancelled:ctx.cancelled,
    capabilities:candidates.filter(x=>x.allowed),
    denied:candidates.filter(x=>!x.allowed)
  };
}

function addLifecycleFlowActions(out,ctx){
  const lifecycle=ctx.lifecycle;
  const current=normalizeLifecycleState(ctx.status);
  const transitions=Array.isArray(lifecycle?.transitions)?lifecycle.transitions:[];
  const seen=new Set();
  for(const transition of transitions){
    const from=normalizeLifecycleState(transition.fromStateCode);
    const actionCode=String(transition.actionCode||'').trim();
    if(from!==current||!actionCode||seen.has(actionCode))continue;
    // Cancellation and administrative lifecycle actions are surfaced by their
    // existing management capabilities. Execution progression comes from the
    // canonical lifecycle contract, never from a sector-name conditional.
    if(!['confirm_arrival','confirm_pickup','start_transit','start_operation','confirm_delivery','complete_mission','complete_operation'].includes(actionCode))continue;
    const def=ACTION_REGISTRY[actionCode];
    const reason=actionCode==='start_operation'?"Start the sector operation through the canonical lifecycle.":actionCode==='complete_operation'?"Complete the sector operation through the canonical lifecycle.":String(def?.label||'Continue the canonical lifecycle.');
    add(out,actionCode,true,reason,ctx);
    seen.add(actionCode);
  }
}

function normalizeLifecycleState(value){
  return String(value||'').trim().toUpperCase().replaceAll('PICKEDUP','PICKED_UP').replaceAll('INTRANSIT','IN_TRANSIT').replaceAll('INPROGRESS','IN_PROGRESS');
}

function add(out,code,allowed,reason,ctx,override={}){
  const def=ACTION_REGISTRY[code];if(!def)return;
  const roleAllowed=!def.roles?.length||def.roles.includes(ctx.role);
  const statusAllowed=!def.requiredStatus||def.requiredStatus===ctx.status;
  out.push({
    code,label:override.label||def.label,domain:def.domain,
    allowed:Boolean(allowed&&roleAllowed&&statusAllowed),
    reason:String(reason||""),
    confirmation:Boolean(def.confirmation),
    requiredStatus:def.requiredStatus||null,
    nextStatus:def.nextStatus||null,
    ...(override.requirementId?{requirementId:Number(override.requirementId)||null}:{}),
    ...(override.nextActionCode?{nextActionCode:String(override.nextActionCode)}:{})
  });
}

function commercialActionAllowed(ctx,code){
  const decision=ctx.situation?.actions?.[String(code||"")];
  return decision ? decision.allowed===true : true;
}

function normalize(input){
  const c=input.conditions||input,context=c.context||input.context||{},feature=input.featureState||{};
  const perspective=c.perspective||input.perspective||{},baseResponsibility=c.responsibility||input.responsibility||{};
  const responsibility={
    ...baseResponsibility,
    transitionRequired:feature.assignment?.transitionRequired??baseResponsibility.transitionRequired,
    acquisitionWaiting:feature.assignment?.acquisitionWaiting??baseResponsibility.marketplaceWaiting??baseResponsibility.networkWaiting,
    assignmentMutable:feature.assignment?.assignmentMutable??baseResponsibility.assignmentMutable,
    canReassign:feature.assignment?.canReassign??baseResponsibility.canReassign,
    driverAvailable:feature.assignment?.driverAvailable??baseResponsibility.driverAvailable,
    driverSituation:feature.assignment?.driverSituation??baseResponsibility.driverSituation,
    canReclaimExecution:feature.assignment?.canReclaimExecution??baseResponsibility.canReclaimExecution,
    transitionType:feature.assignment?.transitionType||baseResponsibility.transitionType||null
  };
  const mission=input.mission||{},role=String(c.role||context.role||input.role||"");
  const missionId=Number(c.missionId||context.identity?.missionId||mission.id||0)||null;
  const status=String(c.status||context.lifecycle?.status||mission.status||"Pending");
  const terminalState=missionTerminalState(status);
  const completed=Boolean(c.completed||context.lifecycle?.completed||terminalState.completed);
  const cancelled=Boolean(terminalState.cancelled);
  const terminal=Boolean(terminalState.terminal||completed);
  const terminalReason=completed?"COMPLETED":terminalState.reason;

  const viewerDriverId=Number(input.viewerDriverId||0),viewerExecutorId=Number(input.viewerExecutorId||0);
  const assignedDriverId=Number(responsibility.driverId||context.execution?.sharedDriverId||context.execution?.driverId||0);
  const assignedExecutorId=Number(responsibility.executorId||context.execution?.executorId||0);
  const executionBelongsToViewer=
    role==="driver"?Boolean(viewerDriverId&&assignedDriverId===viewerDriverId):
    role==="executor"?Boolean(viewerExecutorId&&assignedExecutorId===viewerExecutorId):
    false;

  return {
    role,accessKind:String(c.accessKind||context.accessKind||""),missionId,status,terminal,terminalReason,completed,cancelled,perspective,responsibility,assignmentFeature:feature.assignment||{},mission,situation:input.situation||feature.situation||null,
    source:c.source||context.distribution||{},
    shared:String(c.accessKind||context.accessKind||"")==="shared-tenant"||Boolean(context.distribution?.shared),
    executionBelongsToViewer,
    personalAssignmentId:role==="executor"?Number(responsibility.executorId||mission.assigned_executor_id||mission.owner_assigned_executor_id||0)||null:role==="driver"?Number(responsibility.driverId||mission.owner_driver_id||mission.shared_driver_id||0)||null:null,
    readyToGo:Boolean(input.readyToGo??input.situation?.readyToGo??true),
    pickupAddress:String(context.route?.pickupAddress||mission.pickup_address||""),
    deliveryAddress:String(context.route?.deliveryAddress||mission.delivery_address||""),
    openException:feature.exceptions?.open!==undefined?Boolean(feature.exceptions.open):Boolean(input.openException),
    canResolveException:feature.exceptions?.resolvable!==undefined?Boolean(feature.exceptions.resolvable):Boolean(input.canResolveException),
    custody:feature.custody||null,
    networkInvitation:input.networkInvitation||(feature.network?.pending?{id:feature.network.id,status:feature.network.status,relation:feature.network.relation}:null),
    forYouRequest:input.forYouRequest||(feature.foryou?.pending?{id:feature.foryou.id,status:"Pending",relation:feature.foryou.relation,pending:true}:null),
    foryou:feature.foryou||null,
    missingRequired:Array.isArray(feature.missionData?.missingRequired)?feature.missionData.missingRequired:(Array.isArray(c.dataQuality?.missingRequired)?c.dataQuality.missingRequired:[]),
    sectorCode:String(context.lifecycle?.sectorCode||mission.sector_code||c.sectorCode||"logistics").toLowerCase(),
    driverUnavailable:feature.assignment?.driverAvailable===false||Boolean(input.driverUnavailable),
    deliveryProofRequired:Boolean(feature.deliveryProof?.required),
    deliveryProofMissing:Boolean(feature.deliveryProof?.missing)
  };
}
