/* ON Mission 10.30.41 — Canonical Execution Readiness composition boundary. */
/* V4.29.0 — Final Operational Capability Convergence: one mission context, one capability registry, one service route, one operational execution surface. */
import {json} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {getForSession,executionLocationForSession} from "../../modules/missions/missions.service.js";
import {listMissionExceptions} from "../../modules/attention/attention.service.js";
import {coordinateMissionEngines} from "../engine-coordinator/engine-coordinator.service.js";
import {missionTvCommandEvents} from "../mission-tv-command/mission-tv-command.service.js";
import {buildCapabilityAudit,normalizeOperationalActions} from "./mission-capability-convergence.js";
import {buildMarketplaceMissionIntelligence} from "../marketplace-intelligence/marketplace-intelligence.js";
import {listMarketplaceDrivers} from "./marketplace-drivers.repository.js";
import {instrumentD1,summarizeD1Metrics} from "./performance/d1-performance.js";
import {createPerformanceTrace,logPerformanceTrace} from "../../core/observability.js";
import {buildOperationalReadinessContract} from "./operational-readiness.contract.js";
import {buildCanonicalCapabilityExposure} from "./canonical-capability-exposure.contract.js";
import {buildCanonicalActionExecutionBridge} from "./canonical-action-execution-bridge.contract.js";
import {buildCanonicalResponsibility} from "./canonical-responsibility.contract.js";
import {buildCanonicalOperatorIntent} from "./canonical-operator-intent.contract.js";
import {buildCanonicalOperatorActionInventory} from "./canonical-operator-action-inventory.contract.js";
import {buildCanonicalDecisionActionConsistency} from "./canonical-decision-action-consistency.contract.js";
import {buildCanonicalOperationalFlow} from "./canonical-operational-flow.contract.js";
import {buildUnifiedOperationalExecution} from "./unified-operational-execution.contract.js";
import {buildUniversalMissionContract,validateUniversalMissionContract,UNIVERSAL_MISSION_CONTRACT_VERSION} from "../mission-contract/mission-contract.service.js";
import {assessSectorMissionContract} from "../../security/sector-mission-contract.service.js";

/**
 * V3.2 Contextual Operations read model.
 * This is a composition boundary only: existing engines/services remain authoritative.
 * Inaccessible/stale mission selections intentionally return a generic 200 response so
 * a progressive UI refresh does not turn a stale selection into a browser 404 error.
 */
export function registerOperationsContextRoutes(router){
  router.get(/^\/api\/operations\/context\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const trace=createPerformanceTrace("operations_context");
      const session=await requireSession(request,env);
      trace.mark("session");
      const d1Metrics=[];
      const runtimeEnv={...env,DB:instrumentD1(env.DB,{onQuery:entry=>d1Metrics.push(entry)})};
      await limitAction(runtimeEnv,session,"operations-context-read",{limit:120,windowSeconds:60});
      const missionId=Number(params.missionId);
      const mission=await getForSession(runtimeEnv,session,missionId);
      trace.mark("mission_truth");
      if(!mission)return json({success:true,available:false,missionId,reason:"Mission context is no longer available."});

      const exceptions=await listMissionExceptions(runtimeEnv,session,missionId);
      const sectorContract=await assessSectorMissionContract(runtimeEnv,{countryCode:mission.country_code||"ZZ",sectorCode:mission.sector_code||mission.capability_code||"general",scenarioCode:null,requireExecutionBoundary:false});
      const universalMissionContract=buildUniversalMissionContract({mission,sectorContract});
      const universalMissionContractValidation=validateUniversalMissionContract(universalMissionContract,{requireExecutionReady:false});
      trace.mark("mission_contract");
      trace.mark("exceptions");
      // Consume the protected engine coordinator once so Operations receives the
      // same unified action decision as every other operational surface.
      const coordinated=await coordinateMissionEngines(runtimeEnv,session,mission,{exceptions});
      const coordination=coordinated.coordination;
      trace.mark("intelligence_coordination");
      // These reads are independent after mission truth/coordination is available.
      // Run them concurrently to remove avoidable D1 round-trip latency from the
      // mission-context critical path.
      const [executionLocation,tvEvents,marketplaceDrivers]=await Promise.all([
        executionLocationForSession(runtimeEnv,session,missionId,{mission}),
        missionTvCommandEvents(runtimeEnv,session,[mission],8),
        listMarketplaceDrivers(runtimeEnv,Number(session.tenantId))
      ]);
      trace.mark("parallel_operational_reads");
      const tv=tvEvents[0]||null;
      const marketplaceIntelligence=buildMarketplaceMissionIntelligence(mission,{drivers:marketplaceDrivers});
      const flow=coordinated.flowBundle;
      const {truth,execution,assignment,management,actions,unified,operatingSurface,recovery}=coordination;
      const conditions=flow.conditions||null;
      const network=flow.featureState?.network||{};
      const foryou=flow.featureState?.foryou||{};
      const collaboration={
        network:{
          relation:String(network.relation||"none"),
          status:String(network.status||"none"),
          invitationId:Number(network.id||0)||null,
          pending:Boolean(network.pending),
          invitationPending:Boolean(network.invitationPending),
          accepted:Boolean(network.accepted),
          rejected:Boolean(network.rejected),
          revoked:Boolean(network.revoked)
        },
        foryou:{
          relation:String(foryou.relation||"none"),
          status:String(foryou.status||"none"),
          requestId:Number(foryou.id||0)||null,
          pending:Boolean(foryou.pending),
          accepted:Boolean(foryou.accepted),
          rejected:Boolean(foryou.rejected),
          revoked:Boolean(foryou.revoked)
        },
        hasSignal:Boolean(network.id||network.pending||network.accepted||foryou.id||foryou.pending||foryou.accepted)
      };
      const missionOperatingContext=buildMissionOperatingContext({mission,conditions,flow,truth,execution,assignment,management,actions,unified,operatingSurface,liveness:coordination.liveness,recovery,exceptions,collaboration,tv,executionLocation,marketplaceIntelligence,problems:coordinated.problems||[]});
      // 10.29.47: readiness must consume the same primary capability and audit used by
      // the mission operating context. Keep these values in route scope; referencing
      // bindings owned by buildMissionOperatingContext caused a 500 for every context read.
      const primary=unified?.primary||operatingSurface?.primary||null;
      const capabilityAudit=buildCapabilityAudit();
      const canonicalCapability=buildCanonicalCapabilityExposure({mission,flow:flow.contract,session,availableActions:Array.isArray(actions?.all)?actions.all:[]});
      const canonicalResponsibility=await buildCanonicalResponsibility({mission,assignment,flow:flow.contract,session,env:runtimeEnv,ownerCompanyId:Number(mission.company_id||session.tenantId||0),missionId:Number(missionId)});
      const operationalReadiness=buildOperationalReadinessContract({mission,flow:{...flow.contract,next:{...flow.contract.next,actor:canonicalResponsibility.responsible.established?{type:String(canonicalResponsibility.responsible.type||"").toLowerCase(),id:canonicalResponsibility.responsible.id,name:canonicalResponsibility.responsible.name}:flow.contract.next.actor}},liveness:coordination.liveness,primaryAction:primary,capabilityAudit,capabilityExposure:canonicalCapability});
      const canonicalOperatorIntent=buildCanonicalOperatorIntent({mission,responsibility:canonicalResponsibility,readiness:operationalReadiness,capability:canonicalCapability,availableActions:Array.isArray(actions?.all)?actions.all:[],deniedActions:Array.isArray(actions?.denied)?actions.denied:[]});
      const canonicalActionExecutionBridge=buildCanonicalActionExecutionBridge({mission,flow:flow.contract,session,canonicalCapability,availableActions:Array.isArray(actions?.all)?actions.all:[]});
      const viewerActionSurface=[...(unified?.primary?[unified.primary]:[]),...(Array.isArray(unified?.utilities)?unified.utilities:[]),...(Array.isArray(actions?.all)?actions.all:[])];
      const canonicalOperatorActionInventory=buildCanonicalOperatorActionInventory({missionId:missionId,primaryAction:unified?.primary||null,availableActions:viewerActionSurface,operatorIntent:canonicalOperatorIntent,canonicalCapability});
      const canonicalDecisionActionConsistency=buildCanonicalDecisionActionConsistency({mission,decision:null,readiness:operationalReadiness,responsibility:canonicalResponsibility,operatorIntent:canonicalOperatorIntent,canonicalCapability,primaryAction:unified?.primary||null,actionInventory:canonicalOperatorActionInventory});
      const canonicalOperationalFlow=buildCanonicalOperationalFlow({mission,context:{missionId,role:session.role,networkInvitationId:collaboration.network.invitationId,forYouRequestId:collaboration.foryou.requestId,openExceptionId:exceptions?.find(e=>String(e?.status||"").toLowerCase()==="open")?.id||null},truth,readiness:operationalReadiness,decision:null,action:unified?.primary||null,responsibility:canonicalResponsibility,liveness:coordination.liveness,operatorIntent:canonicalOperatorIntent});
      const unifiedOperationalExecution=buildUnifiedOperationalExecution({mission,session,truth,liveness:coordination.liveness,readiness:operationalReadiness,responsibility:canonicalResponsibility,capability:canonicalCapability,operatorIntent:canonicalOperatorIntent,operatorActionInventory:canonicalOperatorActionInventory,decisionActionConsistency:canonicalDecisionActionConsistency,operationalFlow:canonicalOperationalFlow,actionExecutionBridge:canonicalActionExecutionBridge,actions:Array.isArray(actions?.all)?actions.all:[]});
      trace.mark("canonical_synthesis");
      const traceResult=trace.finish();
      logPerformanceTrace({trace:traceResult,requestId:request.headers.get("X-Request-ID"),route:"/api/operations/context/:missionId",session});
      const d1=summarizeD1Metrics(d1Metrics);
      const performance=String(env.PERFORMANCE_DIAGNOSTICS||"").toLowerCase()==="true"?{d1QueryCount:d1.queryCount,d1DurationMs:d1.durationMs,d1SlowQueries:d1.slowQueries}:undefined;
      return json({success:true,available:true,missionId,context:{mission,conditions,flow:flow.contract,execution:execution.execution,assignment,exceptions,actions,unified,operatingSurface,collaboration,missionOperatingView:missionOperatingContext,operationalReadiness,canonicalCapability,canonicalResponsibility,canonicalOperatorIntent,canonicalOperatorActionInventory,canonicalDecisionActionConsistency,universalMissionContract,universalMissionContractValidation},missionOperatingContext,operationalReadiness,canonicalCapability,canonicalResponsibility,canonicalOperatorIntent,canonicalOperatorActionInventory,canonicalDecisionActionConsistency,canonicalOperationalFlow,canonicalActionExecutionBridge,unifiedOperationalExecution,universalMissionContract,universalMissionContractValidation,universalMissionContractVersion:UNIVERSAL_MISSION_CONTRACT_VERSION,problems:coordinated.problems||[],...(performance?{performance}:{})});
    }catch(e){
      return json({success:false,error:e?.message||"Operations context unavailable"},e?.status||500);
    }
  });
}

function buildMissionOperatingContext({mission,conditions,flow,truth,execution,assignment,management,actions,unified,operatingSurface,liveness,recovery=null,exceptions,collaboration,tv,executionLocation,marketplaceIntelligence=null,problems=[]}){
  const primary=unified?.primary||operatingSurface?.primary||null;
  const utilities=Array.isArray(unified?.utilities)?unified.utilities:[];
  // V4.34: resolve open exceptions before constructing action inputs.  The previous
  // order referenced the lexical `openExceptions` binding before initialization,
  // causing a runtime TDZ ReferenceError whenever MissionOperatingContext loaded.
  const openExceptions=Array.isArray(exceptions)?exceptions.filter(e=>String(e?.status||"").toLowerCase()==="open"):[];
  const actionInputs=[...(primary?[primary]:[]),...utilities,...(Array.isArray(actions?.all)?actions.all:[])].map(a=>a?{...a,missionId:Number(mission?.id||0)||null,openExceptionId:(openExceptions?.[0]?.id||null),networkInvitationId:(collaboration?.network?.invitationId||null),forYouRequestId:(collaboration?.foryou?.requestId||null)}:a);
  const normalizedActions=normalizeOperationalActions(actionInputs);
  const capabilityAudit=buildCapabilityAudit();
  const responsible=primary?.actor?.name||flow?.ownership?.actor?.name||flow?.ownership?.actor?.label||null;
  const dependency=primary?.reason||unified?.waiting?.waitingFor||flow?.next?.waitingFor||null;
  const impact=flow?.readiness?.summary||tv?.detail||primary?.reason||null;
  const freshness=mission?.updated_at||mission?.updatedAt||null;
  return Object.freeze({
    version:"2.0",
    missionId:Number(mission?.id||0)||null,
    reference:String(mission?.reference||""),
    status:String(truth?.lifecycle?.status||mission?.status||flow?.status||"Pending"),
    stateToken:Number(mission?.state_version||0)>0?`v:${Number(mission.state_version)}`:String(mission?.updated_at||""),
    freshness:{updatedAt:freshness,stale:false},
    situation:Object.freeze({
      headline:String(tv?.headline||primary?.label||"Operational context is current."),
      detail:String(tv?.detail||""),
      workState:String(primary?"ACTION_REQUIRED":unified?.waiting?"WAITING":liveness?.state||"INFORMATION"),
      responsible:responsible||"",
      dependency:dependency||"",
      impact:impact||""
    }),
    truth:Object.freeze({valid:Boolean(truth&&Object.values(truth?.invariant||{}).every(Boolean)),status:String(truth?.lifecycle?.status||mission?.status||"")}),
    liveness:Object.freeze({state:String(liveness?.state||"UNKNOWN"),reason:String(liveness?.reason||liveness?.explanation||""),actor:String(liveness?.actor||liveness?.waitingFor||"")}),
    recovery:Object.freeze({required:Boolean(recovery?.required),count:Number(recovery?.count||0),stale:Boolean(recovery?.stale),items:Array.isArray(recovery?.items)?recovery.items.slice(0,5):[]}),
    focus:Object.freeze({primary:primary?{code:String(primary.code||""),label:String(primary.label||primary.code||""),reason:String(primary.reason||"")} : null}),
    responsibility:Object.freeze({owner:flow?.ownership?.actor||null,kind:flow?.ownership?.kind||null,required:String(assignment?.assignmentRequired?"executor":"")}),
    dependency:Object.freeze({current:dependency||null,waitingFor:unified?.waiting?.waitingFor||flow?.next?.waitingFor||null}),
    impact:String(impact||""),
    tv:tv||null,
    missionData:Object.freeze({
      id:Number(mission?.id||0)||null,
      reference:String(mission?.reference||""),
      type:String(mission?.mission_type||mission?.missionType||""),
      status:String(mission?.status||""),
      missionDate:mission?.mission_date||mission?.missionDate||null,
      createdAt:mission?.created_at||mission?.createdAt||null,
      updatedAt:mission?.updated_at||mission?.updatedAt||null,
      pickup:Object.freeze({
        company:mission?.pickup_company||null,address:mission?.pickup_address||null,street:mission?.pickup_street||null,zipCode:mission?.pickup_zip_code||null,city:mission?.pickup_city||null,
        time:mission?.pickup_time||mission?.pickup_at||null,at:mission?.pickup_at||mission?.pickupAt||null,
        accessFrom:mission?.pickup_access_from||null,accessTo:mission?.pickup_access_to||null
      }),
      delivery:Object.freeze({
        company:mission?.delivery_company||null,address:mission?.delivery_address||null,street:mission?.delivery_street||null,zipCode:mission?.delivery_zip_code||null,city:mission?.delivery_city||null,
        time:mission?.delivery_time||mission?.delivery_at||null,at:mission?.delivery_at||mission?.deliveryAt||null,
        accessFrom:mission?.delivery_access_from||null,accessTo:mission?.delivery_access_to||null
      }),
      deadline:mission?.deadline_at||mission?.deadlineAt||null,
      customer:Object.freeze({id:Number(mission?.customer_id||0)||null,name:mission?.customer_name||null}),
      ownerCompany:Object.freeze({id:Number(mission?.company_id||0)||null,name:mission?.company_name||null}),
      executingCompany:Object.freeze({id:Number(mission?.executing_tenant_id||0)||null,name:mission?.executing_tenant_name||null}),
      source:String(Number(mission?.shared_access||0)===1?"NETWORK":Number(mission?.public_enabled||0)===1?"FORYOU":""),
      executor:Object.freeze({id:Number(mission?.assigned_executor_id||0)||null,name:mission?.executor_name||null}),
      driver:Object.freeze({id:Number(mission?.owner_driver_id||0)||null,name:mission?.driver_name||null}),
      sharedDriver:Object.freeze({id:Number(mission?.shared_driver_id||0)||null,name:mission?.shared_driver_name||null}),
      executingDriver:Object.freeze({id:Number(mission?.executing_tenant_driver_id||0)||null,name:mission?.executing_tenant_driver_name||null}),
      description:mission?.public_description||null,
      missionMessage:mission?.mission_message||null,
      messageCount:Number(mission?.message_count||0),
      fileCount:Number(mission?.file_count||0),
      sharedAccess:Boolean(Number(mission?.shared_access||0)),
      publicEnabled:Boolean(Number(mission?.public_enabled||0)),
      stateVersion:Number(mission?.state_version||0)||null
    }),
    executionLocation:executionLocation||null,
    attention:Object.freeze({open:openExceptions.length>0,count:openExceptions.length,items:openExceptions.slice(0,8)}),
    assignment:Object.freeze({required:Boolean(assignment?.assignmentRequired),mutable:Boolean(assignment?.assignmentMutable),driverId:Number(assignment?.driverId||0)||null,available:assignment?.driverAvailable??null,waiting:Boolean(assignment?.acquisitionWaiting),intelligence:assignment||null}),
    execution:Object.freeze({state:String(execution?.execution?.state||execution?.state||truth?.execution?.state||"UNKNOWN"),owner:execution?.execution?.owner||execution?.owner||null,readiness:flow?.readiness||null,intelligence:execution||null}),
    managementIntelligence:Object.freeze({
      permissions:management?.permissions||{},
      actions:Array.isArray(management?.actions)?management.actions:[],
      requirements:Array.isArray(management?.requirements)?management.requirements:[],
      cancellation:management?.cancellation||null,
      reactivation:management?.reactivation||null,
      custody:management?.custody||null,
      completion:management?.completion||null
    }),
    custody:management?.custody||flow?.featureState?.custody||null,
    collaboration:collaboration||{network:{},foryou:{},hasSignal:false},
    marketplace:Object.freeze({
      channel:"MARKETPLACE",
      published:Boolean(marketplaceIntelligence?.eligibility?.published),
      eligible:Boolean(marketplaceIntelligence?.eligibility?.eligible),
      routeReady:Boolean(marketplaceIntelligence?.eligibility?.routeReady),
      recommendation:marketplaceIntelligence?.recommendation||null,
      matches:Array.isArray(marketplaceIntelligence?.matches)?marketplaceIntelligence.matches.slice(0,3):[]
    }),
    context:Object.freeze({conditions:conditions||null,execution:execution?.execution||execution||null,management:management||null,flow:flow?.contract||flow||null}),
    availableActions:normalizedActions,
    primaryAction:primary?normalizeOperationalActions([primary])[0]:null,
    capabilityAudit:Object.freeze({complete:capabilityAudit.complete,registryCount:capabilityAudit.actionRegistryCount,serviceMapCount:capabilityAudit.serviceMapCount,registryWithoutServiceRoute:capabilityAudit.registryWithoutServiceRoute,serviceRouteWithoutRegistry:capabilityAudit.serviceRouteWithoutRegistry}),
    capabilities:Object.freeze({
      context:Object.freeze(["details","executor","attention","custody","message","history","timeline","files"]),
      actions:normalizedActions,
      management:Object.freeze(["edit_mission","edit_executor","delete_mission","cancel_mission"])
    }),
    readiness:Object.freeze({state:String(flow?.readiness?.state||"UNKNOWN"),summary:String(flow?.readiness?.summary||""),missing:Array.isArray(flow?.readiness?.missing)?flow.readiness.missing:[],blockers:Array.isArray(flow?.readiness?.blockers)?flow.readiness.blockers:[]}),
    problems:Object.freeze((problems||[]).slice(0,8))
  });
}

function livenessSnapshot(c){
  const l=c?.liveness||{};
  return {state:String(l.state||"UNKNOWN"),reason:String(l.reason||l.explanation||""),actor:String(l.actor||l.waitingFor||"")};
}
function truthSnapshot(t){
  const x=t||{};
  return {status:String(x.status||x.state||""),custody:String(x.custody?.state||x.custodyState||""),execution:String(x.execution?.state||x.executionState||"")};
}
function focusSnapshot(unified,operatingSurface){
  const x=unified?.primary||operatingSurface?.primary||null;
  return x?{code:String(x.code||""),label:String(x.label||x.code||""),reason:String(x.reason||x.experience?.hint||"")}:{code:"",label:"",reason:""};
}
