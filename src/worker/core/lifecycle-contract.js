/**
 * ON Mission — Generic Lifecycle Contract primitives.
 * The Canonical Core is lifecycle-agnostic. Product/sector contracts provide
 * concrete states and transitions; this module only defines generic semantics.
 */
export function normalizeLifecycleCode(value){
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]+/g,"_");
}
export function definitionState(definition,stateCode){
  const code=normalizeLifecycleCode(stateCode);
  return (definition?.states||[]).find(s=>normalizeLifecycleCode(s.stateCode)===code)||null;
}
export function definitionTransition(definition,fromState,toState){
  const from=normalizeLifecycleCode(fromState),to=normalizeLifecycleCode(toState);
  return (definition?.transitions||[]).find(t=>normalizeLifecycleCode(t.fromStateCode)===from&&normalizeLifecycleCode(t.toStateCode)===to)||null;
}
export function definitionSuccessors(definition,stateCode){
  const from=normalizeLifecycleCode(stateCode);
  return Object.freeze((definition?.transitions||[]).filter(t=>normalizeLifecycleCode(t.fromStateCode)===from).map(t=>t.toStateCode));
}
export function isDefinitionTerminal(definition,stateCode){
  const code=normalizeLifecycleCode(stateCode);
  return (definition?.terminalStates||[]).map(normalizeLifecycleCode).includes(code) ||
    definitionState(definition,code)?.terminal===true;
}
export function assertDefinitionTransition(definition,fromState,toState){
  const transition=definitionTransition(definition,fromState,toState);
  if(!transition){
    const e=new Error(`Lifecycle transition ${String(fromState)} → ${String(toState)} is not allowed`);
    e.status=409;e.code="LIFECYCLE_TRANSITION_NOT_ALLOWED";throw e;
  }
  return transition;
}
export function nextDefinitionState(definition,stateCode){
  return definitionSuccessors(definition,stateCode)[0]||null;
}
