import {json,readJson} from '../../core/http.js';
import {requireSession} from '../../core/auth-session.js';
import {limitAction} from '../../security/action-limit.js';
import {RELEASE_VERSION} from '../../core/release.js';
import {buildAgentMissionContext,hashAgentContext} from './agentic-context.service.js';
import {appendAgentOutcomeEvent,deriveAgentOutcome} from './agent-outcome-ledger.service.js';
import {searchAgentSemanticMemory,semanticRuntimeStatus} from './agent-semantic-memory.service.js';
import {getForSession} from '../../modules/missions/missions.service.js';
import {planAgentMission,AGENT_PLANNER_VERSION} from './agent-planner.service.js';
import {assessMissionReference,listMissionReferenceScenarios,MISSION_REFERENCE_VERSION} from './mission-reference.service.js';

export function registerAgenticLayerRoutes(router){
  router.post(/^\/api\/agent\/planner\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'agent-planner',{limit:30,windowSeconds:60});
      const body=await readJson(request);
      const plan=await planAgentMission(env,request,session,Number(params.missionId),body||{});
      return json({success:true,version:AGENT_PLANNER_VERSION,plan});
    }catch(e){return json({success:false,error:e?.message||'Agent planner unavailable',code:e?.code||'AGENT_PLANNER_UNAVAILABLE'},e?.status||500);}
  });
  router.get(/^\/api\/agent\/context\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'agent-context-read',{limit:120,windowSeconds:60});
      const context=await buildAgentMissionContext(env,session,Number(params.missionId));
      const contextHash=await hashAgentContext(context);
      return json({success:true,version:RELEASE_VERSION,contextHash,context});
    }catch(e){return json({success:false,error:e?.message||'Agent context unavailable'},e?.status||500);}
  });


  router.get('/api/agent/reference/scenarios',async({request,env,url})=>{
    try{const session=await requireSession(request,env);await limitAction(env,session,'mission-reference-scenario-read',{limit:60,windowSeconds:60});const scenarios=await listMissionReferenceScenarios(env,{countryCode:url.searchParams.get('country'),sectorCode:url.searchParams.get('sector'),limit:url.searchParams.get('limit')});return json({success:true,version:MISSION_REFERENCE_VERSION,scenarios});}catch(e){return json({success:false,error:e?.message||'Mission reference scenarios unavailable',code:e?.code||'MISSION_REFERENCE_SCENARIO_UNAVAILABLE'},e?.status||500);}
  });
  router.get(/^\/api\/agent\/reference\/missions\/(?<missionId>\d+)$/,async({request,env,params,url})=>{
    try{const session=await requireSession(request,env);await limitAction(env,session,'mission-reference-read',{limit:120,windowSeconds:60});const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw Object.assign(new Error('AGENT_COMPANY_ID_REQUIRED'),{status:403,code:'AGENT_COMPANY_ID_REQUIRED'});const assessment=await assessMissionReference(env,{companyId,missionId:Number(params.missionId),scenarioCode:url.searchParams.get('scenario')});return json({success:true,version:MISSION_REFERENCE_VERSION,assessment});}catch(e){return json({success:false,error:e?.message||'Mission reference assessment unavailable',code:e?.code||'MISSION_REFERENCE_UNAVAILABLE'},e?.status||500);}
  });

  router.post(/^\/api\/agent\/outcomes$/,async({request,env})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'agent-outcome-write',{limit:120,windowSeconds:60});
      const body=await readJson(request);
      const companyId=Number(body.companyId||session.tenantId||0)||0;
      if(session.role!=='admin'&&companyId!==Number(session.tenantId||0))return json({success:false,error:'Forbidden'},403);
      const result=await appendAgentOutcomeEvent(env,{...body,companyId,actorType:body.actorType||'agent'});
      return json({success:true,version:RELEASE_VERSION,...result});
    }catch(e){return json({success:false,error:e?.message||'Agent outcome ledger unavailable'},e?.status||500);}
  });

  router.get('/api/agent/semantic/status',async({request,env})=>{
    try{const session=await requireSession(request,env);await limitAction(env,session,'agent-semantic-status-read',{limit:60,windowSeconds:60});return json({success:true,version:RELEASE_VERSION,status:semanticRuntimeStatus(env)});}catch(e){return json({success:false,error:e?.message||'Agent semantic status unavailable'},e?.status||500);}
  });
  router.post('/api/agent/semantic/search',async({request,env})=>{
    try{const session=await requireSession(request,env);await limitAction(env,session,'agent-semantic-search',{limit:30,windowSeconds:60});const body=await readJson(request);const companyId=Number(session.tenantId||0)||0;const result=await searchAgentSemanticMemory(env,{companyId,query:body?.query,limit:body?.limit,missionId:body?.missionId,accessCheck:async id=>Boolean(await getForSession(env,session,Number(id)))});return json({success:true,version:RELEASE_VERSION,...result});}catch(e){return json({success:false,error:e?.message||'Agent semantic search unavailable',code:e?.code||'AGENT_SEMANTIC_SEARCH_UNAVAILABLE'},e?.status||500);}
  });

  router.post(/^\/api\/agent\/outcomes\/derive$/,async({request,env})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'agent-outcome-derive',{limit:120,windowSeconds:60});
      const body=await readJson(request);
      return json({success:true,version:RELEASE_VERSION,outcome:deriveAgentOutcome(body)});
    }catch(e){return json({success:false,error:e?.message||'Agent outcome derivation unavailable'},e?.status||500);}
  });
}
