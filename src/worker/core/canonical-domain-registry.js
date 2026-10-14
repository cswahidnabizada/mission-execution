import {RELEASE_VERSION} from './release.js';
/** ON Mission 10.37.2 — Universal domain registry. Definitions only. */
export const CANONICAL_DOMAIN_VERSION=RELEASE_VERSION;
export const CANONICAL_DOMAINS=Object.freeze({
  mission:{layer:"platform",label:"Mission"},
  organization:{layer:"platform",label:"Organization"},
  people:{layer:"platform",label:"People"},
  object:{layer:"platform",label:"Object"},
  resource:{layer:"platform",label:"Resource"},
  relationship:{layer:"platform",label:"Relationship"},
  communication:{layer:"platform",label:"Communication"},
  evidence:{layer:"platform",label:"Evidence"},
  policy:{layer:"platform",label:"Policy"},
  capability:{layer:"platform",label:"Capability"},
  logistics:{layer:"domain_extension",label:"Logistics"}
});
export const CANONICAL_PLATFORM_GRAPH=Object.freeze({
  mission:"Mission",organization:"Organization",person:"Person / Executor",object:"Object",resource:"Resource",
  relationship:"Relationship",communication:"Communication",evidence:"Evidence",policy:"Policy",capability:"Capability",
  domainExtensions:Object.freeze({logistics:"Logistics"})
});
export function canonicalDomain(code){return CANONICAL_DOMAINS[String(code||"")]||null;}
