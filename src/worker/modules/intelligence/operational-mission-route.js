/** ON Mission 10.31.31 — canonical mission navigation boundary. */
export function operationalMissionHref(missionId,{role="admin",context="",view="situation",action=""}={}){
  const id=Number(missionId||0);
  if(!Number.isFinite(id)||id<=0)return role==="admin"||role==="tenant"?"/app#work":"/foryou";
  if(role==="admin"||role==="tenant"){
    const contextMap={assignment:"execution",management:"actions",chat:"actions",attention:"situation",evidence:"evidence",history:"history",tv:"mission-tv",distribution:"actions"};
    const resolvedView=contextMap[String(context||"")]||String(view||"situation");
    const resolvedAction=action||({assignment:"assign_driver",chat:"open_chat"}[String(context||"")]||"");
    const params=new URLSearchParams({mission:String(id),view:resolvedView});
    if(context)params.set("context",context); if(resolvedAction)params.set("action",resolvedAction);
    return `/app#work?${params.toString()}`;
  }
  if(role==="executor"||role==="driver"){
    const params=new URLSearchParams({mission:String(id),view:String(view||"situation")});
    if(action)params.set("action",String(action));
    return `/app#work?${params.toString()}`;
  }
  return "/foryou";
}
