export const ENGINE_COORDINATION_VERSION="1.3";
export function buildEngineCoordinationContract({mission,truth=null,flow,execution,assignment=null,management,actions,unified,liveness=null,recovery=null,problems=[]}={}){
  const surface=buildMissionOperatingSurface({mission,truth,flow,execution,assignment,management,actions,unified,liveness,recovery});
  return Object.freeze({
    version:ENGINE_COORDINATION_VERSION,
    missionId:Number(mission?.id||0)||null,
    status:String(mission?.status||flow?.status||"Pending"),
    stateToken:Number(mission?.state_version||0)>0?`v:${Number(mission.state_version)}`:String(mission?.updated_at||""),
    truth,flow,execution,assignment,management,actions,unified,liveness,recovery:Object.freeze(recovery||{required:false,count:0,items:[]}),surface,
    problems:Object.freeze([...(problems||[])]),
    invariant:Object.freeze({
      sameMission:[truth?.missionId,flow?.missionId,execution?.missionId,management?.missionId,unified?.missionId]
        .filter(Boolean).every(id=>Number(id)===Number(mission?.id)),
      truthPresent:Boolean(truth?.missionId),
      truthStatusAgrees:Boolean(!truth||String(truth?.lifecycle?.status||"")===String(mission?.status==="Canceled"?"Cancelled":mission?.status||"Pending")),
      truthValid:Boolean(!truth||Object.values(truth?.invariant||{}).every(Boolean)),
      assignmentConsistent:Boolean(!assignment||assignment.feature==="assignment"),
      onePrimaryAction:Boolean(!unified?.primary||typeof unified.primary.code==="string"),
      oneExecutionOwner:Boolean(execution?.invariant?.oneExecutionOwner!==false),
      missionLive:Boolean(!liveness||liveness.state!=="BREACH")
    })
  });
}
export function validateEngineCoordination(c){
  const problems=[...(c?.problems||[])];
  if(!c?.missionId)problems.push("mission_id_missing");
  if(!c?.invariant?.sameMission)problems.push("cross_engine_mission_mismatch");
  if(!c?.invariant?.truthPresent)problems.push("canonical_mission_truth_missing");
  if(!c?.invariant?.truthStatusAgrees)problems.push("canonical_mission_truth_status_mismatch");
  if(!c?.invariant?.truthValid)problems.push("canonical_mission_truth_invariant_breach");
  if(!c?.invariant?.oneExecutionOwner)problems.push("cross_engine_execution_conflict");
  if(c?.assignment&&!c?.invariant?.assignmentConsistent)problems.push("assignment_intelligence_contract_invalid");
  if(c?.liveness?.state==="BREACH")problems.push("mission_liveness_breach");
  return [...new Set(problems)];
}

export function buildMissionOperatingSurface({mission,truth=null,flow=null,execution=null,assignment=null,management=null,actions=null,unified=null,liveness=null,recovery=null}={}){
  const primary=unified?.primary||null;
  const waiting=unified?.waiting||null;
  const utilities=dedupeActions([
    ...(unified?.utilities||[]),
    ...((actions?.utilities||[])),
  ],primary?.code);
  return Object.freeze({
    version:"1.0",
    missionId:Number(mission?.id||0)||null,
    stateToken:Number(mission?.state_version||0)>0?`v:${Number(mission.state_version)}`:String(mission?.updated_at||""),
    status:String(truth?.lifecycle?.status||mission?.status||flow?.status||"Pending"),
    terminal:Boolean(unified?.terminal||flow?.terminal),
    primary,
    waiting,
    utilities:Object.freeze(utilities),
    source:String(unified?.source||"none"),
    liveness:Object.freeze({
      state:String(liveness?.state||"UNKNOWN"),
      reason:liveness?.reason||null
    }),
    recovery:Object.freeze({required:Boolean(recovery?.required),count:Number(recovery?.count||0),stale:Boolean(recovery?.stale)}),
    assignment:Object.freeze({
      required:Boolean(assignment?.assignmentRequired),
      mutable:Boolean(assignment?.assignmentMutable),
      window:assignment?.assignmentWindow||null,
      source:assignment?.source||assignment?.assignmentSource||null,
      driverId:Number(assignment?.driverId||0)||null,
      driverAvailable:assignment?.driverAvailable??null,
      waiting:Boolean(assignment?.acquisitionWaiting)
    }),
    management:Object.freeze({
      state:management?.state||null,
      requirementCount:Number((management?.requirements||[]).filter(x=>x.state==="ACTION_REQUIRED").length),
      waitingCount:Number((management?.requirements||[]).filter(x=>x.state==="WAITING").length),
      custodyRequired:Boolean(management?.custody?.required),
      completionBlocked:Boolean(management?.completion&&!management.completion.allowed)
    }),
    execution:Object.freeze({
      ownershipKind:flow?.ownership?.kind||null,
      actor:flow?.ownership?.actor||null,
      oneExecutionOwner:execution?.invariant?.oneExecutionOwner!==false
    }),
    truth:Object.freeze({
      valid:Boolean(truth&&Object.values(truth?.invariant||{}).every(Boolean)),
      statusAgrees:Boolean(!truth||String(truth?.lifecycle?.status||"")===String(mission?.status==="Canceled"?"Cancelled":mission?.status||"Pending"))
    })
  });
}
function dedupeActions(items,primaryCode=null){
  const seen=new Set(),out=[];
  for(const action of (items||[]).filter(Boolean)){
    const code=String(action.code||"");if(!code||code===primaryCode||seen.has(code))continue;
    seen.add(code);out.push(action);
  }
  return out;
}
