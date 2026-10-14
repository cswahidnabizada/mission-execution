import {rankFocusCandidates} from "./priority.engine.js";
import {operationalMissionHref} from "./operational-mission-route.js";

function operationalSemantics(reason,item,role){
  const code=String(reason?.code||"");
  const p=item?.perspective||{};
  if(code==="assignment_required") return {workState:"ACTION_REQUIRED",responsible:p.isExecutingTenant?"Your dispatch team":"Mission owner / dispatch",responsibleKind:"operator",dependency:"Executor assignment",dependencyKind:"responsibility",impact:"Execution cannot continue until responsibility is assigned."};
  if(code==="execution_partner_unassigned") return {workState:"WAITING",responsible:String(p.executionCompany||"Execution partner"),responsibleKind:"external",dependency:"Execution partner driver assignment",dependencyKind:"external_event",impact:"Execution is waiting on the executing partner."};
  if(code==="marketplace_waiting") return {workState:"WAITING",responsible:"External executor / acceptance event",responsibleKind:"external",dependency:"Executor acceptance",dependencyKind:"external_event",impact:"The mission cannot progress until an executor accepts."};
  if(code==="required_data_missing") return {workState:role==="admin"?"ACTION_REQUIRED":"ESCALATED",responsible:role==="admin"?"Dispatch team":"Mission owner",responsibleKind:role==="admin"?"operator":"owner",dependency:"Required mission data",dependencyKind:"mission_data",impact:"Required data prevents reliable execution."};
  if(code==="pickup_waiting") return {workState:"WAITING",responsible:"Assigned executor",responsibleKind:"executor",dependency:"Pickup confirmation",dependencyKind:"execution_event",impact:"The mission is waiting at pickup for the next execution event."};
  if(code==="pickup_late") return {workState:"ACTION_REQUIRED",responsible:"Assigned executor / dispatch",responsibleKind:"execution",dependency:"Pickup completion",dependencyKind:"execution_event",impact:"Pickup timing is late and may affect the mission schedule."};
  if(code==="completion_pending"||code==="delivered_stall") return {workState:"ACTION_REQUIRED",responsible:"Completion owner",responsibleKind:"owner",dependency:"Completion transition",dependencyKind:"lifecycle",impact:"Delivery has occurred but the mission is not yet terminal."};
  if(code==="stale_progress"||code==="stale_location") return {workState:"ACTION_REQUIRED",responsible:"Assigned executor / dispatch",responsibleKind:"execution",dependency:"Fresh execution update",dependencyKind:"liveness",impact:"Progress cannot be trusted as current without a fresh update."};
  if(String(code).startsWith("exception:")) return {workState:"ESCALATED",responsible:"Operations team",responsibleKind:"operator",dependency:"Exception resolution",dependencyKind:"exception",impact:"An operational exception requires intervention or review."};
  if(code==="important_message") return {workState:"ACTION_REQUIRED",responsible:"Operations team",responsibleKind:"operator",dependency:"Message review",dependencyKind:"collaboration",impact:"A relevant operational message may require a response."};
  if(code==="driver_situation"||code==="executor_situation") return {workState:"ACTION_REQUIRED",responsible:"Executor / dispatch",responsibleKind:"execution",dependency:"Executor situation",dependencyKind:"people",impact:"Executor conditions may affect mission progress."};
  if(String(code).startsWith("deadline_")||code==="overdue") return {workState:"ACTION_REQUIRED",responsible:"Operations team",responsibleKind:"operator",dependency:"Time window",dependencyKind:"schedule",impact:"The mission is at time risk and requires review."};
  return {workState:reason?.actionable===false?"WAITING":"ACTION_REQUIRED",responsible:reason?.actionable===false?"Responsible actor / event":"Operations team",responsibleKind:reason?.actionable===false?"external":"operator",dependency:reason?.actionable===false?"Valid predecessor or external event":"Operational follow-up",dependencyKind:reason?.actionable===false?"external_event":"operational",impact:reason?.actionable===false?"Progress depends on another actor or event.":"Operational intervention may improve progress."};
}

export function buildFocusQueue(items=[],{role=""}={}){
  const candidates=[];
  for(const item of items){
    for(const reason of item.reasons||[]){
      const action=actionForReason(reason,item,role);
      const semantics=operationalSemantics(reason,item,role);
      candidates.push({
        missionId:item.missionId,
        reference:item.reference,
        level:item.level||levelForPoints(Number(reason.points||0)),
        points:Number(reason.points||0),
        reasonCode:reason.code,
        reason:reason.label,
        task:action.label,
        href:action.href,
        actionable:action.actionable,
        blocking:["assignment_required","required_data_missing","overdue"].includes(reason.code),
        criticalImpact:String(reason.code).startsWith("exception:")||reason.code==="deadline_critical",
        remainingMinutes:deadlineMinutes(item),
        at:item.updatedAt||null,
        ...semantics,
        roleRelevant:action.roleRelevant!==false,
        valid:true
      });
    }
  }
  return rankFocusCandidates(candidates).map(candidate=>({
    missionId:candidate.missionId,
    reference:candidate.reference,
    priority:candidate.priorityLevel,
    score:candidate.priorityScore,
    priorityFactors:candidate.priorityFactors,
    reasonCode:candidate.reasonCode,
    title:candidate.task,
    reason:candidate.reason,
    task:candidate.task,
    href:candidate.href,
    actionable:candidate.actionable,
    blocking:Boolean(candidate.blocking),
    criticalImpact:Boolean(candidate.criticalImpact),
    remainingMinutes:candidate.remainingMinutes,
    workState:candidate.workState||"ACTION_REQUIRED",
    responsible:candidate.responsible||"Operations team",
    responsibleKind:candidate.responsibleKind||"operator",
    dependency:candidate.dependency||"Operational follow-up",
    dependencyKind:candidate.dependencyKind||"operational",
    impact:candidate.impact||"Operational work requires review.",
    roleRelevant:candidate.roleRelevant!==false
  }));
}

export function buildFocusRecommendation(items=[],{role=""}={}){
  const [top]=buildFocusQueue(items,{role});
  if(!top)return {available:false,title:"No focus task",reason:"No authorized mission currently needs action.",task:"",href:"",priority:"none",missionId:null,reference:""};
  return {
    available:true,
    missionId:top.missionId,
    reference:top.reference,
    priority:top.priority,
    score:top.score,
    priorityFactors:top.priorityFactors,
    reasonCode:top.reasonCode,
    title:top.title,
    reason:top.reason,
    task:top.task,
    href:top.href,
    actionable:top.actionable
  };
}

function levelForPoints(points){return points>=50?"critical":points>=25?"attention":points>0?"watch":"info";}
function deadlineMinutes(item){
  const t=Date.parse(item.deadlineAtUtc||"");if(!Number.isFinite(t))return null;
  return Math.ceil((t-Date.now())/60000);
}
function actionForReason(reason,item,role){
  const base=operationalMissionHref(item.missionId,{role});
  if(reason.code==="execution_partner_unassigned")return {label:"Check assignment",href:base,actionable:true};
  if(reason.code==="assignment_required"){
    if(role==="admin"&&item?.perspective?.isExecutingTenant)return {label:"Assign driver",href:`${base}#assignment`,actionable:true};
    return role==="admin"?{label:"Assign executor",href:`${base}#assignment`,actionable:true}:{label:"Review blocked mission",href:base,actionable:false,roleRelevant:false};
  }
  if(reason.code==="required_data_missing")return role==="admin"?{label:"Complete mission data",href:base,actionable:true}:{label:"Open mission",href:base,actionable:false,roleRelevant:false};
  if(reason.code==="overdue"||String(reason.code).startsWith("deadline_"))return {label:"Review mission timing",href:base,actionable:true};
  if(reason.code==="pickup_late"||reason.code==="pickup_waiting"||reason.code==="arrived_wait")return {label:"Check pickup",href:base,actionable:true};
  if(reason.code==="completion_pending"||reason.code==="delivered_stall")return {label:"Complete mission",href:base,actionable:true};
  if(String(reason.code).startsWith("exception:"))return {label:"Resolve exception",href:`${base}#attention`,actionable:true};
  if(reason.code==="important_message")return {label:"Review mission message",href:`${base}#chat`,actionable:true};
  if(reason.code==="driver_situation"||reason.code==="executor_situation"||reason.code==="stale_location")return {label:"Check executor status",href:base,actionable:true};
  return {label:"Open mission",href:base,actionable:true};
}
