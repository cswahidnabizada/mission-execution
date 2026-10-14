/** ON Mission 10.38.0 — canonical frontend mission navigation boundary. */
export function operationalMissionHref(missionId,{role='admin',context='',view='situation',action=''}={}){
  const id=Number(missionId||0);
  if(!Number.isFinite(id)||id<=0)return '/app/#work';
  const params=new URLSearchParams({mission:String(id)});
  if(view)params.set('view',String(view)); if(context)params.set('context',context); if(action)params.set('action',action);
  return `/app/#work?${params.toString()}`;
}
