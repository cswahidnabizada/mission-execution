import {api} from '../core/api.js';

const bounded=v=>Math.min(Math.max(Number(v)||20,1),50);

export async function loadExecutorWorkContext({role='executor'}={}){
  const primary=role==='driver'?'/api/driver/me/operational':'/api/executor/me/operational';
  const invitation=api('/api/network/invitations?limit=20',{cache:'no-store'});
  const [overviewResult,invitationResult]=await Promise.allSettled([api(primary,{cache:'no-store'}),invitation]);
  if(overviewResult.status!=='fulfilled')throw overviewResult.reason;
  return {
    overview:overviewResult.value?.overview||{},
    invitations:invitationResult.status==='fulfilled'?(invitationResult.value?.invitations||[]):[],
    invitationCount:invitationResult.status==='fulfilled'?(invitationResult.value?.invitations||[]).filter(x=>String(x.status||'Pending').toLowerCase()==='pending').length:0,
    degraded:invitationResult.status!=='fulfilled'
  };
}

export async function loadCompanyOperationsContext({includeNetwork=false}={}){
  const reads=[api(`/api/organization/people?limit=${bounded(50)}&offset=0`,{cache:'no-store'})];
  if(includeNetwork){
    reads.push(api('/api/network/summary',{cache:'no-store'}),api('/api/network/invitations?limit=20',{cache:'no-store'}));
  }
  const settled=await Promise.allSettled(reads);
  const people=settled[0]?.status==='fulfilled'?(settled[0].value?.people||settled[0].value?.items||[]):[];
  const summary=settled[1]?.status==='fulfilled'?(settled[1].value?.summary||{}):{};
  const invitations=settled[2]?.status==='fulfilled'?(settled[2].value?.invitations||[]):[];
  return {people,summary,invitations,degraded:settled.some(x=>x.status==='rejected')};
}
