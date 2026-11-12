/* ON Mission 16.98.0 — Super Admin workspace registry.
 * Six concise human-facing areas; all market work routes to one Market Operations workspace.
 * Navigation is not a domain authority. Canonical services retain ownership of truth.
 */
// Historical certification markers: 'Human Platform Control Plane' and key:'experience' is retained as a compatibility token; Human Platform now lives under GOVERN.
// Historical certification markers: label:'SECURE' and label:'PLATFORM' are retained as a compatibility token only; security is now a governed cross-cutting workspace, and runtime health is a COMMAND workspace, not separate primary categories.
export const ADMIN_WORKSPACE_GROUPS=Object.freeze([
  {key:'command',label:'COMMAND',description:'See the current platform situation, exceptions, approvals and next actions.',items:[
    ['Control Center','overview','Platform situation, priorities and governed next actions.','Platform Command Center','READ','COMMAND'],
    ['Administrative Operations','operations','Track platform-wide administrative operations and evidence.','Platform Administrative Operations','READ','COMMAND'],
    ['Action Matrix','action-matrix','Inspect canonical actions, owners, routes and execution boundaries.','Canonical Action Registry','READ','COMMAND'],
    ['System Health','system-health','Inspect shared runtime, database and platform dependencies.','System Health','READ','COMMAND'],
    ['Platform Results & Certification','platform-results','Inspect cross-platform evidence and certification.','Platform Results & Certification Evidence','READ','COMMAND']
  ]},
  {key:'markets',label:'MARKETS',description:'One workspace for every market: prepare, configure, link, prove, release, activate, onboard, operate and recover.',items:[
    ['Market Operations','product-publisher','The single market workspace. All market configuration, canonical resources, relationships, evidence, certification, release history, activation, customers, execution health and recovery start here.','Canonical Market Factory + Market Operations Authorities','WRITE','MARKET']
  ]},
  {key:'platform',label:'PLATFORM',description:'Manage reusable platform capabilities, experience and canonical resources that are not specific to one market.',items:[
    ['Resource Management','resource-management','Create, inspect and govern reusable canonical platform resources.','Canonical Resource Management','WRITE','PLATFORM'],
    ['Product Identity','product-identity','Govern product identity through versioned, audited publication.','Canonical Product Identity Registry','WRITE','PLATFORM'],
    ['Human Platform','human-platform','Configure and certify shared human experience capabilities.','Human Platform Governance','WRITE','PLATFORM'],
    ['Product Experience','product-experience','Manage shared product experience and demo journeys.','Product Experience Orchestration','WRITE','PLATFORM'],
    ['Layout Studio','layout-studio','Compose and preview shared product layouts.','Canonical Experience Composition','WRITE','PLATFORM'],
    ['Simulation Lab','simulation-lab','Run isolated mission simulations; simulation is never proof of physical execution.','Governed Simulation Records','WRITE','PLATFORM'],
    ['Capabilities & Data','capability-governance','Govern reusable capability contracts, market bindings, Daftar policy, public data publication and lifecycle evidence.','Capability Registry + Market/Data Authorities','WRITE','PLATFORM']
  ]},
  {key:'customers',label:'CUSTOMERS & ACCESS',description:'Manage customer organizations, people, permissions, commercial accounts and their mission activity.',items:[
    ['Organizations','companies','Organization lifecycle, readiness and governed access.','Organization Lifecycle','WRITE','CUSTOMERS'],
    ['People & Access','roles','Roles, access and responsibility.','Authorization / Responsibility','WRITE','CUSTOMERS'],
    ['Subscriptions','subscriptions','Plans, eligibility and subscription state.','Subscription Authority','READ','CUSTOMERS'],
    ['Billing','billing','Billing governance and provider reconciliation.','Billing / Provider Reconciliation','READ','CUSTOMERS'],
    ['Missions','missions','Inspect canonical missions, liveness, exceptions and evidence across tenants.','Mission Authority','READ','CUSTOMERS'],
    ['Communication','notifications','Notification and communication governance.','Notification Governance','WRITE','CUSTOMERS'],
    ['Verification & Trust','verification','Organization and identity verification evidence.','Verification Authority','WRITE','CUSTOMERS']
  ]},
  {key:'ai',label:'AI & INTEGRATIONS',description:'Manage AI, agents, external providers, connections and infrastructure capabilities.',items:[
    ['Agentic Control','agentic-control','Govern agent decisions, autonomy posture and execution boundaries.','Agentic Governance Authority','WRITE','AI & INTEGRATIONS'],
    ['Providers','providers','Govern approved external providers, scopes and integrations.','Provider Governance','WRITE','AI & INTEGRATIONS'],
    ['Infrastructure','infrastructure-governance','Inspect runtime bindings, data planes and infrastructure configuration.','Regional Infrastructure Governance','WRITE','AI & INTEGRATIONS']
  ]},
  {key:'security',label:'SECURITY & RECOVERY',description:'Protect the platform and recover safely from incidents without bypassing canonical authorities.',items:[
    ['Policies','policies','Jurisdiction, retention and platform policies.','Jurisdiction Policy','WRITE','SECURITY'],
    ['Consent & Privacy','consent','Consent policy and privacy controls.','Consent & Privacy Authority','WRITE','SECURITY'],
    ['Privacy Rights','privacy-rights','Administer data-subject rights.','Privacy Administration','WRITE','SECURITY'],
    ['Residency','residency','Data residency and geographic processing rules.','Residency Policy','WRITE','SECURITY'],
    ['Analytics Governance','analytics-governance','Analytics use and governance controls.','Analytics Governance','WRITE','SECURITY'],
    ['Security','security','Security posture, controls and protection boundaries.','Security Controls','READ','SECURITY'],
    ['Global Audit','audit','Platform-wide administrative history and evidence.','Administrative Audit','READ','SECURITY'],
    ['Backup & Recovery','backup-recovery','Continuity, backup and recovery evidence.','Backup / Recovery Governance','WRITE','SECURITY'],
    ['Recovery & Reconciliation','recovery-reconciliation','Resolve interrupted canonical mutations and prove convergence.','Canonical Recovery Authority','WRITE','SECURITY']
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
  'demo-product':'product-experience',
  'product-build':'product-publisher',
  'product-studio':'product-publisher',
  'product-launch':'product-publisher',
  'product-ecosystem':'product-publisher',
  'expansion':'product-publisher',
  'countries':'product-publisher',
  'release-center':'product-publisher',
  'launch-center':'product-publisher',
  'product-health':'product-publisher',
  'product-verification':'product-publisher',
  'certification':'product-publisher',
  'product-dependency-impact':'product-publisher'
});
export function workspaceFor(key){const k=String(key);return ADMIN_WORKSPACE_BY_KEY.get(ADMIN_WORKSPACE_ALIASES[k]||k)||null}
