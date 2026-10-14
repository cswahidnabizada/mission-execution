import * as executorOperationalRepo from "../../../repositories/executor-operational.repository.js";

export async function executionAvailabilityState(env,featureState={},conditions={}){
  const a=featureState.assignment||{},r=conditions.responsibility||{};
  const executorId=Number(r.executorId||0)||null;
  const driverId=Number(a.driverId||r.driverId||0)||null;

  if(executorId){
    let available=null,situation=null;
    try{
      const profile=await executorOperationalRepo.getProfile(env,executorId);
      situation=String(profile?.situation||"");
      available=profile?situation!=="Unavailable":null;
    }catch(error){
      console.warn("MISSION_READINESS_EXECUTOR_AVAILABILITY",{executorId,error:String(error?.message||error)});
    }
    return freeze("executor",executorId,r.executorName||"Independent executor",available,situation);
  }

  if(driverId){
    const available=a.driverAvailable===null||a.driverAvailable===undefined?null:Boolean(a.driverAvailable);
    return freeze("driver",driverId,r.driverName||"Driver",available,null);
  }

  return Object.freeze({actorType:null,actorId:null,actorName:null,state:"NOT_ASSIGNED",available:false,known:true,situation:null});
}
function freeze(actorType,actorId,actorName,available,situation){
  return Object.freeze({
    actorType,actorId,actorName:String(actorName||actorType),
    state:available===true?"AVAILABLE":available===false?"UNAVAILABLE":"UNKNOWN",
    available,known:available!==null,situation:situation||null
  });
}
