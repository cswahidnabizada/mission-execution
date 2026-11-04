/* ON Mission 16.98.0 — concise Super Admin area taxonomy.
 * Navigation is a human-facing index only; workspace/domain authorities remain canonical.
 */
export const CONTROL_PLANE_AREAS = Object.freeze([
  {key:'command',label:'Command',description:'Platform situation, exceptions, approvals and next actions.',action:'overview',keywords:['home','command','status','health','next action']},
  {key:'markets',label:'Markets',description:'One workspace for market creation, configuration, relationships, evidence, certification, release, activation and operations.',action:'product-publisher',keywords:['market','germany','country','sector','launch','release','readiness','activation','customers','onboarding']},
  {key:'platform',label:'Platform',description:'Reusable resources, product identity and shared experience capabilities.',action:'resource-management',keywords:['resource','data','catalog','identity','experience','layout','simulation']},
  {key:'customers',label:'Customers & Access',description:'Organizations, users, permissions, subscriptions, billing and missions.',action:'companies',keywords:['tenant','customer','organization','user','role','mission','billing','subscription']},
  {key:'ai',label:'AI & Integrations',description:'AI, agents, external providers, connections and infrastructure.',action:'agentic-control',keywords:['ai','openai','chatgpt','agent','robot','device','provider','integration','sap','microsoft','aws','azure','database','connection']},
  {key:'security',label:'Security & Recovery',description:'Privacy, residency, policies, audit, continuity and safe recovery.',action:'security',keywords:['security','privacy','consent','residency','policy','audit','backup','recovery']}
]);

export function searchControlPlaneAreas(query) {
  const q=String(query||'').trim().toLocaleLowerCase();
  if(!q)return [...CONTROL_PLANE_AREAS];
  return CONTROL_PLANE_AREAS.filter(area=>[area.label,area.description,...area.keywords].some(value=>String(value).toLocaleLowerCase().includes(q)));
}

export function validateControlPlaneModel(workspaceKeys) {
  const keys=new Set(['overview',...(workspaceKeys||[])]);
  const errors=[],areaKeys=new Set();
  for(const area of CONTROL_PLANE_AREAS){
    if(areaKeys.has(area.key))errors.push(`duplicate area: ${area.key}`);
    areaKeys.add(area.key);
    if(!keys.has(area.action))errors.push(`unknown canonical workspace: ${area.action}`);
  }
  return {valid:errors.length===0,errors,areaCount:CONTROL_PLANE_AREAS.length};
}
