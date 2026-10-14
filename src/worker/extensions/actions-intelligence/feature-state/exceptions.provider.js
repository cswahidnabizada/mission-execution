export function exceptionsState(exceptions=[],session={},access={}){
  const open=(exceptions||[]).filter(x=>String(x.status||"")==="open");
  const order={critical:4,high:3,medium:2,low:1};
  const highest=[...open].sort((a,b)=>(order[String(b.severity||"medium")]||0)-(order[String(a.severity||"medium")]||0))[0]||null;
  const primary=highest||open[0]||null;
  return Object.freeze({
    feature:"exceptions",
    open:open.length>0,
    count:open.length,
    resolvable:Boolean(primary&&viewerCanResolve(session,access,primary)),
    highestSeverity:highest?.severity||null,
    primaryExceptionId:Number(primary?.id||0)||null
  });
}

function viewerCanResolve(session,access,exception){
  if(session.role==="admin")return access.accessKind==="owner";
  if(String(exception.severity||"")==="critical")return false;
  if(session.role==="driver")return exception.created_by_role==="driver"&&Number(exception.driver_id||0)===Number(session.driverId||0);
  if(session.role==="executor")return exception.created_by_role==="executor"&&Number(exception.executor_id||0)===Number(session.executorId||0);
  return false;
}
