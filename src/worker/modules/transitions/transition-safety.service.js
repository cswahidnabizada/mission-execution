const STALE_TRANSITION_SECONDS=120;

export async function guardTransition(env,session,{
  companyId,missionId,actionCode,idempotencyKey=null,expectedUpdatedAt=null,requireExpectedUpdatedAt=false,reconciliationHint=null
}={}){
  let mission=await env.DB.prepare(`SELECT id,company_id,status,updated_at,state_version,state_lock_token,state_lock_at FROM missions WHERE id=? AND company_id=? LIMIT 1`)
    .bind(Number(missionId),Number(companyId)).first();
  if(!mission)throw make("Mission not found",404);

  // A crashed Worker must not leave a mission permanently locked. Expired locks
  // are converted into a new canonical version and the caller is forced to
  // refresh before attempting another mutation.
  if(mission.state_lock_token){
    const recovered=await env.DB.prepare(`
      UPDATE missions
      SET state_version=state_version+1,state_lock_token=NULL,state_lock_at=NULL
      WHERE id=? AND company_id=? AND state_lock_token=?
        AND (state_lock_at IS NULL OR datetime(state_lock_at)<=datetime('now','-120 seconds'))
    `).bind(Number(missionId),Number(companyId),String(mission.state_lock_token)).run();
    if(Number(recovered.meta?.changes||0)===1){
      mission=await env.DB.prepare(`SELECT id,company_id,status,updated_at,state_version,state_lock_token,state_lock_at FROM missions WHERE id=? AND company_id=? LIMIT 1`)
        .bind(Number(missionId),Number(companyId)).first();
      throw make("MISSION_CHANGED",409,{currentStateToken:missionStateToken(mission),currentUpdatedAt:mission.updated_at,currentStatus:mission.status,recoveredStaleLock:true});
    }
    throw make("ACTION_ALREADY_PROCESSING",409,{currentStateToken:missionStateToken(mission),currentUpdatedAt:mission.updated_at,currentStatus:mission.status});
  }

  // Reconcile durable intents while the mission is known to be unlocked and before
  // creating this request's lease. An uncertain prior mutation blocks safely here.
  const reconciliation=await reconcileMissionTransitionTruth(env,{companyId,missionId});
  const unresolved=reconciliation.filter(x=>x.status==='recovery_required');
  if(unresolved.length){
    throw make('TRANSITION_RECOVERY_REQUIRED',409,{currentStateToken:missionStateToken(mission),recoveryRequired:true,transitions:unresolved.map(x=>({transitionKey:x.transitionKey,actionCode:x.actionCode,reason:x.reason}))});
  }
  mission=await env.DB.prepare(`SELECT id,company_id,status,updated_at,state_version,state_lock_token,state_lock_at FROM missions WHERE id=? AND company_id=? LIMIT 1`)
    .bind(Number(missionId),Number(companyId)).first();
  if(mission?.state_lock_token)throw make("ACTION_ALREADY_PROCESSING",409,{currentStateToken:missionStateToken(mission)});
  const currentStateToken=missionStateToken(mission);
  if(requireExpectedUpdatedAt&&!expectedUpdatedAt){
    throw make("MISSION_STATE_TOKEN_REQUIRED",428,{currentStateToken,currentUpdatedAt:mission.updated_at,currentStatus:mission.status});
  }
  if(expectedUpdatedAt&&!matchesMissionStateToken(mission,expectedUpdatedAt)){
    throw make("MISSION_CHANGED",409,{currentStateToken,currentUpdatedAt:mission.updated_at,currentStatus:mission.status});
  }

  const identity=Number(session?.identityId||session?.authIdentityId||session?.userId||session?.driverId||session?.executorId||session?.tenantId||0)||0;
  const actorScope=`${session?.role||"user"}:${identity}:${Number(companyId)}:${Number(missionId)}:${String(actionCode)}`;
  const clientKey=idempotencyKey?String(idempotencyKey).slice(0,180):null;
  const key=clientKey?`${actorScope}:${clientKey}`:`${actorScope}:${expectedUpdatedAt||currentStateToken||mission.status}`;

  const insert=await env.DB.prepare(`
    INSERT OR IGNORE INTO mission_transition_requests(
      idempotency_key,company_id,mission_id,action_code,expected_updated_at,status,reconciliation_json
    ) VALUES(?,?,?,?,?,'processing',?)
  `).bind(key,Number(companyId),Number(missionId),String(actionCode),expectedUpdatedAt||currentStateToken||null,JSON.stringify(safeReconciliationHint(actionCode,reconciliationHint)||null)).run();

  if(Number(insert.meta?.changes||0)===0){
    const existing=await env.DB.prepare(`SELECT status,result_json,error_code FROM mission_transition_requests WHERE idempotency_key=? LIMIT 1`).bind(key).first();
    if(existing?.status==="completed")return Object.freeze({duplicate:true,key,result:parse(existing.result_json)});
    if(existing?.status==="processing")throw make("ACTION_ALREADY_PROCESSING",409,{currentStateToken});
    if(existing?.status==="failed")throw make(existing.error_code||"PREVIOUS_ACTION_FAILED",409,{currentStateToken});
  }

  // Compare-and-set lease acquisition serializes all critical mutations for this mission.
  // The durable lock is opaque; actor/idempotency metadata stays only in the
  // transition-request table and is never exposed through mission reads.
  const leaseToken=crypto.randomUUID();
  const lock=await env.DB.prepare(`
    UPDATE missions SET state_lock_token=?,state_lock_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=? AND state_version=? AND state_lock_token IS NULL
  `).bind(leaseToken,Number(missionId),Number(companyId),Number(mission.state_version||1)).run();

  if(Number(lock.meta?.changes||0)!==1){
    await env.DB.prepare(`
      UPDATE mission_transition_requests SET status='failed',error_code='MISSION_CHANGED',updated_at=CURRENT_TIMESTAMP
      WHERE idempotency_key=? AND status='processing'
    `).bind(key).run();
    const current=await env.DB.prepare(`SELECT status,updated_at,state_version,state_lock_token,state_lock_at FROM missions WHERE id=? AND company_id=? LIMIT 1`)
      .bind(Number(missionId),Number(companyId)).first();
    throw make(current?.state_lock_token?"ACTION_ALREADY_PROCESSING":"MISSION_CHANGED",409,{
      currentStateToken:missionStateToken(current||{}),currentUpdatedAt:current?.updated_at||null,currentStatus:current?.status||null
    });
  }

  return Object.freeze({duplicate:false,key,mission,currentStateToken:missionStateToken(mission),stateToken:missionStateToken(mission),lockToken:leaseToken});
}

export async function markMutationApplied(env,key,result={},lockToken=null){
  const updated=await env.DB.prepare(`
    UPDATE mission_transition_requests
    SET mutation_phase='applied',result_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE idempotency_key=? AND status='processing'
      AND (? IS NULL OR EXISTS(SELECT 1 FROM missions m JOIN mission_transition_requests r ON r.mission_id=m.id AND r.company_id=m.company_id WHERE r.idempotency_key=? AND m.state_lock_token=?))
  `).bind(JSON.stringify(result||{}),String(key),lockToken, String(key), String(lockToken||'')).run();
  if(Number(updated.meta?.changes||0)!==1)throw make("TRANSITION_INTENT_NOT_ACTIVE",409);
  return result;
}

export async function markTransitionUncertain(env,key,error){
  await env.DB.prepare(`
    UPDATE mission_transition_requests
    SET mutation_phase='uncertain',error_code=?,updated_at=CURRENT_TIMESTAMP
    WHERE idempotency_key=? AND status='processing'
  `).bind(String(error?.message||"TRANSITION_OUTCOME_UNCERTAIN").slice(0,120),String(key)).run();
}

export async function reconcileMissionTransitionTruth(env,{companyId,missionId}={}){
  const owner=Number(companyId),id=Number(missionId);
  if(!owner||!id)return [];

  // Reconciliation is itself a canonical mutation of the transition ledger. Hold
  // the same mission state lease used by normal commands while proving an
  // uncertain outcome, otherwise another command could change canonical truth
  // between verification and completion of the recovery record.
  const missionBefore=await env.DB.prepare(`
    SELECT id,status,state_version,updated_at,state_lock_token,state_lock_at
    FROM missions WHERE id=? AND company_id=? LIMIT 1
  `).bind(id,owner).first();
  if(!missionBefore)return [];
  if(missionBefore.state_lock_token){
    return [{status:'recovery_required',reason:'mission_locked_by_active_mutation'}];
  }
  const leaseToken=crypto.randomUUID();
  const leased=await env.DB.prepare(`
    UPDATE missions SET state_lock_token=?,state_lock_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=? AND state_version=? AND state_lock_token IS NULL
  `).bind(leaseToken,id,owner,Number(missionBefore.state_version||1)).run();
  if(Number(leased.meta?.changes||0)!==1){
    return [{status:'recovery_required',reason:'reconciliation_lease_conflict'}];
  }

  const outcomes=[];
  try{
    const rows=await env.DB.prepare(`
      SELECT id,idempotency_key,status,mutation_phase,result_json,error_code,action_code,reconciliation_json,updated_at
      FROM mission_transition_requests
      WHERE company_id=? AND mission_id=? AND status='processing'
        AND (mutation_phase IN ('applied','event_committed','uncertain')
          OR (mutation_phase='processing' AND datetime(updated_at)<=datetime('now',?)))
      ORDER BY id ASC LIMIT 20
    `).bind(owner,id,`-${STALE_TRANSITION_SECONDS} seconds`).all();

    for(const row of rows.results||[]){
      const fenceBefore=await readMissionFence(env,{companyId:owner,missionId:id,lockToken:leaseToken});
      if(!fenceBefore){
        outcomes.push({transitionKey:row.idempotency_key,status:'recovery_required',reason:'reconciliation_lease_lost'});
        continue;
      }
      if(row.mutation_phase==='event_committed'){
        const result=parse(row.result_json); await completeTransition(env,row.idempotency_key,result);
        outcomes.push({transitionKey:row.idempotency_key,status:'completed',reason:'event_committed'}); continue;
      }
      const event=await env.DB.prepare(`SELECT outcome,result_json FROM mission_event_ledger WHERE transition_key=? LIMIT 1`)
        .bind(String(row.idempotency_key)).first();
      if(event?.outcome==='committed'){
        const result=parse(event.result_json||row.result_json);
        const fenceAfterEvent=await readMissionFence(env,{companyId:owner,missionId:id,lockToken:leaseToken});
        if(!sameMissionFence(fenceBefore,fenceAfterEvent)){
          outcomes.push({transitionKey:row.idempotency_key,status:'recovery_required',reason:'canonical_truth_changed_during_reconciliation'});
          continue;
        }
        await env.DB.prepare(`UPDATE mission_transition_requests SET mutation_phase='event_committed',result_json=?,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=? AND status='processing'`)
          .bind(JSON.stringify(result||{}),String(row.idempotency_key)).run();
        await completeTransition(env,row.idempotency_key,result);
        outcomes.push({transitionKey:row.idempotency_key,status:'completed',reason:'event_ledger_committed'}); continue;
      }
      if(row.mutation_phase==='uncertain' || row.mutation_phase==='processing'){
        const verification=await verifyUncertainMutation(env,{companyId:owner,missionId:id,row});
        const fenceAfter=await readMissionFence(env,{companyId:owner,missionId:id,lockToken:leaseToken});
        if(!sameMissionFence(fenceBefore,fenceAfter)){
          outcomes.push({transitionKey:row.idempotency_key,status:'recovery_required',reason:'canonical_truth_changed_during_reconciliation'});
          continue;
        }
        if(verification.state==='committed'){
          const result=verification.result||parse(row.result_json);
          await commitMutationEvent(env,{transitionKey:row.idempotency_key,companyId:owner,missionId:id,result,stateTokenAfter:verification.stateTokenAfter||null});
          const fenceAfterCommit=await readMissionFence(env,{companyId:owner,missionId:id,lockToken:leaseToken});
          if(!sameMissionFence(fenceBefore,fenceAfterCommit)){
            outcomes.push({transitionKey:row.idempotency_key,status:'recovery_required',reason:'canonical_truth_changed_before_reconciliation_commit'});
            continue;
          }
          await env.DB.prepare(`UPDATE mission_transition_requests SET mutation_phase='event_committed',result_json=?,error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=? AND status='processing'`)
            .bind(JSON.stringify(result||{}),String(row.idempotency_key)).run();
          await completeTransition(env,row.idempotency_key,result);
          outcomes.push({transitionKey:row.idempotency_key,status:'completed',reason:verification.reason}); continue;
        }
        if(verification.state==='not_committed'){
          await failMutationEvent(env,{transitionKey:row.idempotency_key,error:new Error('TRANSITION_NOT_COMMITTED')});
          await env.DB.prepare(`UPDATE mission_transition_requests SET status='failed',mutation_phase='failed',error_code='TRANSITION_NOT_COMMITTED',updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=? AND status='processing'`)
            .bind(String(row.idempotency_key)).run();
          outcomes.push({transitionKey:row.idempotency_key,status:'failed',reason:verification.reason}); continue;
        }
        outcomes.push({transitionKey:row.idempotency_key,status:'recovery_required',reason:'Outcome cannot be proven from canonical state; explicit review is required'}); continue;
      }
      const mission=await env.DB.prepare(`SELECT status,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1`)
        .bind(id,owner).first();
      if(!mission)continue;
      const fenceAfter=await readMissionFence(env,{companyId:owner,missionId:id,lockToken:leaseToken});
      if(!sameMissionFence(fenceBefore,fenceAfter)){
        outcomes.push({transitionKey:row.idempotency_key,status:'recovery_required',reason:'canonical_truth_changed_during_reconciliation'});
        continue;
      }
      await commitMutationEvent(env,{transitionKey:row.idempotency_key,companyId:owner,missionId:id,result:parse(row.result_json),stateTokenAfter:missionStateToken(mission)});
      await env.DB.prepare(`UPDATE mission_transition_requests SET mutation_phase='event_committed',updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=? AND status='processing'`)
        .bind(String(row.idempotency_key)).run();
      await completeTransition(env,row.idempotency_key,parse(row.result_json));
      outcomes.push({transitionKey:row.idempotency_key,status:'completed',reason:'applied_recovered'});
    }
    return outcomes;
  }finally{
    const released=await env.DB.prepare(`
      UPDATE missions SET state_lock_token=NULL,state_lock_at=NULL
      WHERE id=? AND company_id=? AND state_lock_token=?
    `).bind(id,owner,leaseToken).run();
    if(Number(released.meta?.changes||0)!==1){
      // Do not hide a lost recovery lease. The next command must surface the
      // recovery boundary instead of assuming reconciliation completed safely.
      outcomes.push({status:'recovery_required',reason:'reconciliation_lease_release_failed'});
    }
  }
}

async function readMissionFence(env,{companyId,missionId,lockToken}={}){
  const row=await env.DB.prepare(`
    SELECT status,state_version,updated_at,state_lock_token
    FROM missions WHERE id=? AND company_id=? LIMIT 1
  `).bind(Number(missionId),Number(companyId)).first();
  if(!row || String(row.state_lock_token||'')!==String(lockToken||''))return null;
  return {status:String(row.status||''),stateVersion:Number(row.state_version||0),updatedAt:String(row.updated_at||'')};
}

function sameMissionFence(a,b){
  return Boolean(a&&b)
    && Number(a.stateVersion)===Number(b.stateVersion)
    && String(a.status||'')===String(b.status||'')
    && String(a.updatedAt||'')===String(b.updatedAt||'');
}

async function verifyUncertainMutation(env,{companyId,missionId,row}){
  const hint=parse(row.reconciliation_json);
  const action=String(row.action_code||'');
  const mission=await env.DB.prepare(`SELECT id,status,state_version,updated_at,public_enabled FROM missions WHERE id=? AND company_id=? LIMIT 1`)
    .bind(Number(missionId),Number(companyId)).first();
  if(!mission)return {state:'unknown'};
  if(action==='assign_driver'){
    const requested=Number(hint.driverId||0)||0;
    const actualRow=await env.DB.prepare(`SELECT assignee_id AS driver_id FROM mission_active_assignment_projection WHERE mission_id=? AND company_id=? AND assignment_type='owner_driver' AND assignee_type='driver' AND status='active' LIMIT 1`).bind(Number(missionId),Number(companyId)).first();
    const actual=Number(actualRow?.driver_id||0)||0;
    if(actual>0 && (!requested || actual===requested)) return {state:'committed',reason:'canonical_driver_assignment_matches_intent',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),reconciled:true,driverId:actual}};
    if(requested && actual!==requested) return {state:'not_committed',reason:'canonical_driver_assignment_does_not_match_intent'};
    return {state:'unknown'};
  }
  if(action==='foryou_request'){
    const requesterType=String(hint.requesterType||'tenant');
    const requesterId=Number(hint.requesterId||0)||0;
    const row=requesterType==='executor'
      ? await env.DB.prepare(`SELECT id,status FROM public_mission_requests WHERE company_id=? AND mission_id=? AND requester_type='executor' AND executor_id=? ORDER BY id DESC LIMIT 1`).bind(Number(companyId),Number(missionId),requesterId).first()
      : await env.DB.prepare(`SELECT id,status FROM public_mission_requests WHERE company_id=? AND mission_id=? AND requester_type='tenant' AND requester_company_id=? ORDER BY id DESC LIMIT 1`).bind(Number(companyId),Number(missionId),requesterId).first();
    if(row?.status==='Pending')return {state:'committed',reason:'canonical_foryou_request_exists',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),requestId:Number(row.id),status:'Pending',reconciled:true}};
    return {state:'not_committed',reason:'canonical_foryou_request_not_found'};
  }
  if(action==='foryou_approve' || action==='foryou_decline' || action==='foryou_cancel'){
    const requestId=Number(hint.requestId||0)||0;
    if(!requestId)return {state:'unknown'};
    const row=await env.DB.prepare(`
      SELECT id,status,requester_type,requester_company_id,executor_id
      FROM public_mission_requests
      WHERE id=? AND company_id=? AND mission_id=? LIMIT 1
    `).bind(requestId,Number(companyId),Number(missionId)).first();
    const expected=action==='foryou_approve'?'Approved':action==='foryou_decline'?'Declined':'Cancelled';
    if(row?.status===expected){
      if(action==='foryou_approve'){
        let accessReady=false;
        if(row.requester_type==='tenant'&&row.requester_company_id){
          const access=await env.DB.prepare(`SELECT id FROM mission_tenant_access WHERE mission_id=? AND owner_company_id=? AND access_company_id=? AND status='active' LIMIT 1`).bind(Number(missionId),Number(companyId),Number(row.requester_company_id)).first();
          accessReady=Boolean(access);
        }else if(row.executor_id){
          const assignment=await env.DB.prepare(`SELECT id FROM mission_active_assignment_projection WHERE mission_id=? AND company_id=? AND assignee_id=? AND assignment_type='executor' AND assignee_type='executor' AND status='active' LIMIT 1`).bind(Number(missionId),Number(companyId),Number(row.executor_id)).first();
          accessReady=Boolean(assignment);
        }
        const marketplaceClosed=Number(mission.public_enabled||0)!==1;
        if(!accessReady){
          const custody=await env.DB.prepare(`
            SELECT id FROM mission_custody_cases
            WHERE company_id=? AND mission_id=? AND status='awaiting_acceptance'
              AND recipient_type=? AND recipient_id=?
            LIMIT 1
          `).bind(Number(companyId),Number(missionId),String(row.requester_type),Number(row.requester_type==='tenant'?row.requester_company_id:row.executor_id)).first();
          accessReady=Boolean(custody);
        }
        if(!accessReady || !marketplaceClosed)return {state:'not_committed',reason:'canonical_foryou_approval_is_incomplete'};
      }
      return {state:'committed',reason:`canonical_${action}_exists`,stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),requestId,status:expected,reconciled:true}};
    }
    if(row?.status==='Pending')return {state:'not_committed',reason:`${action}_not_committed`};
    return {state:'unknown'};
  }
  if(action==='shared_driver_assignment'){
    const requested=Number(hint.driverId||0)||0;
    const actual=requested
      ? await env.DB.prepare(`SELECT assignee_id AS driver_id FROM mission_active_assignment_projection WHERE company_id=? AND mission_id=? AND assignee_id=? AND assignment_type='tenant_driver' AND assignee_type='driver' LIMIT 1`).bind(Number(companyId),Number(missionId),requested).first()
      : null;
    const driverId=Number(actual?.driver_id||0)||0;
    if(driverId)return {state:'committed',reason:'canonical_shared_driver_assignment_matches_intent',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),driverId,reconciled:true}};
    if(requested)return {state:'not_committed',reason:'canonical_shared_driver_assignment_does_not_match_intent'};
    return {state:'unknown'};
  }
  if(action==='network_invite'){
    const requestedType=String(hint.recipientType||''); const requestedId=Number(hint.recipientId||0)||0;
    const inv=await env.DB.prepare(`SELECT id,status,recipient_type,recipient_company_id,recipient_executor_id FROM network_mission_invitations WHERE owner_company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`).bind(Number(companyId),Number(missionId)).first();
    const actualId=Number(inv?.recipient_type==='tenant'?inv?.recipient_company_id:inv?.recipient_executor_id||0)||0;
    if(inv?.status==='Pending'&&(!requestedType||inv.recipient_type===requestedType)&&(!requestedId||actualId===requestedId))return {state:'committed',reason:'canonical_network_invitation_exists',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),invitationId:Number(inv.id),reconciled:true}};
    return {state:'not_committed',reason:'canonical_network_invitation_not_found'};
  }
  if(action.startsWith('network_invitation:')){
    const requested=String(action.split(':')[1]||'');
    const invitationId=Number(hint.invitationId||0)||0;
    const inv=invitationId
      ? await env.DB.prepare(`SELECT id,status FROM network_mission_invitations WHERE id=? AND owner_company_id=? AND mission_id=? LIMIT 1`).bind(invitationId,Number(companyId),Number(missionId)).first()
      : await env.DB.prepare(`SELECT id,status FROM network_mission_invitations WHERE owner_company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`).bind(Number(companyId),Number(missionId)).first();
    const expected=requested==='accept'?'Accepted':requested==='reject'?'Rejected':null;
    if(expected&&inv?.status===expected)return {state:'committed',reason:`canonical_network_invitation_${requested}_exists`,stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),invitationId:Number(inv.id),status:expected,reconciled:true}};
    if(expected)return {state:'not_committed',reason:`canonical_network_invitation_${requested}_not_committed`};
    return {state:'unknown'};
  }
  if(action==='reclaim_execution'){
    const ownership=await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM mission_active_assignment_projection WHERE company_id=? AND mission_id=? AND status='active') AS executor_count,
        (SELECT COUNT(*) FROM mission_tenant_access WHERE owner_company_id=? AND mission_id=? AND status='active') AS tenant_count
    `).bind(Number(companyId),Number(missionId),Number(companyId),Number(missionId)).first();
    const status=String(mission.status||'');
    if(Number(ownership?.executor_count||0)===0&&Number(ownership?.tenant_count||0)===0&&status==='Pending')return {state:'committed',reason:'canonical_execution_reclaim_complete',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),reconciled:true,status:'Pending'}};
    if(status==='Delivered'&&Number(ownership?.executor_count||0)===0&&Number(ownership?.tenant_count||0)===0)return {state:'committed',reason:'canonical_delivery_reclaim_complete',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),reconciled:true,status:'Delivered'}};
    return {state:'not_committed',reason:'canonical_execution_reclaim_not_complete'};
  }
  if(action==='resolve_exception'){
    const exceptionId=Number(hint.exceptionId||0)||0;
    if(!exceptionId)return {state:'unknown'};
    const row=await env.DB.prepare(`SELECT id FROM mission_exceptions WHERE company_id=? AND mission_id=? AND id=? AND resolved_at IS NULL LIMIT 1`).bind(Number(companyId),Number(missionId),exceptionId).first();
    if(!row)return {state:'committed',reason:'canonical_exception_resolution_exists',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),exceptionId,status:'resolved',reconciled:true}};
    return {state:'not_committed',reason:'canonical_exception_remains_open'};
  }
  if(action==='capture_delivery_proof'){
    const proof=await env.DB.prepare(`SELECT id,file_id FROM mission_delivery_proofs WHERE company_id=? AND mission_id=? LIMIT 1`).bind(Number(companyId),Number(missionId)).first();
    if(proof)return {state:'committed',reason:'canonical_delivery_proof_exists',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),proofId:Number(proof.id),fileId:Number(proof.file_id),reconciled:true}};
    return {state:'not_committed',reason:'canonical_delivery_proof_not_found'};
  }
  if(action==='publish_foryou'){
    if(Number(mission.public_enabled||0)===1)return {state:'committed',reason:'canonical_foryou_state_matches_intent',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),reconciled:true,publicEnabled:true}};
    return {state:'not_committed',reason:'canonical_foryou_state_does_not_match_intent'};
  }
  if(action==='management:reactivate_mission'){
    if(String(mission.status||'')==='Pending')return {state:'committed',reason:'canonical_reactivation_state_matches_intent',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),reconciled:true,status:'Pending'}};
    return {state:'not_committed',reason:'canonical_reactivation_state_does_not_match_intent'};
  }
  if(action==='management:cancel_mission'){
    if(String(mission.status||'')==='Cancelled' || String(mission.status||'')==='Canceled')return {state:'committed',reason:'canonical_cancellation_state_matches_intent',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),reconciled:true,status:'Cancelled'}};
    return {state:'not_committed',reason:'canonical_cancellation_state_does_not_match_intent'};
  }
  if(action.startsWith('status:')){
    const expected=action.slice(7); const actual=String(mission.status||'');
    if(actual===expected || (expected==='Canceled'&&actual==='Cancelled'))return {state:'committed',reason:'canonical_status_matches_intent',stateTokenAfter:missionStateToken(mission),result:{missionId:Number(missionId),reconciled:true,status:actual}};
    return {state:'not_committed',reason:'canonical_status_does_not_match_intent'};
  }
  return {state:'unknown'};
}

function safeReconciliationHint(actionCode,hint){
  const h=hint&&typeof hint==='object'?hint:{}; const a=String(actionCode||'');
  if(a==='assign_driver')return {driverId:Number(h.driverId||0)||null};
  if(a==='foryou_request')return {requesterType:String(h.requesterType||'tenant'),requesterId:Number(h.requesterId||0)||null};
  if(a==='foryou_approve'||a==='foryou_decline'||a==='foryou_cancel')return {requestId:Number(h.requestId||0)||null};
  if(a==='shared_driver_assignment')return {driverId:Number(h.driverId||0)||null};
  if(a==='network_invite')return {recipientType:String(h.recipientType||''),recipientId:Number(h.recipientId||0)||null};
  if(a.startsWith('network_invitation:'))return {invitationId:Number(h.invitationId||0)||null};
  if(a==='resolve_exception')return {exceptionId:Number(h.exceptionId||0)||null};
  if(a==='capture_delivery_proof')return {missionId:Number(h.missionId||0)||null};
  if(a==='publish_foryou')return {intent:'publish_foryou'};
  if(a==='management:reactivate_mission')return {targetStatus:'Pending'};
  if(a==='management:cancel_mission')return {targetStatus:'Cancelled'};
  if(a.startsWith('status:'))return {targetStatus:a.slice(7,60)};
  return null;
}

export async function completeTransition(env,key,result={}){
  await env.DB.prepare(`
    UPDATE mission_transition_requests
    SET status='completed',mutation_phase='completed',result_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE idempotency_key=? AND status='processing'
  `).bind(JSON.stringify(result||{}),String(key)).run();
  return result;
}

export async function failTransition(env,key,error){
  await env.DB.prepare(`
    UPDATE mission_transition_requests
    SET status='failed',error_code=?,updated_at=CURRENT_TIMESTAMP
    WHERE idempotency_key=? AND status='processing'
  `).bind(String(error?.message||"TRANSITION_FAILED").slice(0,120),String(key)).run();
}

export async function beginMutationEvent(env,session,{transitionKey,companyId,missionId,actionCode,mission=null}={}){
  const identity=Number(session?.identityId||session?.authIdentityId||session?.userId||session?.driverId||session?.executorId||session?.tenantId||0)||null;
  const actorName=session?.displayName||session?.companyName||session?.driverName||(session?.role==="executor"?"Independent executor":session?.role==="driver"?"Driver":"Tenant");
  const eventKey=`transition:${String(transitionKey)}`;
  await env.DB.prepare(`
    INSERT OR IGNORE INTO mission_event_ledger(
      event_key,transition_key,company_id,mission_id,action_code,outcome,
      actor_role,actor_identity_id,actor_name,from_status,state_token_before
    ) VALUES(?,?,?,?,?,'processing',?,?,?,?,?)
  `).bind(
    eventKey,String(transitionKey),Number(companyId),Number(missionId),String(actionCode),
    String(session?.role||"system"),identity,actorName,String(mission?.status||"")||null,missionStateToken(mission||{})||null
  ).run();
  return eventKey;
}

export async function commitMutationEvent(env,{transitionKey,companyId,missionId,result=null,stateTokenAfter=null}={}){
  const mission=await env.DB.prepare(`SELECT status,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1`)
    .bind(Number(missionId),Number(companyId)).first();
  const toStatus=mission?.status||"DELETED";
  const token=mission?(stateTokenAfter||missionStateToken(mission||{})||null):null;
  const updated=await env.DB.prepare(`
    UPDATE mission_event_ledger
    SET outcome='committed',to_status=?,state_token_after=?,result_json=?,error_code=NULL,
        committed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE transition_key=? AND outcome='processing'
  `).bind(String(toStatus),token,JSON.stringify(result||{}),String(transitionKey)).run();
  if(Number(updated.meta?.changes||0)!==1){
    const existing=await env.DB.prepare(`SELECT outcome FROM mission_event_ledger WHERE transition_key=? LIMIT 1`)
      .bind(String(transitionKey)).first();
    if(existing?.outcome!=="committed")throw make("MISSION_EVENT_COMMIT_FAILED",500);
  }
  return {toStatus,stateTokenAfter:token};
}

export async function failMutationEvent(env,{transitionKey,error}={}){
  await env.DB.prepare(`
    UPDATE mission_event_ledger
    SET outcome='failed',error_code=?,updated_at=CURRENT_TIMESTAMP
    WHERE transition_key=? AND outcome='processing'
  `).bind(String(error?.message||"TRANSITION_FAILED").slice(0,120),String(transitionKey)).run();
}

export async function listCommittedMutationEvents(env,{companyId,missionId,limit=100}={}){
  const n=Math.max(1,Math.min(500,Number(limit)||100));
  const rows=await env.DB.prepare(`
    SELECT id,action_code,actor_role,actor_name,from_status,to_status,committed_at,created_at
    FROM mission_event_ledger
    WHERE company_id=? AND mission_id=? AND outcome='committed'
    ORDER BY id DESC LIMIT ?
  `).bind(Number(companyId),Number(missionId),n).all();
  return rows.results||[];
}

export async function releaseMissionStateLock(env,{companyId,missionId,lockToken,invalidate=true}={}){
  const released=await env.DB.prepare(`
    UPDATE missions
    SET state_version=CASE WHEN ?=1 THEN state_version+1 ELSE state_version END,state_lock_token=NULL,state_lock_at=NULL
    WHERE id=? AND company_id=? AND state_lock_token=?
  `).bind(invalidate?1:0,Number(missionId),Number(companyId),String(lockToken||"")).run();
  if(Number(released.meta?.changes||0)!==1){
    const current=await env.DB.prepare(`SELECT state_version,updated_at,status FROM missions WHERE id=? AND company_id=? LIMIT 1`)
      .bind(Number(missionId),Number(companyId)).first();
    return current?{stateToken:missionStateToken(current),released:false}:null;
  }
  const current=await env.DB.prepare(`SELECT state_version,updated_at,status FROM missions WHERE id=? AND company_id=? LIMIT 1`)
    .bind(Number(missionId),Number(companyId)).first();
  return current?{stateToken:missionStateToken(current),released:true}:null;
}

export async function recordTransitionEvent(env,session,{
  companyId,missionId,eventType,fromStatus=null,toStatus=null,reasonCode=null,metadata={},eventKey=null
}={}){
  const identity=Number(session?.identityId||session?.authIdentityId||session?.userId||session?.driverId||session?.executorId||session?.tenantId||0)||null;
  const actorName=session?.displayName||session?.companyName||session?.driverName||(session?.role==="executor"?"Independent executor":session?.role==="driver"?"Driver":"Tenant");
  const mission=await env.DB.prepare(`SELECT status,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1`)
    .bind(Number(missionId),Number(companyId)).first();
  if(mission&&toStatus){
    const expected=String(toStatus==="Canceled"?"Cancelled":toStatus);
    const actual=String(mission.status==="Canceled"?"Cancelled":mission.status||"");
    if(expected!==actual)throw make("TRANSITION_EVENT_TRUTH_MISMATCH",409,{expectedStatus:expected,currentStatus:actual,eventType:String(eventType)});
  }
  const version=Number(mission?.state_version||0);
  const semanticKey=`${companyId}:${missionId}:${version>0?`v${version}`:String(mission?.updated_at||"legacy")}:${eventType}:${reasonCode||""}`;
  const key=String(eventKey||semanticKey);
  const enriched={...(metadata||{}),stateVersion:version||null};
  await env.DB.prepare(`
    INSERT OR IGNORE INTO mission_transition_events(
      event_key,company_id,mission_id,event_type,actor_role,actor_identity_id,actor_name,
      from_status,to_status,reason_code,metadata_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    key,Number(companyId),Number(missionId),String(eventType),String(session?.role||"system"),identity,actorName,
    fromStatus||null,toStatus||null,reasonCode||null,JSON.stringify(enriched)
  ).run();
  return key;
}

export function transitionSafetyInput(request,body={}){
  return Object.freeze({
    idempotencyKey:request.headers.get("x-idempotency-key")||body.idempotencyKey||null,
    expectedUpdatedAt:request.headers.get("x-mission-state-token")||request.headers.get("x-mission-updated-at")||body.expectedStateToken||body.expectedUpdatedAt||null
  });
}

export function missionStateToken(mission={}){
  const version=Number(mission?.state_version||0);
  return version>0?`v:${version}`:String(mission?.updated_at||"");
}
export function matchesMissionStateToken(mission={},expected){
  const token=String(expected||"");
  if(!token)return false;
  const version=Number(mission?.state_version||0);
  if(version>0)return token===`v:${version}`;
  // Timestamp tokens are accepted only for genuinely pre-migration rows.
  return token===String(mission?.updated_at||"");
}
function parse(v){try{return JSON.parse(v||"{}")}catch{return {}}}
function make(message,status,details=null){const e=new Error(message);e.status=status;if(details)e.details=details;return e;}
