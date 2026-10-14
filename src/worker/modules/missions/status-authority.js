/**
 * V8.6.8 execution-status authority.
 * Mission ownership is not physical execution authority.
 */
export function assertStatusAuthority({session={},access={},nextStatus}={}){
  const role=String(session?.role||"");
  const kind=String(access?.accessKind||"");
  const mission=access?.mission||{};
  if(role==="driver"||role==="executor")return true;
  if(role!=="admin"||kind!=="owner")throw make("Not authorized for mission status updates",403);

  if(String(nextStatus)!=="Completed"){
    throw make("Execution progress must be confirmed by the assigned driver or executor",403);
  }

  const externalExecutor=Number(mission.assigned_executor_id||mission.owner_assigned_executor_id||0)>0;
  const executingTenant=Number(mission.executing_tenant_id||0)>0;
  if(externalExecutor||executingTenant){
    throw make("Take back completion responsibility before completing this externally executed mission",409);
  }
  return true;
}
function make(message,status){const e=new Error(message);e.status=status;return e;}
