/* ON Mission 10.17.3-H1 — Object → Context Contract
 * Presentation-only context around the exact object selected by Intent.
 */
const text=v=>String(v??'').trim(); const num=v=>Number(v||0)||0; const first=(...v)=>v.map(text).find(Boolean)||'';
const requestRows=d=>[...(d?.requests?.pending||[]),...(d?.requests?.items||[]),...(d?.operation?.collaboration?.pendingRequests||[])];
const missionRows=d=>Array.isArray(d?.intelligence?.signals)?d.intelligence.signals:[];
const opportunityRows=d=>[...(d?.marketplace?.opportunities||[]),...(d?.marketplace?.items||[])];
function requestFor(d,target){const id=num(target?.requestId);return requestRows(d).find(x=>num(x?.id||x?.requestId||x?.request_id)===id)||null;}
function missionFor(d,target){const id=num(target?.missionId);return missionRows(d).find(x=>num(x?.missionId||x?.id)===id)||null;}
function opportunityFor(d,target){const id=num(target?.opportunityId);return opportunityRows(d).find(x=>num(x?.id||x?.opportunityId||x?.opportunity_id)===id)||null;}
export function buildIntentObjectContext(data={},objectContract={}){
 if(!objectContract?.visible||!objectContract?.object)return Object.freeze({version:'10.17.3-H1',visible:false,object:null,context:null});
 const intent=text(objectContract.intent).toLowerCase(); let context; let target={...(objectContract.target||{})};
 if(objectContract.object==='Request'){
  const request=requestFor(data,target);
  context={headline:first(request?.reference,request?.title,request?.missionReference,request?.mission_reference,target.requestId?`Request ${target.requestId}`:'Incoming request'),detail:first(request?.partnerName,request?.partner_name,request?.companyName,request?.company_name,'A request is waiting for review.'),supporting:first(request?.description,request?.detail,request?.reason,'Review the request and continue with the available action.')};
 } else if(objectContract.object==='Mission'){
  const m=missionFor(data,target)||((data?.intelligence?.focus && num(data.intelligence.focus.missionId)===num(target.missionId))?data.intelligence.focus:{});
  context={headline:first(m?.reference,m?.missionReference,m?.title,target.missionId?`Mission ${target.missionId}`:'Current mission'),detail:first(m?.situation?.headline,m?.reason,m?.status,intent==='act'?'This mission needs your attention.':'This mission is ready to continue.'),supporting:first(m?.situation?.detail,m?.nextAction?.label,intent==='act'?'Open the mission to see the current action.':'Continue from the current mission state.')};
 } else if(objectContract.object==='Opportunity'){
  const o=opportunityFor(data,target)||{};
  context={headline:first(o?.reference,o?.title,target.opportunityId?`Opportunity ${target.opportunityId}`:'Available work'),detail:first(o?.route,o?.summary,'An execution opportunity is available.'),supporting:first(o?.pickup,o?.pickupLocation,o?.location,'Review the opportunity before choosing the next action.')};
 } else if(objectContract.object==='People'){
  context={headline:'People',detail:'Find the person or partner you need.',supporting:'Search the existing People workspace.'};
 } else context={headline:objectContract.object,detail:'Open the relevant workspace to continue.',supporting:''};
 return Object.freeze({version:'10.17.3-H1',visible:true,intent,navigation:objectContract.navigation,scope:objectContract.scope,object:objectContract.object,action:objectContract.action,target:Object.freeze(target),context:Object.freeze(context),safety:Object.freeze({readOnly:true,createsTruth:false,createsAuthorization:false,createsAction:false,executesAction:false,changesResponsibility:false,changesCustody:false})});
}
