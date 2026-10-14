import {RELEASE_VERSION} from "/assets/js/core/release.js";
/* ON Mission 10.18.7 — Complete Adaptive Action Workspace
 * Presentation/continuity boundary only. Selects/validates the completeness of an
 * embedded action workspace while preserving existing secured action authority.
 */
export const ADAPTIVE_ACTION_WORKSPACE_VERSION=RELEASE_VERSION;

const ACTION_SELECTORS=Object.freeze([
  "[data-ops-action]",
  "[data-ops-intelligence-action]",
  "[data-transfer-action]",
  "[data-transfer-unified-action]",
  "[data-transfer-start]",
  "[data-direction-submit]",
  "[data-responsibility-mode]",
  "[data-intent-dashboard-action-workspace]"
]);

const READ_ONLY_KINDS=new Set(["history","archiveReport","cancelReport","peopleProfile","partnerProfile","partnerReports","peopleReports"]);

export function classifyAdaptiveActionWorkspace({actionType="mission",contextKind="missionWorkspace",host=null}={}){
  const type=String(actionType||"mission").toLowerCase();
  const kind=String(contextKind||"");
  const actionRequired=!READ_ONLY_KINDS.has(kind) && !["history","profile","report"].includes(type);
  const controls=host ? ACTION_SELECTORS.some(selector=>host.querySelector(selector)) : false;
  return Object.freeze({version:ADAPTIVE_ACTION_WORKSPACE_VERSION,actionRequired,hasExecutableSurface:controls,complete:!actionRequired||controls,mode:actionRequired?(controls?"EXECUTABLE":"UNAVAILABLE"):"READ_ONLY",readOnly:!actionRequired,preservesExistingAuthority:true,createsAuthorization:false,executesAction:false});
}

export function workspaceUnavailableMarkup(reason="The current secured action is not available for this role or state."){
  const safe=String(reason).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  return `<div class="ops-runtime-error adaptive-action-workspace-unavailable"><strong>Action is not currently executable</strong><span>${safe}</span><small>The current operational truth remains authoritative. Refresh to re-evaluate the valid action.</small><button type="button" data-embedded-workspace-refresh>REFRESH</button></div>`;
}

export function ensureAdaptiveActionWorkspace({host,actionType,contextKind}={}){
  if(!host)return {complete:false,mode:"UNAVAILABLE"};
  const result=classifyAdaptiveActionWorkspace({actionType,contextKind,host});
  host.dataset.actionWorkspaceMode=result.mode.toLowerCase();
  host.dataset.actionWorkspaceComplete=String(result.complete);
  if(!result.complete){
    host.innerHTML=`<div class="ops-embedded-workspace-frame">${workspaceUnavailableMarkup("No executable control was exposed by the existing secured workspace.")}</div>`;
  }
  return result;
}
