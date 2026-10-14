import {RELEASE_VERSION} from './release.js';
/** ON Mission 10.71.4 — User-facing canonical vocabulary. */
export const CANONICAL_VOCABULARY_VERSION=RELEASE_VERSION;
export const PLATFORM_TERMS=Object.freeze({people:"People",executor:"Executor",object:"Object",resource:"Resource",mission:"Mission",organization:"Organization",logistics:"Logistics"});
export const LEGACY_STORAGE_TERMS=Object.freeze({executorTable:"drivers",executorIdColumn:"driver_id",executorApiNamespace:"/api/drivers"});
export const LEGACY_USER_TERMS=Object.freeze({cargo:"Cargo"});
export function canonicalObjectContext(type){
  const normalized=String(type||"").toLowerCase();
  if(normalized==="cargo") return {type:"generic_object",label:"Object",capability:"logistics",capabilityLabel:"Logistics",legacyType:"cargo"};
  return {type:"generic_object",label:"Object",capability:"object",capabilityLabel:"Object"};
}
