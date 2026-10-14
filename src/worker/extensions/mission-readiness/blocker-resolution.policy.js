import {READINESS_BLOCKERS as B} from "./readiness-policy.engine.js";

export const BLOCKER_RESOLUTION_POLICY=Object.freeze({
  [B.MISSION_DATA]:policy("owner_tenant","edit_mission_data","Mission execution data is incomplete."),
  [B.ASSIGNMENT]:policy("responsible_tenant","assign_driver","The mission has no valid execution assignment."),
  [B.DRIVER_UNAVAILABLE]:policy("responsible_tenant","change_driver","The assigned driver is unavailable."),
  [B.EXECUTOR_UNAVAILABLE]:policy("assigned_executor","review_availability","The assigned independent executor is unavailable."),
  [B.ROUTE]:policy("owner_tenant","edit_mission_data","A required mission address is missing."),
  [B.ACCESS]:policy("owner_tenant","edit_mission_data","The configured site access window is invalid."),
  [B.DELIVERY_PROOF]:policy("execution_actor","capture_delivery_proof","Required delivery proof has not been captured.")
});

export function resolutionPolicy(code){return BLOCKER_RESOLUTION_POLICY[String(code||"")]||null;}
export function validateBlockerResolutionPolicy(){
  const expected=new Set(Object.values(B)),actual=new Set(Object.keys(BLOCKER_RESOLUTION_POLICY)),problems=[];
  for(const code of expected)if(!actual.has(code))problems.push(`missing resolution policy: ${code}`);
  for(const code of actual)if(!expected.has(code))problems.push(`orphan resolution policy: ${code}`);
  for(const [code,p] of Object.entries(BLOCKER_RESOLUTION_POLICY)){
    if(!p.actorStrategy)problems.push(`missing actor strategy: ${code}`);
    if(!p.actionCode)problems.push(`missing action: ${code}`);
    if(!p.reason)problems.push(`missing reason: ${code}`);
  }
  return problems;
}
function policy(actorStrategy,actionCode,reason){return Object.freeze({actorStrategy,actionCode,reason});}
