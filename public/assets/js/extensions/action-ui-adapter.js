import {executeActionTarget} from "./actions-intelligence.js";

/**
 * Thin UI adapter. It never decides capability or authority.
 * It delegates engine-selected actions into existing page handlers and APIs.
 */
export async function executeMappedAction(action,{handlers={},before=null,after=null,expectedUpdatedAt=null}={}){
  if(!action)return {executed:false,refresh:"none"};
  assertActionFreshness(action,expectedUpdatedAt);
  if(typeof before==="function")await before(action);
  const executed=await executeActionTarget(action,handlers,{expectedUpdatedAt:action.stateToken||expectedUpdatedAt});
  const refresh=action.refresh||action.target?.refresh||"none";
  if(typeof after==="function")await after({action,executed,refresh});
  return {executed,refresh};
}

export function actionSet(contract){
  return new Set((contract?.all||[]).map(a=>a.code));
}

export function hasAction(contract,code){
  return actionSet(contract).has(String(code||""));
}

function assertActionFreshness(action,currentToken){
  const decided=String(action?.stateToken||"");
  const current=String(currentToken||"");
  if(decided&&current&&decided!==current){
    const error=new Error("Mission changed. The latest valid action is now shown.");
    error.code="MISSION_CHANGED";
    throw error;
  }
}
