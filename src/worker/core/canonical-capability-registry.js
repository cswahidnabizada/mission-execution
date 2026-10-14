import {RELEASE_VERSION} from './release.js';
/** ON Mission 10.37.2 — Capability boundary. No authorization or mutation. */
export const CANONICAL_CAPABILITY_VERSION=RELEASE_VERSION;
export const CAPABILITY_REGISTRY=Object.freeze({
  identity:{domain:"platform",label:"Identity"},organization:{domain:"platform",label:"Organization"},mission:{domain:"platform",label:"Mission"},
  people:{domain:"platform",label:"People"},object:{domain:"platform",label:"Object"},resource:{domain:"platform",label:"Resource"},continuity:{domain:"platform",label:"Mission Continuity"},
  relationship:{domain:"platform",label:"Relationship"},communication:{domain:"platform",label:"Communication"},evidence:{domain:"platform",label:"Evidence"},
  policy:{domain:"platform",label:"Policy"},capability:{domain:"platform",label:"Capability"},logistics:{domain:"logistics",label:"Logistics"}
});
export function capabilityFor(code){return CAPABILITY_REGISTRY[String(code||"")]||null;}
export function isDomainExtension(code){return capabilityFor(code)?.domain!=="platform";}
