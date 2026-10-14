import {json,readJson} from '../../core/http.js';
import {requireSession} from '../../core/auth-session.js';
import {limitAction} from '../../security/action-limit.js';
import {executeMission} from './mission-execution-coordinator.service.js';
import {MISSION_EXECUTION_COORDINATOR_VERSION} from './mission-execution-coordinator.contract.js';
import {convergeMissionExecutionRecovery,MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION} from './mission-execution-recovery-coordinator.service.js';
import {certifyMissionRuntimeRecovery,MISSION_RECOVERY_CERTIFICATION_VERSION} from './mission-recovery-certification.service.js';
import {assessMissionOutcome,getMissionOutcome,MISSION_OUTCOME_AUTHORITY_VERSION} from '../../security/mission-outcome-authority.service.js';
import {getMissionNextSituation,getCurrentMissionNextSituation,MISSION_CONTINUITY_AUTHORITY_VERSION} from '../../security/mission-continuity-authority.service.js';
import {createMissionPlan,getMissionPlan,listMissionPlans,acceptMissionPlan,MISSION_PLANNING_AUTHORITY_VERSION} from '../mission-planning/mission-planning-authority.service.js';
import {evaluateMissionPlan,getLatestMissionPlanEvaluation,MISSION_PLAN_EVALUATION_AUTHORITY_VERSION} from '../mission-planning/mission-plan-evaluation-authority.service.js';
import {getMissionOperatingLoop,MISSION_OPERATING_LOOP_VERSION} from './mission-operating-loop.service.js';
import {certifyMissionJourney,MISSION_CERTIFICATION_VERSION} from './mission-certification.service.js';
import {issueMissionCertificationRun,MISSION_CERTIFICATION_RUN_VERSION} from './mission-certification-run.service.js';
import {certifyMissionPlatform,MISSION_PLATFORM_CERTIFICATION_VERSION} from './mission-platform-certification.service.js';

export function registerMissionExecutionCoordinatorRoutes(router){
  router.post(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)$/,async({request,env,router:appRouter,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-execution-coordinator',{limit:30,windowSeconds:60});
      const body=await readJson(request);
      const result=await executeMission(env,request,appRouter||router,session,Number(params.missionId),body||{});
      return json({success:true,version:MISSION_EXECUTION_COORDINATOR_VERSION,...result},200);
    }catch(e){
      return json({success:false,error:e?.message||'Mission execution coordinator unavailable',code:e?.code||'MISSION_EXECUTION_COORDINATOR_UNAVAILABLE',coordinator:e?.coordinator||null},e?.status||500);
    }
  });



  router.post(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/certification\/run-token$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-certification-run-token',{limit:6,windowSeconds:300});
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_CERTIFICATION_COMPANY_ID_REQUIRED',403);
      const body=await readJson(request);
      const run=await issueMissionCertificationRun(env,{companyId,missionId:Number(params.missionId),ttlSeconds:body?.ttlSeconds,purpose:body?.purpose});
      return json({success:true,version:MISSION_CERTIFICATION_RUN_VERSION,run},200);
    }catch(e){return json({success:false,error:e?.message||'Mission certification run token unavailable',code:e?.code||'MISSION_CERTIFICATION_RUN_UNAVAILABLE'},e?.status||500);}
  });

  router.get(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/certification$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-certification-read',{limit:60,windowSeconds:60});
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_CERTIFICATION_COMPANY_ID_REQUIRED',403);
      const url=new URL(request.url);
      const profile=String(url.searchParams.get('profile')||'JOURNEY').toUpperCase();
      const certification=await certifyMissionJourney(env,{companyId,missionId:Number(params.missionId),profile});
      return json({success:true,version:MISSION_CERTIFICATION_VERSION,certification},200);
    }catch(e){return json({success:false,error:e?.message||'Mission certification unavailable',code:e?.code||'MISSION_CERTIFICATION_UNAVAILABLE'},e?.status||500);}
  });


  router.get(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/platform-certification$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-platform-certification',{limit:30,windowSeconds:60});
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_PLATFORM_CERTIFICATION_COMPANY_ID_REQUIRED',403);
      const result=await certifyMissionPlatform(env,{companyId,missionId:Number(params.missionId)});
      return json({success:true,version:MISSION_PLATFORM_CERTIFICATION_VERSION,...result},200);
    }catch(e){return json({success:false,error:e?.message||'Mission platform certification unavailable',code:e?.code||'MISSION_PLATFORM_CERTIFICATION_UNAVAILABLE'},e?.status||500);}
  });

  router.get(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/operating-loop$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-operating-loop-read',{limit:120,windowSeconds:60});
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_OPERATING_LOOP_COMPANY_ID_REQUIRED',403);
      const result=await getMissionOperatingLoop(env,{companyId,missionId:Number(params.missionId)});
      return json({success:true,...result},200);
    }catch(e){return json({success:false,error:e?.message||'Mission operating loop unavailable',code:e?.code||'MISSION_OPERATING_LOOP_UNAVAILABLE'},e?.status||500);}
  });

  router.post(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/plan$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-planning',{limit:30,windowSeconds:60});
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_PLAN_COMPANY_ID_REQUIRED',403);
      const body=await readJson(request);
      const result=await createMissionPlan(env,{request,session,companyId,missionId:Number(params.missionId),input:body||{}});
      return json({success:true,version:MISSION_PLANNING_AUTHORITY_VERSION,...result},200);
    }catch(e){return json({success:false,error:e?.message||'Mission planning unavailable',code:e?.code||'MISSION_PLANNING_UNAVAILABLE'},e?.status||500);}
  });

  router.get(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/plan$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_PLAN_COMPANY_ID_REQUIRED',403);
      const plan=await getMissionPlan(env,{companyId,missionId:Number(params.missionId)});
      return json({success:true,version:MISSION_PLANNING_AUTHORITY_VERSION,plan},200);
    }catch(e){return json({success:false,error:e?.message||'Mission plan unavailable',code:e?.code||'MISSION_PLAN_UNAVAILABLE'},e?.status||500);}
  });

  router.get(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/plans$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_PLAN_COMPANY_ID_REQUIRED',403);
      const plans=await listMissionPlans(env,{companyId,missionId:Number(params.missionId)});
      return json({success:true,version:MISSION_PLANNING_AUTHORITY_VERSION,plans},200);
    }catch(e){return json({success:false,error:e?.message||'Mission plan history unavailable',code:e?.code||'MISSION_PLAN_HISTORY_UNAVAILABLE'},e?.status||500);}
  });

  router.post(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/plan\/(?<planId>\d+)\/evaluate$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-planning-evaluate',{limit:30,windowSeconds:60});
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_PLAN_COMPANY_ID_REQUIRED',403);
      const result=await evaluateMissionPlan(env,{request,session,companyId,missionId:Number(params.missionId),planId:Number(params.planId)});
      return json({success:true,version:MISSION_PLAN_EVALUATION_AUTHORITY_VERSION,...result},200);
    }catch(e){return json({success:false,error:e?.message||'Mission plan evaluation unavailable',code:e?.code||'MISSION_PLAN_EVALUATION_UNAVAILABLE'},e?.status||500);}
  });

  router.get(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/plan\/(?<planId>\d+)\/evaluation$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_PLAN_COMPANY_ID_REQUIRED',403);
      const evaluation=await getLatestMissionPlanEvaluation(env,{companyId,missionId:Number(params.missionId),planId:Number(params.planId)});
      return json({success:true,version:MISSION_PLAN_EVALUATION_AUTHORITY_VERSION,evaluation},200);
    }catch(e){return json({success:false,error:e?.message||'Mission plan evaluation history unavailable',code:e?.code||'MISSION_PLAN_EVALUATION_HISTORY_UNAVAILABLE'},e?.status||500);}
  });

  router.post(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/plan\/(?<planId>\d+)\/accept$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-planning-accept',{limit:20,windowSeconds:60});
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_PLAN_COMPANY_ID_REQUIRED',403);
      const plan=await acceptMissionPlan(env,{request,session,companyId,missionId:Number(params.missionId),planId:Number(params.planId)});
      return json({success:true,version:MISSION_PLANNING_AUTHORITY_VERSION,plan},200);
    }catch(e){return json({success:false,error:e?.message||'Mission plan acceptance unavailable',code:e?.code||'MISSION_PLAN_ACCEPT_UNAVAILABLE'},e?.status||500);}
  });

  router.post(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/outcome$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-outcome-assessment',{limit:30,windowSeconds:60});
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_OUTCOME_COMPANY_ID_REQUIRED',403);
      const result=await assessMissionOutcome(env,{companyId,missionId:Number(params.missionId)});
      return json({success:true,version:MISSION_OUTCOME_AUTHORITY_VERSION,...result},200);
    }catch(e){return json({success:false,error:e?.message||'Mission outcome unavailable',code:e?.code||'MISSION_OUTCOME_UNAVAILABLE'},e?.status||500);}
  });

  router.get(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/next-situation$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_CONTINUITY_COMPANY_ID_REQUIRED',403);
      const current=await getCurrentMissionNextSituation(env,{companyId,missionId:Number(params.missionId)});
      return json({success:true,version:MISSION_CONTINUITY_AUTHORITY_VERSION,nextSituation:current},200);
    }catch(e){return json({success:false,error:e?.message||'Mission next situation unavailable',code:e?.code||'MISSION_CONTINUITY_UNAVAILABLE'},e?.status||500);}
  });

  router.get(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/next-situations$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_CONTINUITY_COMPANY_ID_REQUIRED',403);
      const situations=await getMissionNextSituation(env,{companyId,missionId:Number(params.missionId)});
      return json({success:true,version:MISSION_CONTINUITY_AUTHORITY_VERSION,nextSituations:situations},200);
    }catch(e){return json({success:false,error:e?.message||'Mission next situation history unavailable',code:e?.code||'MISSION_CONTINUITY_HISTORY_UNAVAILABLE'},e?.status||500);}
  });

  router.get(/^\/api\/mission-execution\/missions\/(?<missionId>\d+)\/outcome$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_OUTCOME_COMPANY_ID_REQUIRED',403);
      const outcomes=await getMissionOutcome(env,{companyId,missionId:Number(params.missionId)});
      return json({success:true,version:MISSION_OUTCOME_AUTHORITY_VERSION,outcomes},200);
    }catch(e){return json({success:false,error:e?.message||'Mission outcome history unavailable',code:e?.code||'MISSION_OUTCOME_HISTORY_UNAVAILABLE'},e?.status||500);}
  });

  router.get(/^\/api\/mission-execution\/attempts\/(?<attemptId>[A-Za-z0-9_-]+)\/recovery-certification$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-execution-recovery-certification',{limit:30,windowSeconds:60});
      const companyId=Number(session?.tenantId||0)||0;
      if(!companyId)throw fail('MISSION_EXECUTION_COMPANY_ID_REQUIRED',403);
      const result=await certifyMissionRuntimeRecovery(env,{attemptId:params.attemptId,companyId});
      return json({success:true,version:MISSION_RECOVERY_CERTIFICATION_VERSION,...result},200);
    }catch(e){return json({success:false,error:e?.message||'Mission recovery certification unavailable',code:e?.code||'MISSION_RECOVERY_CERTIFICATION_UNAVAILABLE'},e?.status||500);}
  });

  router.post(/^\/api\/mission-execution\/attempts\/(?<attemptId>[A-Za-z0-9_-]+)\/reconcile$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,'mission-execution-recovery',{limit:30,windowSeconds:60});
      const companyId=Number(session?.tenantId||0)||0;
      if(!companyId)throw fail('MISSION_EXECUTION_COMPANY_ID_REQUIRED',403);
      const result=await convergeMissionExecutionRecovery(env,{attemptId:params.attemptId,companyId,planRecovery:true});
      return json({success:true,version:MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION,...result},200);
    }catch(e){return json({success:false,error:e?.message||'Mission execution recovery unavailable',code:e?.code||'MISSION_EXECUTION_RECOVERY_UNAVAILABLE'},e?.status||500);}
  });
}

function fail(code,status=409){return Object.assign(new Error(code),{code,status})}
