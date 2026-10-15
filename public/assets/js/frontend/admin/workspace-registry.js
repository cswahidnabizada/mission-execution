/* ON Mission 11.04.1 — Super Admin Operating System workspace registry.
 * The navigation is a human operating model. It never becomes a domain authority.
 * Eight primary areas: COMMAND → RESOURCES → BUILD → RELEASE → LAUNCH → OPERATE → GOVERN → RECOVER.
 */
// Historical certification markers: 'Human Platform Control Plane' and key:'experience' is retained as a compatibility token; Human Platform now lives under GOVERN.
// Historical certification markers: label:'SECURE' and label:'PLATFORM' are retained as a compatibility token only; security is now a governed cross-cutting workspace, and runtime health is a COMMAND workspace, not separate primary categories.
export const ADMIN_WORKSPACE_GROUPS=Object.freeze([
  {key:'command',label:'COMMAND',description:'Understand the platform, find what needs attention, and invoke the right authority.',items:[
    ['Administrative Operations','operations','Track governed administrative operations and their evidence.','Platform Administrative Operations','READ','COMMAND'],
    ['Action Matrix','action-matrix','See every canonical action, its owner, route and execution boundary.','Canonical Action Registry','READ','COMMAND'],
    ['System Health','system-health','See authoritative runtime and platform health without substituting empty state.','System Health','READ','COMMAND'],
    ['Product Identity Studio','product-identity','Govern product name, short name and tagline through versioned, audited publication.','Canonical Product Identity Registry','WRITE','COMMAND'],
    ['Infrastructure Command Center','infrastructure-governance','Inspect runtime bindings, govern proposed regions, and track the target infrastructure roadmap with evidence.','Regional Infrastructure Governance','WRITE','COMMAND'],
    ['Agentic Control','agentic-control','Audit agent decisions and outcomes, inspect autonomy posture, and safely control agent execution.','Agentic Governance Authority','WRITE','COMMAND']
  ]},
  {key:'resources',label:'RESOURCES',description:'Find, create, inspect, understand, change and govern platform resources from one canonical workspace.',items:[
    ['Resource Management','resource-management','Search resources, add governed resources, inspect mission plans and evaluations, review recent changes, inspect dependencies and manage the selected record.','Canonical Resource Management','WRITE','RESOURCES']
  ]},
  {key:'build',label:'BUILD',description:'Compose governed products from reusable Resources without creating shadow data authorities.',items:[
    ['Market Factory','product-publisher','Intake, validate, reconcile, authorize and publish governed market releases.','Market Release Lifecycle','WRITE','BUILD'],
    ['Product Countries','countries','Inspect deliberate product-market countries created through Resources.','Country Product Foundation','WRITE','BUILD']
  ]},
  {key:'release',label:'RELEASE',description:'Prove, authorize, publish, verify and promote governed versions.',items:[
    ['Release Center','release-center','Unified projection of the governed product release lifecycle.','Product Release Lifecycle','READ','RELEASE'],
    ['Test Lab & Verification','product-verification','Run controlled product scenarios and collect verification evidence.','Product Verification Evidence','WRITE','RELEASE'],
    ['Verification & Trust','verification','Organization and identity verification evidence.','Verification Authority','WRITE','RELEASE'],
    ['Certification','certification','Inspect release proof and platform certification evidence.','Certification Evidence','READ','RELEASE'],
    ['Dependency Impact','product-dependency-impact','Inspect canonical release dependencies and promotion impact.','Product Dependency Impact','READ','RELEASE']
  ]},
  {key:'launch',label:'LAUNCH',description:'Move verified products into live country and sector surfaces.',items:[
    ['Launch Center','launch-center','Launch readiness, distribution and activation projection.','Country Product Launch Authority','WRITE','LAUNCH'],
    ['Product Monitor','product-health','Monitor live product health, blockers and next actions.','Product Monitor','READ','LAUNCH']
  ]},
  {key:'operate',label:'OPERATE',description:'Run organizations, people, subscriptions, billing, missions and communications.',items:[
    ['Organizations','companies','Organization lifecycle, readiness and governed access.','Organization Lifecycle','WRITE','OPERATE'],
    ['People & Access','roles','Roles, access and responsibility.','Authorization / Responsibility','WRITE','OPERATE'],
    ['Subscriptions','subscriptions','Plans, eligibility and subscription state.','Subscription Authority','READ','OPERATE'],
    ['Billing','billing','Billing governance and provider reconciliation.','Billing / Provider Reconciliation','READ','OPERATE'],
    ['Missions','missions','Inspect missions, liveness, exceptions, responsibility and evidence.','Mission Authority','READ','OPERATE'],
    ['Communication','notifications','Notification and communication governance.','Notification Governance','WRITE','OPERATE']
  ]},
  {key:'govern',label:'GOVERN',description:'Protect platform policy, privacy, residency, providers, audit and human experience.',items:[
    ['Human Platform','human-platform','Configure, preview, simulate, test, release and inspect the human experience.','Human Platform Governance','WRITE','GOVERN'],
    ['Product Experience','product-experience','Build a disposable demo, enter the real customer experience, and certify the complete journey without creating a second product.','Product Experience Orchestration · Identity/Tenant/Demo authorities remain canonical','WRITE','GOVERN'],
    ['Policies','policies','Jurisdiction, retention and platform policies.','Jurisdiction Policy','WRITE','GOVERN'],
    ['Consent & Privacy','consent','Consent policy and privacy controls.','Consent & Privacy Authority','WRITE','GOVERN'],
    ['Privacy Rights','privacy-rights','Administer data-subject rights.','Privacy Administration','WRITE','GOVERN'],
    ['Residency','residency','Data residency and geographic processing rules.','Residency Policy','WRITE','GOVERN'],
    ['Providers','providers','Approved external providers and infrastructure governance.','Provider Governance','WRITE','GOVERN'],
    ['Analytics Governance','analytics-governance','Analytics use and governance controls.','Analytics Governance','WRITE','GOVERN'],
    ['Security','security','Security posture, controls and protection boundaries.','Security Controls','READ','GOVERN'],
    ['Global Audit','audit','Platform-wide administrative history and evidence.','Administrative Audit','READ','GOVERN']
  ]},
  {key:'recover',label:'RECOVER',description:'Reconcile interrupted work, quarantine unsafe data and prove continuity.',items:[
    ['Backup & Recovery','backup-recovery','Continuity, backup and recovery evidence.','Backup / Recovery Governance','WRITE','RECOVER'],
    ['Recovery & Reconciliation','recovery-reconciliation','Resolve interrupted canonical mutations and prove convergence.','Canonical Recovery Authority','WRITE','RECOVER']
  ]}
]);

export const ADMIN_WORKSPACES=Object.freeze(ADMIN_WORKSPACE_GROUPS.flatMap(group=>group.items.map(([label,key,description,authority,access,journey])=>({group:group.key,groupLabel:group.label,label,key,description,authority:authority||'Platform Governance',access:access||'READ',journey:journey||group.label}))));
export const ADMIN_WORKSPACE_BY_KEY=new Map(ADMIN_WORKSPACES.map(x=>[x.key,x]));
export const ADMIN_WORKSPACE_KEYS=Object.freeze(ADMIN_WORKSPACES.map(x=>x.key));
export const ADMIN_PRIMARY_SECTION=Object.freeze([['Command Center','overview']]);
export const ADMIN_SUPPORTING_SECTIONS=Object.freeze(ADMIN_WORKSPACES.map(x=>[x.label,x.key]));
export const ADMIN_SECTIONS=Object.freeze([...ADMIN_PRIMARY_SECTION,...ADMIN_SUPPORTING_SECTIONS]);
export const ADMIN_WORKSPACE_ALIASES=Object.freeze({
  'user-experience':'product-experience',
  'demo-product':'product-experience'
});
export function workspaceFor(key){const k=String(key);return ADMIN_WORKSPACE_BY_KEY.get(ADMIN_WORKSPACE_ALIASES[k]||k)||null}
