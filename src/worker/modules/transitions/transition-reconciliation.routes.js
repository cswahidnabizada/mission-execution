import {json,publicErrorMessage} from '../../core/http.js';
import {requirePlatformAdministrator} from '../../security/platform-administrator.js';
import {requirePlatformSuperAdminStepUp} from '../../security/platform-super-administrator.js';
import {limitAction} from '../../security/action-limit.js';
import {reconcileMissionTransitionTruth} from './transition-safety.service.js';

export function registerTransitionReconciliationRoutes(router){
  router.get('/api/platform/admin/recovery-reconciliation',async({request,env})=>{try{
    const session=await requirePlatformAdministrator(request,env);
    await limitAction(env,session,'platform-recovery-reconciliation-list',{limit:30,windowSeconds:60});
    const rows=await env.DB.prepare(`SELECT idempotency_key,mission_id,company_id,action_code,mutation_phase,status,error_code,updated_at,reconciliation_json FROM mission_transition_requests WHERE status='processing' AND mutation_phase IN ('uncertain','event_committed') ORDER BY updated_at ASC,id ASC LIMIT 100`).all();
    const items=(rows.results||[]).map(r=>({transitionKey:r.idempotency_key,missionId:Number(r.mission_id),companyId:Number(r.company_id),actionCode:r.action_code,mutationPhase:r.mutation_phase,status:r.status,errorCode:r.error_code,updatedAt:r.updated_at,reconciliation:parseJson(r.reconciliation_json)}));
    return json({success:true,items,recoveryRequired:items.some(x=>x.mutationPhase==='uncertain'),authority:'Canonical Transition Recovery Authority'});
  }catch(e){return json({success:false,error:publicErrorMessage(e,'Recovery authority unavailable')},e?.status||500);}});

  router.post('/api/platform/admin/recovery-reconciliation/:missionId',async({request,env,params})=>{try{
    const session=await requirePlatformSuperAdminStepUp(request,env);
    const missionId=Number(params.missionId);if(!Number.isInteger(missionId)||missionId<=0)return json({success:false,error:'Invalid mission id'},400);
    await limitAction(env,session,'platform-recovery-reconciliation-run',{limit:20,windowSeconds:60});
    const mission=await env.DB.prepare(`SELECT id,company_id FROM missions WHERE id=? LIMIT 1`).bind(missionId).first();
    if(!mission)return json({success:false,error:'Mission not found'},404);
    const outcomes=await reconcileMissionTransitionTruth(env,{companyId:Number(mission.company_id),missionId});
    const rows=await env.DB.prepare(`SELECT idempotency_key,action_code,mutation_phase,status,error_code,updated_at FROM mission_transition_requests WHERE company_id=? AND mission_id=? AND status='processing' ORDER BY id ASC LIMIT 20`).bind(Number(mission.company_id),missionId).all();
    const unresolved=(rows.results||[]).filter(r=>r.mutation_phase==='uncertain').map(r=>({transitionKey:r.idempotency_key,actionCode:r.action_code,errorCode:r.error_code,updatedAt:r.updated_at}));
    return json({success:true,missionId,reconciled:outcomes,unresolved,recoveryRequired:unresolved.length>0});
  }catch(e){return json({success:false,error:publicErrorMessage(e,'Recovery reconciliation unavailable')},e?.status||500);}});

  router.get(/^\/api\/missions\/(?<missionId>\d+)\/transition-reconciliation$/,async({request,env,params})=>{try{
    const session=await requirePlatformAdministrator(request,env);const missionId=Number(params.missionId);
    await limitAction(env,session,'platform-transition-reconciliation',{limit:60,windowSeconds:60});
    const mission=await env.DB.prepare(`SELECT id,company_id FROM missions WHERE id=? LIMIT 1`).bind(missionId).first();
    if(!mission)return json({success:false,error:'Mission not found'},404);
    const outcomes=await reconcileMissionTransitionTruth(env,{companyId:Number(mission.company_id),missionId});
    const rows=await env.DB.prepare(`SELECT idempotency_key,action_code,mutation_phase,status,error_code,updated_at FROM mission_transition_requests WHERE company_id=? AND mission_id=? AND status='processing' ORDER BY id ASC LIMIT 20`).bind(Number(mission.company_id),missionId).all();
    const unresolved=(rows.results||[]).filter(r=>r.mutation_phase==='uncertain').map(r=>({transitionKey:r.idempotency_key,actionCode:r.action_code,errorCode:r.error_code,updatedAt:r.updated_at}));
    return json({success:true,missionId,reconciled:outcomes,unresolved,recoveryRequired:unresolved.length>0});
  }catch(e){return json({success:false,error:publicErrorMessage(e,'Transition reconciliation unavailable')},e?.status||500);}});
}
function parseJson(value){try{return value?JSON.parse(value):null}catch{return null}}
