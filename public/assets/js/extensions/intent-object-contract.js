/* ON Mission 10.17.2-H1 — Intent → Object Contract
 * Presentation-only bridge to the most relevant existing object.
 */
const text = v => String(v ?? '').trim();
const num = v => Number(v || 0) || 0;
const baseSafety = Object.freeze({ readOnly:true, createsTruth:false, createsAuthorization:false, createsAction:false, executesAction:false, changesResponsibility:false, changesCustody:false });
const OBJECTS = Object.freeze({
  intake:Object.freeze({ object:'Request', scope:'Requests', navigation:'operations', action:'Review' }),
  operate:Object.freeze({ object:'Mission', scope:'Current', navigation:'operations', action:'Continue' }),
  act:Object.freeze({ object:'Mission', scope:'Attention', navigation:'operations', action:'Open' }),
  find:Object.freeze({ object:'People', scope:'People', navigation:'operations', action:'Find' }),
  marketplace:Object.freeze({ object:'Opportunity', scope:'Marketplace', navigation:'marketplace', action:'Review' })
});
function rows(data={}) { return [...(data?.requests?.pending||[]),...(data?.operation?.collaboration?.pendingRequests||[])]; }
function firstPending(data={}) { return rows(data).find(x=>text(x?.status||'pending').toLowerCase()==='pending')||null; }
function firstMission(data={}, intent='') { const focus=data?.intelligence?.focus||{}; const signals=Array.isArray(data?.intelligence?.signals)?data.intelligence.signals:[]; return intent==='act' ? (Number(focus.missionId)||Number(signals[0]?.missionId)||null) : (Number(signals[0]?.missionId)||Number(focus.missionId)||null); }
function firstOpportunity(data={}) { const rows=[...(data?.marketplace?.opportunities||[]),...(data?.marketplace?.items||[])]; return rows.find(x=>x?.id||x?.opportunityId||x?.opportunity_id)||null; }
function findTarget(data={}) {
  const opportunity=firstOpportunity(data); if(opportunity) return { object:'Opportunity', scope:'Marketplace', navigation:'marketplace', action:'Review', target:{ opportunityId:num(opportunity.id||opportunity.opportunityId||opportunity.opportunity_id)||null } };
  const mission=firstMission(data,'operate'); if(mission) return { object:'Mission', scope:'Current', navigation:'operations', action:'Find', target:{ missionId:mission } };
  const request=firstPending(data); if(request) return { object:'Request', scope:'Requests', navigation:'operations', action:'Review', target:{ requestId:num(request.id||request.requestId||request.request_id)||null, missionId:num(request.mission_id||request.missionId)||null } };
  return null;
}
export function buildIntentObject(input={}, intent=null) {
  const key=text(intent||input?.intent).toLowerCase(); const base=OBJECTS[key];
  if(!base) return Object.freeze({version:'10.17.2-H1',visible:false,intent:key||null,object:null,target:null});
  let descriptor={...base,target:null};
  if(key==='intake'){ const r=firstPending(input); if(r) descriptor.target={requestId:num(r.id||r.requestId||r.request_id)||null,missionId:num(r.mission_id||r.missionId)||null}; }
  else if(key==='act'||key==='operate') descriptor.target={missionId:firstMission(input,key)};
  else if(key==='marketplace'){ const o=firstOpportunity(input); if(o) descriptor.target={opportunityId:num(o.id||o.opportunityId||o.opportunity_id)||null}; }
  else if(key==='find'){ const f=findTarget(input); if(f) descriptor={...f}; }
  return Object.freeze({version:'10.17.2-H1',visible:true,intent:key,navigation:descriptor.navigation,scope:descriptor.scope,object:descriptor.object,action:descriptor.action,target:descriptor.target?Object.freeze(descriptor.target):null,safety:baseSafety});
}
export { OBJECTS };
