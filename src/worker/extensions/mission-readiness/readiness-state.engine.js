import {routeReadinessState} from "./providers/route-readiness.provider.js";
import {timingReadinessState} from "./providers/timing-readiness.provider.js";
import {accessReadinessState} from "./providers/access-readiness.provider.js";

export function buildReadinessState({mission={},featureState={},conditions={},executionAvailability=null,now=Date.now()}={}){
  const status=String(mission.status||conditions.status||"Pending");
  return Object.freeze({
    missionId:Number(mission.id||conditions.missionId||0)||null,
    status,
    closed:["Completed","Cancelled","Canceled"].includes(status),
    featureState,
    execution:executionAvailability||fallbackExecutionAvailability(featureState,conditions),
    route:routeReadinessState(mission),
    timing:timingReadinessState(mission,now),
    access:accessReadinessState(mission)
  });
}

function fallbackExecutionAvailability(featureState,conditions){
  const a=featureState.assignment||{},r=conditions.responsibility||{};
  const actorType=r.executorId?"executor":(a.driverId||r.driverId||a.assigned&&a.driverAvailable!==undefined)?"driver":null;
  const available=actorType==="driver"?(a.driverAvailable===undefined?null:a.driverAvailable):null;
  return Object.freeze({
    actorType,actorId:Number(r.executorId||a.driverId||r.driverId||0)||null,
    actorName:String(r.executorName||r.driverName||actorType||""),
    state:!actorType?"NOT_ASSIGNED":available===true?"AVAILABLE":available===false?"UNAVAILABLE":"UNKNOWN",
    available,known:available!==null,situation:null
  });
}
