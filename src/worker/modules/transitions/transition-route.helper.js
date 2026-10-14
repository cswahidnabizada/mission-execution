import { authorityUnavailable } from '../../core/canonical-db.js';
import {guardTransition,completeTransition,failTransition,transitionSafetyInput,releaseMissionStateLock,beginMutationEvent,commitMutationEvent,failMutationEvent,markMutationApplied,markTransitionUncertain} from "./transition-safety.service.js";
import {createFencedMutationContext} from "./fenced-mutation.context.js";

export async function guardedMissionMutation({env,session,request,body={},companyId,missionId,actionCode,requireStateToken=false,run}){
  const safety=transitionSafetyInput(request,body);
  const guard=await guardTransition(env,session,{companyId,missionId,actionCode,requireExpectedUpdatedAt:requireStateToken,reconciliationHint:body,...safety});
  if(guard.duplicate)return guard.result;
  const fence=createFencedMutationContext(env,{companyId,missionId,lockToken:guard.lockToken,transitionKey:guard.key});
  let mutationApplied=false;
  try{
    await fence.assert();
    await beginMutationEvent(env,session,{transitionKey:guard.key,companyId,missionId,actionCode,mission:guard.mission});
    const result=await run(guard.mission,fence);
    await fence.assert();
    // Hard-delete removes the transition-request row through its mission FK cascade.
    // Treat the missing mission as the canonical successful terminal outcome and
    // commit the durable event ledger instead of turning a successful delete into a 500.
    if(actionCode==='delete_mission') {
      const deleted=await env.DB.prepare(`SELECT id FROM missions WHERE id=? AND company_id=? LIMIT 1`).bind(Number(missionId),Number(companyId)).first();
      if(!deleted){
        mutationApplied=true;
        await commitMutationEvent(env,{transitionKey:guard.key,companyId,missionId,result,stateTokenAfter:null});
        return result;
      }
    }
    // Persist the fact that the domain mutation returned successfully before finalizing
    // its event and idempotency record. This makes event finalization recoverable.
    await markMutationApplied(env,guard.key,result,guard.lockToken);
    mutationApplied=true;
    const normalized=await ensureCanonicalMutationVersion(env,{companyId,missionId,lockToken:guard.lockToken,baseVersion:Number(guard.mission?.state_version||0)});
    // Event and idempotency finalization occur before releasing the lease.
    // The event records the exact post-mutation canonical state version.
    await commitMutationEvent(env,{transitionKey:guard.key,companyId,missionId,result,stateTokenAfter:normalized.stateToken});
    const state=await releaseMissionStateLock(env,{companyId,missionId,lockToken:guard.lockToken,invalidate:false});
    const output=attachStateToken(result,state?.stateToken||normalized.stateToken||guard.stateToken);
    await completeTransition(env,guard.key,output);
    return output;
  }catch(error){
    // If run() failed, its domain outcome can be unknown (a downstream write may have
    // committed before an exception). Never manufacture a failed event for an uncertain
    // mutation. Keep the durable intent recoverable and block the mission until reconciled.
    if(!mutationApplied){try{await markTransitionUncertain(env,guard.key,error);}catch(recoveryError){throw authorityUnavailable('transition_uncertainty_recovery',recoveryError);}}
    try{await releaseMissionStateLock(env,{companyId,missionId,lockToken:guard.lockToken});}catch(lockError){throw authorityUnavailable('mission_state_lock_release',lockError);}
    throw error;
  }
}

function attachStateToken(result,stateToken){
  const version=stateVersionFromToken(stateToken);
  if(result&&typeof result==="object"&&!Array.isArray(result)){
    const output={...result,stateToken};
    // If a service returns a mission snapshot captured before lease release,
    // align its state_version with the token returned by the guarded mutation.
    if(version&&Number(output.id||0)&&"state_version" in output)output.state_version=version;
    if(version&&output.mission&&typeof output.mission==="object"){
      output.mission={...output.mission,state_version:version,stateToken};
    }
    return output;
  }
  return {result,stateToken};
}
async function ensureCanonicalMutationVersion(env,{companyId,missionId,lockToken,baseVersion}={}){
  let mission=await env.DB.prepare(`SELECT status,state_version,updated_at,state_lock_token FROM missions WHERE id=? AND company_id=? LIMIT 1`)
    .bind(Number(missionId),Number(companyId)).first();
  if(!mission||String(mission.state_lock_token||'')!==String(lockToken||''))throw new Error('MUTATION_LEASE_LOST');
  if(Number(mission.state_version||0)===Number(baseVersion||0)){
    const bumped=await env.DB.prepare(`UPDATE missions SET state_version=state_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND state_lock_token=? AND state_version=?`)
      .bind(Number(missionId),Number(companyId),String(lockToken),Number(baseVersion||0)).run();
    if(Number(bumped.meta?.changes||0)!==1)throw new Error('MUTATION_VERSION_CAS_FAILED');
    mission=await env.DB.prepare(`SELECT status,state_version,updated_at,state_lock_token FROM missions WHERE id=? AND company_id=? LIMIT 1`)
      .bind(Number(missionId),Number(companyId)).first();
  }
  return Object.freeze({stateToken:Number(mission?.state_version||0)>0?`v:${Number(mission.state_version)}`:null,mission});
}

function stateVersionFromToken(token){
  const raw=String(token||"");if(!raw.startsWith("v:"))return null;
  const version=Number(raw.slice(2));return version>0?version:null;
}
