import {MISSION_STATUS_FLOW,canonicalMissionStatus,isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
const STATUS_FLOW=MISSION_STATUS_FLOW;

const STEP={
  Pending:{stage:"pre_pickup",current:"Mission ready",next:"Arrival",task:"advance_mission",taskLabel:"Confirm arrival"},
  Arrived:{stage:"at_pickup",current:"Arrived at pickup",next:"Pickup",task:"advance_mission",taskLabel:"Confirm pickup"},
  PickedUp:{stage:"post_pickup",current:"Picked up",next:"Transit",task:"advance_mission",taskLabel:"Start transit"},
  InTransit:{stage:"in_transit",current:"In transit",next:"Delivery",task:"advance_mission",taskLabel:"Confirm delivery"},
  Delivered:{stage:"at_delivery",current:"Delivered",next:"Completion",task:"advance_mission",taskLabel:"Complete mission"},
  Completed:{stage:"complete",current:"Completed",next:null,task:null,taskLabel:"View record"}
};

export function deriveMissionFlow(conditions){
  const c=conditions||{};
  const status=canonicalMissionStatus(c.status||"Pending");
  const terminal=isLifecycleTerminal(status);
  const step=STEP[status];
  if(terminal){
    const labelText=status==="Cancelled"?"Mission is cancelled.":"Mission execution is closed.";
    return {
      state:"terminal",stage:"terminal",currentStatus:status,nextStatus:null,
      currentStep:status,expectedNext:null,task:null,taskLabel:"View record",
      transition:{allowed:false,blockedBy:null,reason:labelText},
      timing:deriveTiming(c,status),waiting:{active:false,minutes:0,reason:null},
      reason:labelText,validStatuses:[status]
    };
  }
  const timing=deriveTiming(c,status);
  const transition=deriveTransition(c,status,step);
  const expected=deriveExpected(c,status,step,timing);

  if(c.completed){
    return {
      state:"complete",stage:"complete",currentStatus:status,nextStatus:null,
      currentStep:"Completed",expectedNext:null,task:null,taskLabel:"View record",
      transition:{allowed:false,blockedBy:null,reason:"Mission execution is closed."},
      timing,waiting:{active:false,minutes:0,reason:null},
      reason:"Mission execution is closed.",validStatuses:["Completed"]
    };
  }

  if(c.responsibility?.assignmentRequired){
    return {
      state:"blocked",stage:"pre_execution",currentStatus:status,nextStatus:c.progress?.nextStatus||null,
      currentStep:step.current,expectedNext:"Assignment",task:"assign_executor",taskLabel:"Assign executor",
      transition:{allowed:false,blockedBy:"assignment",reason:"Execution cannot continue until an executor is assigned."},
      timing,waiting:{active:false,minutes:0,reason:null},
      reason:"Execution cannot continue until responsibility is resolved.",validStatuses:validFrom(status)
    };
  }

  if(c.responsibility?.marketplaceWaiting){
    return {
      state:"waiting",stage:"pre_execution",currentStatus:status,nextStatus:c.progress?.nextStatus||null,
      currentStep:step.current,expectedNext:"Execution acceptance",task:"review_marketplace",taskLabel:"Review execution request",
      transition:{allowed:false,blockedBy:"execution_acceptance",reason:"The mission is waiting for an approved executor request."},
      timing,waiting:{active:true,minutes:c.time?.updateAgeMinutes||0,reason:"marketplace_waiting"},
      reason:"The mission is available for an approved executor request.",validStatuses:validFrom(status)
    };
  }

  return {
    state:timing.state==="late"||timing.state==="waiting"?"waiting":"executable",
    stage:step.stage,
    currentStatus:status,
    nextStatus:c.progress?.nextStatus||null,
    currentStep:step.current,
    expectedNext:expected.label,
    task:step.task,
    taskLabel:expected.taskLabel,
    transition,
    timing,
    waiting:{
      active:timing.state==="waiting",
      minutes:timing.state==="waiting"?Number(c.time?.statusAgeMinutes||0):0,
      reason:timing.state==="waiting"?"pickup_wait":null
    },
    reason:expected.reason,
    validStatuses:validFrom(status)
  };
}

function deriveTiming(c,status){
  const pickup=c.time?.pickup||c.time?.actionOne||"unscheduled";
  const deadline=c.time?.deadline||"none";
  if(status==="Arrived"&&pickup==="waiting")return {state:"waiting",source:"pickup",deadline,pickup};
  if(["Pending","Arrived"].includes(status)&&pickup==="late")return {state:"late",source:"pickup",deadline,pickup};
  if(deadline==="overdue")return {state:"overdue",source:"deadline",deadline,pickup};
  if(["critical","soon","watch"].includes(deadline))return {state:"time_sensitive",source:"deadline",deadline,pickup};
  return {state:"normal",source:null,deadline,pickup};
}

function deriveTransition(c,status,step){
  if(!step.next)return {allowed:false,blockedBy:null,reason:"No further transition is required."};
  if(!c.capability?.canAdvance)return {allowed:false,blockedBy:"capability",reason:"Current user cannot advance this mission."};
  if(c.dataQuality?.missingRequired?.length){
    return {allowed:false,blockedBy:"missing_data",reason:`Mission is missing required data: ${c.dataQuality.missingRequired.join(", ")}.`};
  }
  return {allowed:true,blockedBy:null,reason:`Mission can move from ${label(status)} to ${step.next}.`};
}

function deriveExpected(c,status,step,timing){
  if(timing.state==="waiting")return {label:"Pickup confirmation",taskLabel:"Check pickup",reason:`Mission has been at pickup for ${Number(c.time?.statusAgeMinutes||0)} minutes and is waiting for pickup confirmation.`};
  if(timing.state==="late")return {label:"Pickup",taskLabel:"Check pickup timing",reason:"Pickup timing is late and needs attention before the mission continues."};
  if(timing.state==="overdue")return {label:step.next||"Review",taskLabel:step.taskLabel,reason:`Mission is ${label(status)} and its deadline has passed.`};
  if(timing.state==="time_sensitive")return {label:step.next||"Review",taskLabel:step.taskLabel,reason:`Mission is ${label(status)}. Next expected step is ${step.next||"completion"} and time is becoming important.`};
  return {label:step.next,taskLabel:step.taskLabel,reason:step.next?`Mission is ${label(status)}. Next expected step is ${step.next}.`:"Mission execution is closed."};
}

function validFrom(status){const i=Math.max(0,STATUS_FLOW.indexOf(status));return STATUS_FLOW.slice(i);}
function label(v){return ({PickedUp:"picked up",InTransit:"in transit",Pending:"pending",Arrived:"arrived",Delivered:"delivered",Completed:"completed"})[v]||String(v||"").toLowerCase();}
