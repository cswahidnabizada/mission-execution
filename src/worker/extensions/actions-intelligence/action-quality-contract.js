/**
 * ON Mission 10.30.38 — Canonical Action Quality & Execution Intelligence.
 *
 * This contract is descriptive and validation-oriented. It never grants authority.
 * Secured services remain the only authority for authorization, truth mutation,
 * custody/responsibility transfer, event emission and final execution.
 */
import {ACTION_REGISTRY, ACTION_COMPATIBILITY_ALIASES, normalizeActionCode} from "./action-registry.js";
import {ACTION_SERVICE_MAP} from "./action-service-map.js";

const REQUIRED_QUALITY_KEYS=[
  "security","isolation","truth","concurrency","idempotency","audit","liveness","failure","execution"
];

export function auditActionQuality({registry=ACTION_REGISTRY,serviceMap=ACTION_SERVICE_MAP}={}){
  const problems=[];
  for(const [code,action] of Object.entries(registry)){
    if(action.id!==code) problems.push(`${code}: stable id mismatch`);
    if(action.canonical!==true) problems.push(`${code}: canonical flag missing`);
    if(action.lifecycle!=="ACTIVE") problems.push(`${code}: lifecycle must be ACTIVE`);
    if(!action.domain) problems.push(`${code}: domain missing`);
    if(!Array.isArray(action.roles)||!action.roles.length) problems.push(`${code}: roles missing`);
    if(!serviceMap[code]) problems.push(`${code}: service map route missing`);
    if(!action.quality) problems.push(`${code}: quality contract missing`);
    else for(const key of REQUIRED_QUALITY_KEYS) if(!action.quality[key]) problems.push(`${code}: quality.${key} missing`);
    if(action.quality?.executionClass!=="READ_ONLY" && !serviceMap[code]) problems.push(`${code}: executable action has no route`);
  }
  for(const code of Object.keys(serviceMap)) if(!registry[code]) problems.push(`${code}: service map entry is not canonical`);
  for(const [alias,target] of Object.entries(ACTION_COMPATIBILITY_ALIASES)){
    if(registry[alias]) problems.push(`${alias}: compatibility alias must not remain canonical`);
    if(!registry[target]) problems.push(`${alias}: compatibility target ${target} missing`);
    if(normalizeActionCode(alias)!==target) problems.push(`${alias}: normalization target mismatch`);
  }
  return problems;
}

export function actionQualitySummary(){
  const entries=Object.entries(ACTION_REGISTRY);
  return Object.freeze({
    canonicalActions:entries.length,
    highConsequence:entries.filter(([,a])=>a.quality?.executionClass==="HIGH_CONSEQUENCE").length,
    mutations:entries.filter(([,a])=>a.quality?.executionClass==="MUTATION").length,
    readOnly:entries.filter(([,a])=>a.quality?.executionClass==="READ_ONLY").length,
    compatibilityAliases:Object.keys(ACTION_COMPATIBILITY_ALIASES).length,
    serviceRoutes:Object.keys(ACTION_SERVICE_MAP).length,
    problems:auditActionQuality()
  });
}
