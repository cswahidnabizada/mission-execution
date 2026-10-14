import {api,jsonOptions} from "../core/api.js";
export async function fetchMissionActions(missionId){const d=await api(`/api/actions-intelligence/missions/${Number(missionId)}`);return d.actions||null;}
export async function executeActionTarget(action,handlers={},options={}){
  if(!action?.target)return false;
  const t=action.target;
  if(action.confirmation&&!action.__workspaceApproved&&!confirm(`Continue with ${action.label}?`))return false;
  if(t.kind==="ui"){
    const fn=handlers[t.intent];if(typeof fn!=="function")throw new Error(`Action ${t.intent} is not available on this screen`);
    await fn(action);return true;
  }
  if(t.kind==="navigate"){location.href=t.href;return true;}
  if(t.kind==="mission_status"){
    // Lifecycle mutations are canonical API mutations, not page-local handlers.
    // The previous runtime required a handler supplied by each workspace, which
    // made valid executor actions fail with “Mission status action is unavailable”.
    // Execute the Action Service Map target directly through the secured runtime.
    const expectedUpdatedAt=action.stateToken||options.expectedUpdatedAt||null;
    const request=jsonOptions(t.method||"POST",t.body||{}, {expectedUpdatedAt});
    await api(t.endpoint,request);
    return true;
  }
  if(t.kind==="api"){
    const expectedUpdatedAt=action.stateToken||options.expectedUpdatedAt||null;
    const request=t.body==null
      ?{method:t.method||"POST",headers:expectedUpdatedAt?{"X-Mission-State-Token":String(expectedUpdatedAt)}:{}}
      :jsonOptions(t.method||"POST",t.body,{expectedUpdatedAt});
    await api(t.endpoint,request);return true;
  }
  return false;
}
