const FLOW=Object.freeze({
  Pending:{code:"confirm_arrival",label:"Confirm Arrival"},
  Arrived:{code:"confirm_pickup",label:"Confirm Pickup"},
  PickedUp:{code:"start_transit",label:"Start Transit"},
  InTransit:{code:"confirm_delivery",label:"Confirm Delivery"},
  Delivered:{code:"complete_mission",label:"Complete Mission"}
});

export function deriveExecutionHandoff({conditions={},featureState={},readiness={},session={}}={}){
  const status=String(conditions.status||"Pending");
  const r=conditions.responsibility||{},p=conditions.perspective||{};
  const assignment=featureState.assignment||{},proof=featureState.deliveryProof||{};
  const viewerRole=String(session.role||conditions.role||"");
  const viewerId=viewerIdentity(session);

  if(["Completed","Cancelled","Canceled"].includes(status)){
    return contract({
      state:"closed",nextActor:null,nextAction:null,waitingFor:null,
      canViewerExecute:false,canViewerIntervene:false,
      handoffReason:status==="Completed"?"mission_completed":"mission_cancelled"
    });
  }

  // Owner/business decisions remain with the owner, not an execution actor.
  if(featureState.foryou?.pending&&featureState.foryou?.relation==="owner"){
    return tenantHandoff("review_foryou","Review ForYou Request","owner_decision",session,p,r);
  }
  if(featureState.network?.invitationPending&&featureState.network?.relation==="recipient"){
    return viewerHandoff("review_network","Review Network Mission","recipient_decision",session);
  }

  // Data/assignment blockers transfer responsibility to the responsible tenant.
  if(featureState.missionData?.executionReady===false){
    return tenantHandoff("edit_mission_data","Complete Mission Data","mission_data_incomplete",session,p,r);
  }
  if(assignment.assignmentRequired||assignment.unassigned||r.viewerMustAssign||r.partnerAssignmentMissing){
    const action=r.partnerAssignmentMissing&&p.isOwner?"check_assignment":"assign_driver";
    const label=action==="check_assignment"?"Check Assignment":"Assign Driver";
    return tenantHandoff(action,label,r.partnerAssignmentMissing?"partner_assignment_missing":"assignment_required",session,p,r);
  }
  if(assignment.driverAvailable===false){
    return tenantHandoff("change_driver","Change Driver","assigned_driver_unavailable",session,p,r);
  }

  // Critical/open exceptions can temporarily supersede normal lifecycle flow.
  if(featureState.exceptions?.open){
    const resolvable=Boolean(featureState.exceptions.resolvable);
    if(resolvable){
      return viewerHandoff("resolve_exception","Resolve Exception","open_exception",session);
    }
    return tenantHandoff("message","Coordinate Exception","open_exception_requires_coordination",session,p,r);
  }

  // Delivery proof is an execution responsibility immediately before delivery.
  if(["InTransit","Delivered"].includes(status)&&proof.required&&proof.missing){
    return executionHandoff("capture_delivery_proof","Capture Delivery Proof","delivery_proof_required",session,r,assignment);
  }

  const next=FLOW[status];
  if(next)return executionHandoff(next.code,next.label,"mission_flow",session,r,assignment);

  return contract({
    state:readiness?.readiness==="BLOCKED"?"blocked":"clear",
    nextActor:null,nextAction:null,waitingFor:null,
    canViewerExecute:false,canViewerIntervene:false,
    handoffReason:"no_next_execution_step"
  });
}

function executionHandoff(code,label,reason,session,r,assignment){
  const executorId=Number(r.executorId||0)||null;
  const driverId=Number(assignment.driverId||r.driverId||0)||null;
  const actor=executorId
    ?{type:"executor",id:executorId,name:String(r.executorName||"Executor")}
    :driverId
      ?{type:"driver",id:driverId,name:String(r.driverName||"Driver")}
      :null;

  if(!actor){
    return contract({
      state:"blocked",nextActor:{type:"tenant",id:Number(r.responsibilityCompanyId||0)||null,name:String(r.responsibilityCompanyName||"Responsible tenant")},
      nextAction:{code:"assign_driver",label:"Assign Driver"},waitingFor:String(r.responsibilityCompanyName||"Responsible tenant"),
      canViewerExecute:false,canViewerIntervene:session.role==="admin",
      handoffReason:"execution_actor_missing"
    });
  }

  const mine=actor.type===session.role&&Number(actor.id)===Number(actor.type==="driver"?session.driverId:session.executorId);
  return contract({
    state:mine?"action_required":"waiting",
    nextActor:actor,nextAction:{code,label},
    waitingFor:mine?null:actor.name,
    canViewerExecute:mine,
    canViewerIntervene:false,
    handoffReason:reason
  });
}

function ownerHandoff(code,label,reason,session,p,conditions){
  const ownerId=Number(conditions?.context?.identity?.ownerCompanyId||conditions?.context?.raw?.company_id||0)||null;
  const ownerName=String(conditions?.context?.identity?.ownerCompanyName||p.ownerName||"Owning tenant");
  const mine=session.role==="admin"&&Number(session.tenantId||0)===Number(ownerId||0);
  return contract({
    state:mine?"action_required":"waiting",
    nextActor:{type:"tenant",id:ownerId,name:ownerName},
    nextAction:{code,label},waitingFor:mine?null:ownerName,
    canViewerExecute:mine,canViewerIntervene:mine,handoffReason:reason
  });
}

function tenantHandoff(code,label,reason,session,p,r){
  const responsibleCompanyId=Number(r.responsibilityCompanyId||0)||null;
  const responsibleName=String(r.responsibilityCompanyName||p.executionCompany||p.ownerName||"Responsible tenant");
  const viewerResponsible=Boolean(
    session.role==="admin"&&(
      (p.isOwner&&r.responsibilityOwner!=="tenant")||
      p.isExecutingTenant||
      (responsibleCompanyId&&Number(session.tenantId)===responsibleCompanyId)
    )
  );
  return contract({
    state:viewerResponsible?"action_required":"waiting",
    nextActor:{type:"tenant",id:responsibleCompanyId,name:responsibleName},
    nextAction:{code,label},
    waitingFor:viewerResponsible?null:responsibleName,
    canViewerExecute:viewerResponsible,
    canViewerIntervene:viewerResponsible,
    handoffReason:reason
  });
}

function viewerHandoff(code,label,reason,session){
  return contract({
    state:"action_required",
    nextActor:{type:String(session.role||"viewer"),id:viewerIdentity(session),name:String(session.displayName||"You")},
    nextAction:{code,label},waitingFor:null,canViewerExecute:true,canViewerIntervene:false,handoffReason:reason
  });
}

function viewerIdentity(session){
  if(session.role==="driver")return Number(session.driverId||0)||null;
  if(session.role==="executor")return Number(session.executorId||0)||null;
  if(session.role==="admin")return Number(session.tenantId||0)||null;
  return null;
}

function contract(v){return Object.freeze({version:"1.0",...v});}
