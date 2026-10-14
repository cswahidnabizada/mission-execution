import {RELEASE_VERSION} from "/assets/js/core/release.js";
/* ON Mission 10.16 — Adaptive Coordination Experience
 * Presentation-only adapter over existing read-only signals.
 * It selects one coordination situation and one valid existing action surface.
 */
import { buildCoordinationSituation } from "./coordination-situation-contract.js";
import { convergeCoordinationCandidates } from "./coordination-convergence.js";

const text=v=>String(v??"").trim();
const num=v=>Number(v||0)||0;
const terminal=new Set(["COMPLETED","COMPLETE","CLOSED","DELIVERED","CANCELLED","CANCELED"]);

function action(id,label,navigation="operations",missionId=null,requestId=null){return {id,label,navigation,missionId:num(missionId)||null,requestId:num(requestId)||null};}
function firstSignal(data){return (data?.intelligence?.signals||[]).find(x=>num(x?.missionId));}
function firstPendingRequest(data){
  const rows=[...(data?.requests?.pending||[]),...(data?.requests?.items||[]),...(data?.operation?.requests||[])];
  return rows.find(x=>text(x?.status||"pending").toLowerCase()==="pending")||null;
}
function firstOpportunity(data){
  return (data?.marketplace?.opportunities||[]).find(x=>String(x?.state||"").toUpperCase()==="ACTIONABLE")||null;
}

export function buildAdaptiveCoordinationExperience(data={}){
  const signals = data?.intelligence?.signals || [];
  const requests = [
    ...(data?.requests?.pending || []),
    ...(data?.requests?.items || []),
    ...(data?.operation?.requests || [])
  ].filter(x => text(x?.status || "pending").toLowerCase() === "pending");
  const overviewRequests = data?.operation?.collaboration?.pendingRequests || [];
  const enrichedRequests = requests.length ? requests : overviewRequests;
  const opportunities = data?.marketplace?.opportunities || [];
  const convergence = convergeCoordinationCandidates({ signals, requests: enrichedRequests, opportunities });
  const selected = convergence.selected;
  let situation = null;

  if(selected?.type === "foryouRequest" || selected?.type === "request") {
    const request = selected.request;
    situation={scope:"requests",objectType:selected.type,action:action("review_request","Review","operations",selected.missionId,selected.requestId),waitingOn:null,reason:"A request is waiting for a decision."};
  } else if(selected?.type === "mission") {
    const signal = selected.signal || {};
    const level=text(signal.level).toUpperCase();
    situation={scope:level==="WAITING"?"attention":"current",objectType:"mission",action:action("open_mission","Open","operations",selected.missionId),waitingOn:text(signal.waitingOn||signal.actor||"")||null,reason:text(signal.reason)||"A mission needs the next valid step."};
  } else if(selected?.type === "opportunity") {
    situation={scope:"marketplace",objectType:"opportunity",action:action("open_marketplace","Review","marketplace"),waitingOn:null,reason:"An execution opportunity is available."};
  }

  if(!situation) {
    const decision = data?.decision || null;
    const level = text(decision?.level).toLowerCase();
    const actionLabel = text(decision?.action?.label);
    if(level && level !== "good" && actionLabel) {
      const module = text(decision?.action?.module).toLowerCase();
      const area = text(decision?.action?.area).toLowerCase();
      const mapping = module === "requests" ? {scope:"requests",objectType:"foryouRequest",action:action("review_request",actionLabel,"operations",null,null),reason:text(decision.detail)||"A request needs a decision."}
        : module === "custody" ? {scope:"attention",objectType:"mission",action:action("open_mission","Open","operations",null,null),reason:text(decision.detail)||"A mission needs attention."}
        : area === "operations" || area === "monitoring" ? {scope:"attention",objectType:"mission",action:action("open_operations",actionLabel,"operations",null,null),reason:text(decision.detail)||"Something needs attention."}
        : area === "overview" ? {scope:"current",objectType:"mission",action:action("open_overview",actionLabel,"overview",null,null),reason:text(decision.detail)||"The current situation needs review."}
        : module === "analytics" ? {scope:"current",objectType:"mission",action:action("open_insights",actionLabel,"insights",null,null),reason:text(decision.detail)||"The current situation needs review."}
        : null;
      if(mapping) {
        situation = mapping;
      }
    }
  }
  if(!situation) return Object.freeze({version:RELEASE_VERSION,available:false,situation:null,convergence});
  const result=buildCoordinationSituation(situation);
  return Object.freeze({version:RELEASE_VERSION,available:true,situation:result,convergence});
}

export { terminal };
