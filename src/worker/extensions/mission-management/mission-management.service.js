import {canonicalFirst} from '../../core/canonical-db.js';
import {resolveMissionAccess} from "../../security/mission-access.js";
import {orchestrateMissionFlow} from "../mission-flow/mission-flow.orchestrator.js";
import {buildMissionContext} from "../../modules/intelligence/mission-context.js";
import {buildMissionConditions} from "../../modules/intelligence/mission-conditions.js";
import {buildActionContext} from "../actions-intelligence/action-context.gateway.js";
import {managementPermissions} from "./permissions/management-permission.engine.js";
import {deriveManagementRequirements} from "./requirements/requirement.engine.js";
import {listOpenRequirements} from "./requirements/management-requirement.repository.js";
import {cancellationPolicy} from "./cancellation/cancellation.policy.js";
import {reactivationPolicy} from "./lifecycle/reactivation.policy.js";
import {custodyPolicy} from "./custody-responsibility/canonical-custody-responsibility.service.js";
import {findOpenCase} from "./custody-responsibility/canonical-custody-responsibility.service.js";
import {completionGate} from "../completion-gate/completion-gate.service.js";
import {buildManagementContract} from "./management-contract.js";
import {executionOwnershipSnapshot} from "./custody-responsibility/canonical-custody-responsibility.service.js";

export async function missionManagement(env,session,mission,{exceptions=[],executionLocation=null,flowBundle=null}={}){
  const flowResult=flowBundle||await orchestrateMissionFlow(env,session,mission,{exceptions});
  const access=await resolveMissionAccess(env,session,Number(mission.id));
  if(!access){const e=new Error("Mission access lost");e.status=403;throw e;}
  const accessKind=String(access.accessKind||"owner");
  const authoritativeMission=access.mission||mission;
  const conditions=flowResult.conditions||buildMissionConditions(buildMissionContext(authoritativeMission,{role:session.role,accessKind}));
  const baseFeatureState=flowResult.featureState||await buildActionContext(env,session,authoritativeMission,conditions,{exceptions});
  // Add management-only exception type without mutating the protected feature-state contract.
  const featureState=Object.freeze({
    ...baseFeatureState,
    exceptions:Object.freeze({...baseFeatureState.exceptions,highestType:highestOpenType(exceptions)})
  });

  const persisted=await listOpenRequirements(env,Number(authoritativeMission.company_id),Number(authoritativeMission.id));
  const openCustodyCase=await findOpenCase(env,Number(authoritativeMission.company_id),Number(authoritativeMission.id));
  const completion=String(authoritativeMission.status)==="Delivered"?await completionGate(env,authoritativeMission):null;
  const ownershipSnapshot=await executionOwnershipSnapshot(env,Number(authoritativeMission.company_id),Number(authoritativeMission.id));
  const permissions=managementPermissions({flow:flowResult.contract,conditions,featureState,session,ownershipSnapshot});
  const requirements=deriveManagementRequirements({
    flow:flowResult.contract,conditions,featureState,executionLocation,persisted,session
  });
  const cancellation=cancellationPolicy({flow:flowResult.contract,session});
  const reactivation=reactivationPolicy({flow:flowResult.contract,session,mission});
  const custody=custodyPolicy({flow:flowResult.contract,session,openCase:openCustodyCase,mission});
  const actions=await deriveManagementActions({
    env,mission:authoritativeMission,featureState,flow:flowResult.contract,permissions,requirements,cancellation,reactivation,custody,completion,session
  });

  return buildManagementContract({
    flow:flowResult.contract,permissions,requirements,managementActions:actions,cancellation,reactivation,custody,completion
  });
}

async function deriveManagementActions({env,mission,featureState,flow,permissions,requirements,cancellation,reactivation,custody,completion,session}){
  const actions=[];
  // Owner-side ForYou request management is a canonical Mission Workspace
  // responsibility. Read the pending request directly from the authoritative
  // request table so it cannot disappear merely because an enrichment provider
  // or secondary request surface failed to project it.
  if(session?.role==='admin' && flow?.viewer?.isOwner){
    const pending=await env.DB.prepare(`
      SELECT id,status,requester_type,requester_company_id,executor_id
      FROM public_mission_requests
      WHERE company_id=? AND mission_id=? AND status='Pending'
      ORDER BY id ASC LIMIT 1
    `,[Number(mission?.company_id||0),Number(mission?.id||0)],'mission_request_authority');
    if(pending?.id){
      actions.push(action('approve_foryou_request','Approve Request','distribution',true,{forYouRequestId:Number(pending.id),requesterType:String(pending.requester_type||'tenant')}));
      actions.push(action('decline_foryou_request','Decline Request','distribution',true,{forYouRequestId:Number(pending.id),requesterType:String(pending.requester_type||'tenant')}));
    }
  }
  const externalExecution=["SHARED_TENANT","SHARED_TENANT_DRIVER","INDEPENDENT_EXECUTOR"].includes(String(flow.ownership?.kind||""));
  // V8.8.1.4 — management and Actions Intelligence must agree about execution control.
  // Pre-custody: owner may reclaim directly.
  // Active physical custody: owner must use the explicit custody-transfer flow.
  if(permissions.canEdit)actions.push(action("edit_mission","Edit Mission","management",true));
  if(permissions.canDelete)actions.push(action("delete_mission","Delete Mission","management",true));
  if(permissions.reclaimExecution)actions.unshift(action("reclaim_execution","Take Back Execution","responsibility",true));
  const custodyCanOpen=Boolean(custody?.ownerCanOpen||custody?.responsibleTenantCanOpen);
  const custodyCanRoute=Boolean(custody?.ownerCanRoute||custody?.responsibleTenantCanRoute);
  const custodyCanFinalize=Boolean(custody?.ownerCanFinalize||custody?.responsibleTenantCanFinalize);
  if(custodyCanOpen&&custody?.custodyActive)actions.unshift(action("start_custody_resolution","Transfer Custody","custody",true));
  if(custody?.ownerCanOpen&&custody?.custodyActive&&flow.viewer?.isOwner)actions.push(action("start_custody_recovery","Custodian Unreachable","custody",true));
  if(custodyCanRoute)actions.unshift(action("start_custody_resolution",flow.viewer?.isOwner?"Change Handoff Route":"Change Driver","custody",false));
  if(custodyCanFinalize)actions.unshift(action("finalize_custody_transfer","Continue Handoff","custody",true));
  if(custody?.recipientTenantCanReassign)actions.unshift(action("reassign_custody_receiver","Change Receiving Driver","custody",true));
  if(session.role==="admin"&&custody?.currentCase&&!custody?.custodyRecipientPending)actions.push(action("abort_custody_transfer","Keep Current Executor","custody",false));
  const personalExecutor=["driver","executor"].includes(String(session?.role||"")) && Boolean(flow.viewer?.isPersonal);
  // Executors must receive the canonical lifecycle actions directly from the
  // same management contract used by the Mission Workbench. Previously these
  // actions existed in Actions Intelligence but were never projected into the
  // Workbench action list, leaving Driver/Executor with an empty execution pane.
  if(personalExecutor&&!flow.conditions?.completed){
    const executionActions={
      Pending:["confirm_arrival","Confirm Arrival"],
      Arrived:["confirm_pickup","Confirm Pickup"],
      PickedUp:["start_transit","Start Transit"],
      InTransit:["confirm_delivery","Confirm Delivery"],
      Delivered:["complete_mission","Complete Mission"]
    };
    const next=executionActions[String(flow.status||"")];
    if(next&&next[0]!=="complete_mission")actions.unshift(action(next[0],next[1],"execution",true));
    const custodyCase=custody?.currentCase||null;
    const viewerId=Number(session.driverId||session.executorId||0)||0;
    const holderMatches=Boolean(custodyCase&&String(custodyCase.current_holder_type||"")===String(session.role||"")&&Number(custodyCase.current_holder_id||0)===viewerId);
    const receiverMatches=Boolean(custodyCase&&String(custodyCase.target_type||"")===String(session.role||"")&&Number(custodyCase.target_id||0)===viewerId);
    if(holderMatches&&custodyCase.status==="awaiting_release")actions.unshift(action("confirm_custody_release","Confirm Custody Release","custody",true));
    if(receiverMatches&&custodyCase.status==="awaiting_acceptance")actions.unshift(action("accept_custody","Accept Custody","custody",true));
  }
  const viewerCanComplete=personalExecutor ||
    (session?.role==="admin"&&Boolean(flow.viewer?.isOwner)&&!externalExecution);
  if(flow.status==="Delivered"&&completion?.allowed&&viewerCanComplete)actions.unshift(action("complete_mission","Complete Mission","completion",true));
  if(flow.status==="Delivered"&&completion&&!completion.allowed&&!actions.some(a=>a.domain==="requirement")){
    const first=completion.blockers?.[0];
    if(first)actions.unshift(action("review_completion_blocker","Review Completion Blocker","completion",false,{question:first.message}));
  }
  if(reactivation?.allowed)actions.push(action("reactivate_mission","Reactivate Mission","lifecycle",true));
  if(permissions.cancelMission&&cancellation?.allowed)actions.push(action("cancel_mission","Cancel Mission","cancellation",true));
  for(const r of requirements){
    if(r.state==="ACTION_REQUIRED"&&r.actionCode&&!actions.some(a=>a.code===r.actionCode)){
      actions.unshift(action(r.actionCode,label(r.actionCode),"requirement",false,{requirementId:r.id,question:r.question}));
    }
  }
  return Object.freeze(actions);
}
function action(code,label,domain,confirmation,extra={}){return Object.freeze({code,label,domain,confirmation,...extra});}
function label(code){return String(code||"").replaceAll("_"," ");}
function highestOpenType(exceptions=[]){
  const open=(exceptions||[]).filter(x=>String(x.status||"")==="open");
  const rank={critical:4,high:3,medium:2,low:1};
  return [...open].sort((a,b)=>(rank[String(b.severity||"medium")]||0)-(rank[String(a.severity||"medium")]||0))[0]?.exception_type||null;
}
