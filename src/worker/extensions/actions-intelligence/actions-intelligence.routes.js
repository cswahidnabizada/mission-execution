import {RELEASE_VERSION} from '../../core/release.js';
import {json,readJson} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {getForSession} from "../../modules/missions/missions.service.js";
import {listMissionExceptions} from "../../modules/attention/attention.service.js";
import {buildMissionContext} from "../../modules/intelligence/mission-context.js";
import {buildMissionConditions} from "../../modules/intelligence/mission-conditions.js";
import {actionContractForMissionIntelligence} from "./actions-intelligence.service.js";
import {buildActionContext} from "./action-context.gateway.js";
import {allActionDefinitions,actionDefinition} from "./action-registry.js";
import {resolveActionTarget} from "./action-service-map.js";
import {auditActionRegistry} from "./action-registry-audit.js";
import {coordinateMissionEngines} from "../engine-coordinator/engine-coordinator.service.js";
import {orchestrateMissionFlow} from "../mission-flow/mission-flow.orchestrator.js";
import {missionManagement} from "../mission-management/mission-management.service.js";
import {resolveMissionAccess} from "../../security/mission-access.js";
import {resolveUserSituation} from "../../security/user-situation.service.js";

export function registerActionsIntelligenceRoutes(router){
  // Canonical object-action target resolution. The registry decides WHAT and the
  // Action Service Map decides WHERE. UI clients never reconstruct mutation URLs.
  router.post(/^\/api\/actions\/resolve-target$/,async({request,env})=>{try{
    const session=await requireSession(request,env);
    await limitAction(env,session,"action-target-resolve",{limit:180,windowSeconds:60});
    const body=await readJson(request);
    const raw=String(body.actionCode||body.code||"").trim();
    const definition=actionDefinition(raw);
    if(!definition)return json({success:false,error:"Action not registered"},404);
    const roles=Array.isArray(definition.roles)?definition.roles.map(String):[];
    if(roles.length&&!roles.includes(String(session.role||"")))return json({success:false,error:"Action not available for this role"},403);
    const target=resolveActionTarget(raw,{
      missionId:Number(body.missionId||0)||null,
      personId:Number(body.personId||body.driverId||body.executorId||0)||null,
      customerId:Number(body.customerId||0)||null,
      partnerId:Number(body.partnerId||0)||null,
      relationshipId:Number(body.relationshipId||body.trustId||0)||null,
      networkInvitationId:Number(body.networkInvitationId||0)||null,
      forYouRequestId:Number(body.forYouRequestId||0)||null,
      openExceptionId:Number(body.openExceptionId||0)||null,
      requirementId:Number(body.requirementId||0)||null,
      role:String(session.role||""),
      payload:body.payload&&typeof body.payload==="object"?body.payload:{}
    });
    if(!target)return json({success:false,error:"Action target unavailable"},409);
    return json({success:true,action:{code:raw,definition,target}});
  }catch(e){return fail(e);}});
  // Read-only canonical Action Registry inspection. Admin-only by design; this endpoint
  // exposes vocabulary/audit metadata, never authority, secrets or executable mutation.
  router.get(/^\/api\/actions\/registry(?:\/(?<code>[a-z0-9_:-]+))?$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      if(session.role!=="admin")return json({success:false,error:"Forbidden"},403);
      await limitAction(env,session,"action-registry-read",{limit:60,windowSeconds:60});
      const audit=auditActionRegistry();
      const code=params?.code?String(params.code):"";
      if(code){
        const definition=actionDefinition(code);
        if(!definition)return json({success:false,error:"Action not registered"},404);
        return json({success:true,version:RELEASE_VERSION,action:{code,...definition},audit:{ok:audit.length===0,problems:audit}});
      }
      return json({success:true,version:RELEASE_VERSION,count:allActionDefinitions().length,actions:allActionDefinitions(),audit:{ok:audit.length===0,problems:audit}});
    }catch(e){return fail(e);}
  });
  router.get(/^\/api\/missions\/(?<missionId>\d+)\/truth$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);await limitAction(env,session,"mission-truth-read",{limit:120,windowSeconds:60});
      const mission=await getForSession(env,session,Number(params.missionId));
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      const result=await coordinateMissionEngines(env,session,mission,{exceptions:[]});
      const truth=result?.coordination?.truth||result?.finalOperationalProduct?.truth||null;
      if(!truth)return json({success:false,error:"Canonical mission truth unavailable"},503);
      return json({success:true,version:RELEASE_VERSION,truth});
    }catch(e){return fail(e);}
  });
  router.get(/^\/api\/actions-intelligence\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"actions-intelligence-read",{limit:120,windowSeconds:60});
      const missionId=Number(params.missionId);
      const mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      const accessResult=await resolveMissionAccess(env,session,missionId);
      const accessKind=String(accessResult?.accessKind||"");
      const userSituation=await resolveUserSituation(env,session);
      const exceptions=await listMissionExceptions(env,session,missionId);
      // One read-only orchestration pass feeds the Action Contract, Mission
      // Management projection and Canonical Truth. The workspace never asks
      // three different intelligence surfaces for the same decision.
      const flowResult=await orchestrateMissionFlow(env,session,mission,{exceptions});
      const conditions=flowResult.conditions;
      const featureState=flowResult.featureState;
      const openId=featureState.exceptions.primaryExceptionId;
      const networkInvitation=featureState.network?.pending?{id:featureState.network.id,status:featureState.network.status,relation:featureState.network.relation}:null;
      const forYouRequest=featureState.foryou?.pending?{id:featureState.foryou.id,status:"Pending",relation:featureState.foryou.relation}:null;
      const management=await missionManagement(env,session,mission,{exceptions,flowBundle:flowResult});
      const actions=actionContractForMissionIntelligence({
        conditions,
        viewerDriverId:session.role==="driver"?Number(session.driverId||0):null,
        viewerExecutorId:session.role==="executor"?Number(session.executorId||0):null,
        openException:Boolean(featureState.exceptions.open),openExceptionId:openId,
        canResolveException:Boolean(featureState.exceptions.resolvable),
        networkInvitation,forYouRequest,featureState,
        missionUpdatedAt:mission.updated_at||null,
        stateToken:Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:null,
        managementActions:management?.actions||[],
        readyToGo:Boolean(userSituation?.readyToGo),
        situation:userSituation
      });
      const truthResult=await coordinateMissionEngines(env,session,mission,{exceptions});
      const truth=truthResult?.coordination?.truth||truthResult?.finalOperationalProduct?.truth||null;
      return json({success:true,stateToken:Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:null,mission,truth,actions,featureState,management,flow:flowResult.contract,userAccess:{readyToGo:Boolean(userSituation?.readyToGo),readiness:userSituation?.classification?.readiness?.current||null,actor:userSituation?.actor?.type||null}});
    }catch(e){return fail(e);}
  });
}
function fail(e){const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:e?.message==="FORBIDDEN"?403:500);return json({success:false,error:e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message||"Actions Intelligence unavailable"},status);}
