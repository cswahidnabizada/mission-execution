import {missionTerminalState} from "./mission-terminal.contract.js";
export function buildActionState(capabilities,options={}){
  const c=options.conditions||{},r=c.responsibility||{},p=c.perspective||{},f=options.featureState||{},custody=f.custody||{};
  const missionData=f.missionData||{},assignment=f.assignment||{},exceptions=f.exceptions||{},
    proof=f.deliveryProof||{},network=f.network||{},foryou=f.foryou||{},messaging=f.messaging||{};
  const legacyMissing=Array.isArray(c.dataQuality?.missingRequired)?c.dataQuality.missingRequired:[];
  const status=String(c.status||capabilities?.status||"");
  const terminalState=missionTerminalState(status);
  const completed=Boolean(c.completed||capabilities?.completed||terminalState.completed);
  const cancelled=Boolean(capabilities?.cancelled||terminalState.cancelled);
  const terminal=Boolean(capabilities?.terminal||terminalState.terminal||completed);

  return Object.freeze({
    missionId:Number(c.missionId||capabilities?.missionId||0)||null,
    role:String(c.role||capabilities?.role||""),
    viewer:String(p.viewer||capabilities?.viewer||""),
    status,
    terminal,
    terminalReason:completed?"COMPLETED":cancelled?"CANCELLED":null,
    completed,
    cancelled,
    accessKind:String(c.accessKind||"owner"),

    missionData:Object.freeze({
      complete:missionData.complete!==undefined?Boolean(missionData.complete):legacyMissing.length===0,
      executionReady:missionData.executionReady!==undefined?Boolean(missionData.executionReady):legacyMissing.length===0,
      missingRequired:Object.freeze([...(missionData.missingRequired||legacyMissing)]),
      missingExecutionRequired:Object.freeze([...(missionData.missingExecutionRequired||legacyMissing)])
    }),

    responsibility:Object.freeze({
      assignmentRequired:Boolean(assignment.assignmentRequired??r.assignmentRequired),
      acquisitionWaiting:Boolean(assignment.acquisitionWaiting??r.marketplaceWaiting??r.networkWaiting),
      viewerMustAssign:Boolean(r.viewerMustAssign),
      partnerAssignmentMissing:Boolean(assignment.partnerAssignmentMissing??r.partnerAssignmentMissing),
      executionResolved:Boolean(assignment.assigned??r.executionResolved),
      driverAvailable:assignment.driverAvailable??null,
      driverSituation:assignment.driverSituation||null,
      canReassign:Boolean(assignment.canReassign??r.canReassign),
      assignmentMutable:Boolean(assignment.assignmentMutable??r.assignmentMutable),
      assignmentWindow:assignment.assignmentWindow||r.assignmentWindow||null,
      responsibilityOwner:r.responsibilityOwner||null,
      isOwner:Boolean(p.isOwner),
      isExecutingTenant:Boolean(p.isExecutingTenant),
      isPersonal:Boolean(p.isPersonal),
      transitionRequired:Boolean(assignment.transitionRequired),
      transitionType:assignment.transitionType||null,
      canReclaimExecution:Boolean(assignment.canReclaimExecution),
      executorId:Number(assignment.executorId||r.executorId||0)||null,
      executorName:assignment.executorName||r.executorName||null
    }),

    exceptions:Object.freeze({
      open:exceptions.open!==undefined?Boolean(exceptions.open):Boolean(options.openException),
      resolvable:exceptions.resolvable!==undefined?Boolean(exceptions.resolvable):Boolean(options.canResolveException),
      severity:exceptions.highestSeverity||null,
      primaryExceptionId:Number(exceptions.primaryExceptionId||options.openExceptionId||0)||null
    }),

    deliveryProof:Object.freeze({
      required:Boolean(proof.required),
      missing:Boolean(proof.missing),
      complete:proof.complete!==false
    }),

    network:Object.freeze({
      relation:network.relation||"none",
      pending:network.invitationPending!==undefined?Boolean(network.invitationPending):Boolean(options.networkInvitation?.status==="Pending"),
      accepted:Boolean(network.accepted),
      rejected:Boolean(network.rejected),
      unavailable:Boolean(network.unavailable),
      id:Number(network.id||0)||null
    }),

    custody:Object.freeze({pending:Boolean(custody.pending),caseId:Number(custody.caseId||0)||null,status:custody.status||null,targetType:custody.targetType||null,targetId:Number(custody.targetId||0)||null,recipientType:custody.recipientType||null,recipientId:Number(custody.recipientId||0)||null,requirementId:Number(custody.requirementId||0)||null,transferChannel:custody.transferChannel||null}),

    foryou:Object.freeze({
      relation:foryou.relation||"none",
      pending:foryou.pending!==undefined?Boolean(foryou.pending):Boolean(options.forYouRequest?.status==="Pending"),
      accepted:Boolean(foryou.accepted),
      rejected:Boolean(foryou.rejected),
      id:Number(foryou.id||0)||null
    }),

    messaging:Object.freeze({
      contactAvailable:messaging.contactAvailable!==false,
      escalationNeeded:Boolean(messaging.escalationNeeded),
      unresolvedAttentionMessages:Number(messaging.unresolvedAttentionMessages||0)
    })
  });
}
