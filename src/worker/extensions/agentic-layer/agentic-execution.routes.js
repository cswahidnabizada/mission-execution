import {json,readJson} from '../../core/http.js';
import {requireSession} from '../../core/auth-session.js';
import {limitAction} from '../../security/action-limit.js';
import {executeGovernedAgentMission,listAgentExecutionAttempts,AGENT_GOVERNED_EXECUTION_VERSION} from './agent-governed-execution.service.js';
import {executeMission} from '../mission-execution-coordinator/mission-execution-coordinator.service.js';
import {MISSION_EXECUTION_COORDINATOR_VERSION} from '../mission-execution-coordinator/mission-execution-coordinator.contract.js';
import {reconcileAgentExecutionAttempt,listAgentExecutionRecoveryEvents,AGENT_EXECUTION_RECOVERY_VERSION} from './agent-execution-recovery.service.js';

export function registerAgenticExecutionRoutes(router){
  router.post(/^\/api\/agent\/execution\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'agent-governed-execution',{limit:30,windowSeconds:60});
      const body=await readJson(request);
      const result=await executeMission(env,request,router,session,Number(params.missionId),body||{});
      return json({success:true,version:MISSION_EXECUTION_COORDINATOR_VERSION,legacyExecutionVersion:AGENT_GOVERNED_EXECUTION_VERSION,...result},200);
    }catch(e){return json({success:false,error:e?.message||'Governed agent execution unavailable',code:e?.code||'AGENT_GOVERNED_EXECUTION_UNAVAILABLE',attemptId:e?.attemptId||null,reasons:e?.reasons||null},e?.status||500);}
  });
  router.post(/^\/api\/agent\/execution\/attempts\/(?<attemptId>[A-Za-z0-9_-]+)\/reconcile$/,async({request,env,params})=>{
    try{const session=await requireSession(request,env);await limitAction(env,session,'agent-execution-recovery',{limit:30,windowSeconds:60});const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw Object.assign(new Error('AGENT_COMPANY_ID_REQUIRED'),{status:403,code:'AGENT_COMPANY_ID_REQUIRED'});const result=await reconcileAgentExecutionAttempt(env,{attemptId:params.attemptId,companyId});return json({success:true,version:AGENT_EXECUTION_RECOVERY_VERSION,...result},200);}catch(e){return json({success:false,error:e?.message||'Execution recovery unavailable',code:e?.code||'AGENT_EXECUTION_RECOVERY_UNAVAILABLE'},e?.status||500);}
  });
  router.get(/^\/api\/agent\/execution\/missions\/(?<missionId>\d+)\/recovery$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'agent-execution-recovery-mission-read',{limit:120,windowSeconds:60});
      const companyId=Number(session?.tenantId||0)||0;
      if(!companyId)throw Object.assign(new Error('AGENT_COMPANY_ID_REQUIRED'),{status:403,code:'AGENT_COMPANY_ID_REQUIRED'});
      const missionId=Number(params.missionId||0)||0;
      const events=await listAgentExecutionRecoveryEvents(env,{companyId,missionId,limit:new URL(request.url).searchParams.get('limit')});
      return json({success:true,version:AGENT_EXECUTION_RECOVERY_VERSION,events});
    }catch(e){return json({success:false,error:e?.message||'Mission recovery history unavailable',code:e?.code||'AGENT_EXECUTION_RECOVERY_HISTORY_UNAVAILABLE'},e?.status||500);}
  });
  router.get(/^\/api\/agent\/execution\/attempts\/(?<attemptId>[A-Za-z0-9_-]+)\/recovery$/,async({request,env,params})=>{
    try{const session=await requireSession(request,env);await limitAction(env,session,'agent-execution-recovery-read',{limit:120,windowSeconds:60});const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw Object.assign(new Error('AGENT_COMPANY_ID_REQUIRED'),{status:403,code:'AGENT_COMPANY_ID_REQUIRED'});const events=await listAgentExecutionRecoveryEvents(env,{companyId,attemptId:params.attemptId,limit:new URL(request.url).searchParams.get('limit')});return json({success:true,version:AGENT_EXECUTION_RECOVERY_VERSION,events});}catch(e){return json({success:false,error:e?.message||'Recovery history unavailable',code:e?.code||'AGENT_EXECUTION_RECOVERY_HISTORY_UNAVAILABLE'},e?.status||500);}
  });
  router.get(/^\/api\/agent\/execution\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'agent-governed-execution-read',{limit:120,windowSeconds:60});
      const missionId=Number(params.missionId)||0;
      const companyId=Number(session?.tenantId||0)||0;
      if(!companyId)throw Object.assign(new Error('AGENT_COMPANY_ID_REQUIRED'),{status:403,code:'AGENT_COMPANY_ID_REQUIRED'});
      const attempts=await listAgentExecutionAttempts(env,{companyId,missionId,limit:new URL(request.url).searchParams.get('limit')});
      return json({success:true,version:AGENT_GOVERNED_EXECUTION_VERSION,attempts});
    }catch(e){return json({success:false,error:e?.message||'Execution history unavailable',code:e?.code||'AGENT_EXECUTION_HISTORY_UNAVAILABLE'},e?.status||500);}
  });
}
