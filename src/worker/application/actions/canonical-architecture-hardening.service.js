import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.32.12 — Final Architecture Audit / Hardening.
 * Runtime-safe assertions for the final action boundary. No mutation occurs here.
 */
import {allActionDefinitions} from "./action-registry.js";
import {mappedActionCodes} from "./action-service-map.js";

export const FINAL_ARCHITECTURE_HARDENING_VERSION=RELEASE_VERSION;
export function auditCanonicalActionBoundary(){
  const actions=allActionDefinitions();
  const mapped=new Set(mappedActionCodes());
  const missing=actions.filter(a=>!mapped.has(a.code)).map(a=>a.code);
  const duplicateIds=new Set(); const duplicates=[];
  for(const a of actions){if(duplicateIds.has(a.id))duplicates.push(a.id);duplicateIds.add(a.id);}
  return Object.freeze({version:FINAL_ARCHITECTURE_HARDENING_VERSION,pass:missing.length===0&&duplicates.length===0,actions:actions.length,mapped:mapped.size,missing:Object.freeze(missing),duplicateIds:Object.freeze(duplicates),invariants:Object.freeze({singleActionRegistry:true,applicationServiceRequired:true,domainTruthAuthoritative:true,automaticMutationReplay:false,arbitraryExternalTarget:false,autonomousMultiMutation:false})});
}
