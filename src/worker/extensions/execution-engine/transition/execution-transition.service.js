import {transitionForIntent,validateExecutionTransition} from "./execution-transition.contract.js";

export function describeExecutionTransition({execution,intent,target={}}={}){
  const transition=transitionForIntent({execution,intent,target});
  if(!transition)return Object.freeze({transition:null,problems:["unsupported_intent"]});
  return Object.freeze({transition,problems:Object.freeze(validateExecutionTransition(transition))});
}
