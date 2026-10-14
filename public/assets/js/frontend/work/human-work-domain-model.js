import {api} from '../core/api.js';
import {normalizeHumanWorkItems} from './human-work-contract.js';

const text=v=>String(v??'').trim();
const num=v=>Number(v||0);
const roleOf=s=>String(s?.session?.role||'').toLowerCase();
const pending=v=>text(v?.status||'').toLowerCase()==='pending';

function invitationItem(x){
  const id=num(x?.id), missionId=num(x?.mission_id||x?.missionId);
  const reference=text(x?.reference||x?.mission_reference||`Mission ${missionId||id}`);
  const label=text(x?.message)||`${x?.owner_company_name||x?.company_name||'Trusted network partner'} shared execution work.`;
  return {
    id:`network-invitation:${id}`,type:'network',state:'attention',situation:'A collaboration decision is waiting.',
    priority:{level:'attention',score:72},responsibility:'collaboration',sourceAuthority:'network',
    reason:{code:'network_invitation_pending',label},
    context:{type:'network',id:String(id),reference,href:`#network?invitation=${id}`,details:{networkInvitationId:id,missionId,recipientType:text(x?.recipient_type||'tenant'),ownerCompany:text(x?.owner_company_name||x?.company_name||'Trusted network partner')}},
    availableAction:{id:'open_network',label:'Review invitation',href:`#network?invitation=${id}`,enabled:true},
    waitingCondition:null,evidence:[{type:'network-invitation',label:'Pending collaboration invitation',href:null}],
    nextState:{code:'Pending',label:'Decision required'},status:'Pending',updatedAt:x?.updated_at||x?.created_at||null
  };
}

function trustItem(x){
  const id=num(x?.id);
  return {
    id:`network-trust:${id}`,type:'network',state:'attention',situation:'A trusted relationship needs your decision.',
    priority:{level:'attention',score:68},responsibility:'collaboration',sourceAuthority:'network',
    reason:{code:'trust_request_pending',label:`${text(x?.partner_company_name)||'A partner organization'} requested a trusted relationship.`},
    context:{type:'network',id:String(id),reference:text(x?.partner_company_name)||'Organization relationship',href:`#network?trust=${id}`,details:{relationshipId:id,partnerCompanyId:num(x?.partner_company_id),partnerName:text(x?.partner_company_name)||'Organization'}},
    availableAction:{id:'open_network',label:'Review relationship',href:`#network?trust=${id}`,enabled:true},
    waitingCondition:null,evidence:[{type:'network-trust',label:'Pending trust request',href:null}],
    nextState:{code:'Pending',label:'Decision required'},status:'Pending',updatedAt:x?.updated_at||x?.created_at||null
  };
}

function publicRequestItem(x){
  const id=num(x?.id),missionId=num(x?.mission_id);
  const reference=text(x?.reference||`Mission ${missionId}`), requester=text(x?.requester_company_name||x?.executor_name||x?.requester_name||'Requester');
  return {
    id:`foryou-request:${id}`,type:'request',state:'attention',situation:'A mission access request needs review.',
    priority:{level:'attention',score:76},responsibility:'operations',sourceAuthority:'network',
    reason:{code:'foryou_request_pending',label:`${requester} requested access to ${reference}.`},
    context:{type:'mission',id:String(missionId),reference,href:`#network?request=${id}`,details:{forYouRequestId:id,missionId,requester}},
    availableAction:{id:'open_network',label:'Review request',href:`#network?request=${id}`,enabled:true},
    waitingCondition:null,evidence:[{type:'foryou-request',label:'Pending mission access request',href:null}],
    nextState:{code:'Pending',label:'Decision required'},status:'Pending',updatedAt:x?.updated_at||x?.created_at||null
  };
}

export async function loadHumanDomainWork(s={}){
  const role=roleOf(s);
  const reads=[];
  const sources=[];
  if(['admin','executor'].includes(role)){
    reads.push(api('/api/network/invitations?limit=50',{cache:'no-store'}));
    sources.push('networkInvitations');
  }
  if(role==='admin'){
    reads.push(api('/api/network/tenant-trust?limit=50&offset=0',{cache:'no-store'}));
    sources.push('networkTrust');
    reads.push(api('/api/public/requests?limit=50&offset=0',{cache:'no-store'}));
    sources.push('foryouRequests');
  }
  if(!reads.length)return {items:[],degraded:false,errors:{}};
  const settled=await Promise.allSettled(reads);
  const values={};const errors={};
  settled.forEach((r,i)=>{const key=sources[i];if(r.status==='fulfilled')values[key]=r.value||{};else errors[key]=r.reason;});
  const items=[];
  for(const x of values.networkInvitations?.invitations||[])if(pending(x))items.push(invitationItem(x));
  for(const x of values.networkTrust?.relationships||[])if(pending(x)&&num(x?.requested_by_company_id)!==num(s?.session?.tenantId))items.push(trustItem(x));
  for(const x of values.foryouRequests?.requests||[])if(pending(x))items.push(publicRequestItem(x));
  const normalized=normalizeHumanWorkItems(items).sort((a,b)=>b.priority.score-a.priority.score||Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));
  return {items:normalized,degraded:Object.keys(errors).length>0,errors};
}
