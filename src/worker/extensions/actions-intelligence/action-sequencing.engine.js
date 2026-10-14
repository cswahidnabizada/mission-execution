import {unresolvedDependencies} from "./action-dependency.engine.js";
export function sequenceNecessaryAction(capabilityResult,state){
  const allowed=new Map((capabilityResult?.capabilities||[]).map(a=>[a.code,a]));
  const gates=unresolvedDependencies(state);
  for(const gate of gates){
    const action=allowed.get(gate.actionCode);
    if(action)return {state:"action_required",gate:gate.id,action,blockedAfter:gates.filter(g=>g.order>gate.order).map(g=>g.id),reasonCode:`dependency:${gate.id}`};
  }
  if(state?.cancelled)return {state:"cancelled",gate:null,action:null,blockedAfter:[],reasonCode:"mission_cancelled"};
  if(state?.completed)return {state:"complete",gate:null,action:null,blockedAfter:[],reasonCode:"mission_complete"};
  if(state?.terminal)return {state:"terminal",gate:null,action:null,blockedAfter:[],reasonCode:"mission_terminal"};
  return {state:"clear",gate:null,action:null,blockedAfter:[],reasonCode:"no_required_action"};
}
