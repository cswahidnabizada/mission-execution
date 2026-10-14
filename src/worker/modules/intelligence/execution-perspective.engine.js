/**
 * Execution Perspective — role-mirrored interpretation of the same authorized mission truth.
 * Pure/read-only: it never changes assignment, status, permissions, or visibility.
 */
export function deriveExecutionPerspective(conditions,{role=""}={}){
  const c=conditions||{},r=c.responsibility||{},ctx=c.context||{};
  const access=String(c.accessKind||ctx.accessKind||"owner");
  const ownerName=String(ctx.identity?.ownerCompanyName||"The owning company");
  const executionCompany=String(r.responsibilityCompanyName||r.executingTenantName||"Executing tenant");
  const assignee=String(r.assignee||"");
  const reference=String(c.reference||ctx.identity?.reference||"mission");

  let viewer="owner";
  if(role==="driver")viewer="driver";
  else if(role==="executor")viewer="executor";
  else if(access==="shared-tenant")viewer="executing_tenant";
  else if(access==="custody-recipient")viewer="receiving_tenant";
  else if(access==="pending-network")viewer="network_requester";
  else if(access==="pending-foryou")viewer="foryou_requester";

  const isOwner=viewer==="owner";
  const isExecutingTenant=viewer==="executing_tenant";
  const isReceivingTenant=viewer==="receiving_tenant";
  const isPersonal=viewer==="driver"||viewer==="executor";

  let responsibilityText="",assignmentText="",nextAction=null;
  if(r.partnerAssignmentMissing){
    if(isOwner){
      responsibilityText=`${executionCompany} is responsible for executing Mission ${reference}.`;
      assignmentText=`${executionCompany} hasn't assigned a driver for Mission ${reference} yet.`;
      nextAction={label:"CHECK",kind:"monitor"};
    }else if(isExecutingTenant){
      responsibilityText=`You are responsible for executing Mission ${reference} from ${ownerName}.`;
      assignmentText=`Mission ${reference} still needs one of your drivers.`;
      nextAction={label:"ASSIGN DRIVER",kind:"assign"};
    }
  }else if(r.executionResolved){
    if(isOwner&&r.responsibilityOwner==="tenant"){
      responsibilityText=`${executionCompany} is executing Mission ${reference}.`;
      assignmentText=r.driverName?`${executionCompany} assigned ${r.driverName} as driver for Mission ${reference}.`:`Execution responsibility is assigned.`;
      nextAction={label:"CHECK",kind:"monitor"};
    }else if(isExecutingTenant){
      responsibilityText=`You are responsible for executing Mission ${reference} from ${ownerName}.`;
      assignmentText=r.driverName?`${r.driverName} is assigned to Mission ${reference}.`:`Execution responsibility is assigned.`;
      nextAction={label:"OPEN",kind:"execute"};
    }else if(isPersonal){
      responsibilityText=`You are assigned to Mission ${reference} from ${ownerName}.`;
      assignmentText=`You own the next execution step for this mission.`;
      nextAction={label:"OPEN",kind:"execute"};
    }
  }else if(r.assignmentRequired){
    if(isOwner){
      responsibilityText=`Your company owns execution of Mission ${reference}.`;
      assignmentText=`Mission ${reference} needs a driver.`;
      nextAction={label:"ASSIGN DRIVER",kind:"assign"};
    }
  }

  return {
    viewer,isOwner,isExecutingTenant,isReceivingTenant,isPersonal,
    ownerName,executionCompany,reference,
    responsibilityText,assignmentText,nextAction,
    responsibilityOwner:r.responsibilityOwner||null,
    executionResolved:Boolean(r.executionResolved),
    partnerAssignmentMissing:Boolean(r.partnerAssignmentMissing)
  };
}
