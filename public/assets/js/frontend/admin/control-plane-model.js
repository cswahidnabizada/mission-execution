/* ON Mission 16.10.87 — unified, role-aware Control Plane navigation model.
 * Presentation-only taxonomy. Canonical workspace registry and backend authorities remain owners.
 */
export const CONTROL_PLANE_AREAS = Object.freeze([
  { key:'home', label:'Control Home', description:'Current situation, next actions and approvals.', action:'overview', keywords:['home','command','status','next action'] },
  { key:'data', label:'Data & Resources', description:'Create, find and govern reusable platform data.', action:'resource-management', keywords:['germany','country','sector','language','consent','role','policy','data','resource','catalog'] },
  { key:'ai', label:'AI, Agents & Devices', description:'Configure AI providers, governed agents and device capabilities.', action:'agentic-control', secondary:['providers','simulation-lab'], keywords:['ai','openai','chatgpt','gemini','agent','robot','device','model'] },
  { key:'connections', label:'Connections & Infrastructure', description:'External systems, provider connections and data-plane configuration.', action:'infrastructure-governance', secondary:['providers','residency'], keywords:['connection','sap','microsoft 365','azure','aws','database','integration','api','storage'] },
  { key:'experience', label:'Product & Experience', description:'Screens, onboarding, navigation and user-facing configuration.', action:'product-experience', secondary:['human-platform','layout-studio','product-identity'], keywords:['ui','screen','onboarding','layout','experience','translation','language'] },
  { key:'launch', label:'Market & Product Launch', description:'Compose, validate, approve, publish and verify a market.', action:'product-publisher', secondary:['launch-center','product-verification','certification'], keywords:['market','launch','publish','release','country','product'] },
  { key:'operations', label:'Tenants, Users & Operations', description:'Customer tenants, access, subscriptions and mission operations.', action:'companies', secondary:['roles','subscriptions','missions','notifications'], keywords:['tenant','user','executor','mission','billing','subscription','access'] },
  { key:'governance', label:'System, Security & Governance', description:'Health, audit, certification, policy and controlled recovery.', action:'system-health', secondary:['security','audit','backup-recovery','recovery-reconciliation','platform-results'], keywords:['system','security','audit','health','recovery','backup','certification','developer'] }
]);

export function searchControlPlaneAreas(query) {
  const q=String(query||'').trim().toLocaleLowerCase();
  if(!q)return [...CONTROL_PLANE_AREAS];
  return CONTROL_PLANE_AREAS.filter(area=>[area.label,area.description,...area.keywords].some(value=>String(value).toLocaleLowerCase().includes(q)));
}

export function validateControlPlaneModel(workspaceKeys) {
  const keys=new Set(['overview',...(workspaceKeys||[])]);
  const errors=[];
  const areaKeys=new Set();
  for(const area of CONTROL_PLANE_AREAS){
    if(areaKeys.has(area.key))errors.push(`duplicate area: ${area.key}`);
    areaKeys.add(area.key);
    if(!keys.has(area.action))errors.push(`unknown canonical workspace: ${area.action}`);
    for(const key of area.secondary||[])if(!keys.has(key))errors.push(`unknown canonical workspace: ${key}`);
  }
  return {valid:errors.length===0,errors,areaCount:CONTROL_PLANE_AREAS.length};
}
