import {RELEASE_VERSION} from './release.js';
/** ON Mission 10.37.2 — Product readiness registry. Definitions only; runtime remains authoritative. */
export const CANONICAL_PRODUCT_READINESS_VERSION=RELEASE_VERSION;
export const PRODUCT_READINESS_DOMAINS=Object.freeze([
  "organization","onboarding","verification","trust","roles","capabilities","subscription","billing","communication","compliance","operational"
]);
export const ORGANIZATION_LIFECYCLE_STATUSES=Object.freeze([
  "DRAFT","ONBOARDING","PENDING_VERIFICATION","VERIFIED","ACTIVE","RESTRICTED","SUSPENDED","ARCHIVED"
]);
const EDGES=Object.freeze({
  DRAFT:Object.freeze(["ONBOARDING","ARCHIVED"]),
  ONBOARDING:Object.freeze(["PENDING_VERIFICATION","RESTRICTED","ARCHIVED"]),
  PENDING_VERIFICATION:Object.freeze(["VERIFIED","RESTRICTED","SUSPENDED","ARCHIVED"]),
  VERIFIED:Object.freeze(["ACTIVE","RESTRICTED","SUSPENDED","ARCHIVED"]),
  ACTIVE:Object.freeze(["RESTRICTED","SUSPENDED","ARCHIVED"]),
  RESTRICTED:Object.freeze(["ONBOARDING","PENDING_VERIFICATION","VERIFIED","ACTIVE","SUSPENDED","ARCHIVED"]),
  SUSPENDED:Object.freeze(["RESTRICTED","ACTIVE","ARCHIVED"]),
  ARCHIVED:Object.freeze([])
});
export function isOrganizationLifecycleStatus(value){return ORGANIZATION_LIFECYCLE_STATUSES.includes(String(value||"").trim().toUpperCase());}
export function organizationLifecycleSuccessors(status){return EDGES[String(status||"").trim().toUpperCase()]||Object.freeze([]);}
export function canOrganizationLifecycleTransition(from,to){return organizationLifecycleSuccessors(from).includes(String(to||"").trim().toUpperCase());}
export function organizationLifecycleDefinition(status){const s=String(status||"").trim().toUpperCase();return isOrganizationLifecycleStatus(s)?Object.freeze({status:s,terminal:s==="ARCHIVED",allowedSuccessors:organizationLifecycleSuccessors(s)}):null;}
export function productReadinessDomains(){return PRODUCT_READINESS_DOMAINS;}
