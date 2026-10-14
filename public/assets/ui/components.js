/* ON Mission 10.30.56 — Canonical UI Components.
 * Presentation only. No truth, lifecycle, liveness, authorization or mutation authority.
 */
import {MISSION_STATUS_FLOW,canonicalMissionStatus,lifecycleDefinition} from "../js/core/lifecycle-registry.js";
import {MISSION_LIVENESS_STATES,canonicalLivenessState} from "../js/core/liveness-registry.js";

export const CANONICAL_UI_VERSION="1.1";
export const LIFECYCLE_LABELS=Object.freeze({Pending:"Pending",Arrived:"Arrived",PickedUp:"Picked up",InTransit:"In transit",Delivered:"Delivered",Completed:"Completed",Cancelled:"Cancelled"});
export const LIVENESS_LABELS=Object.freeze({ACTIONABLE:"Action needed",WAITING:"Waiting",ESCALATED:"Needs review",BREACH:"Needs attention",TERMINAL:"Complete"});
export const ACTION_LABELS=Object.freeze({assign_driver:"Assign driver",change_driver:"Change driver",confirm_arrival:"Confirm arrival",confirm_pickup:"Confirm pickup",start_transit:"Start transit",confirm_delivery:"Confirm delivery",complete_mission:"Complete mission",reclaim_execution:"Take back",cancel_mission:"Cancel mission",delete_mission:"Delete mission"});

export function lifecycleModel(value){const status=canonicalMissionStatus(value);const def=lifecycleDefinition(status);return {status,stage:def?.stage||null,terminal:Boolean(def?.terminal),physicalCustody:Boolean(def?.physicalCustody),next:def?.allowedSuccessors?.[0]||null};}
export function livenessModel(value){const state=canonicalLivenessState(value)||"BREACH";return {state,label:LIVENESS_LABELS[state]||state,terminal:state==="TERMINAL",requiresAttention:["ESCALATED","BREACH"].includes(state),waiting:state==="WAITING"};}
export function lifecycleStrip(value){const model=lifecycleModel(value);const current=MISSION_STATUS_FLOW.indexOf(model.status);return MISSION_STATUS_FLOW.map((status,index)=>({status,label:LIFECYCLE_LABELS[status]||status,done:model.status==="Completed"||index<current,active:index===current}));}
export function actionLabel(code,fallback="Action"){const key=String(code||"").trim().toLowerCase();return ACTION_LABELS[key]||fallback;}
export function statusBadge(value){const m=lifecycleModel(value);return `<span class="cui-status cui-status-${m.status.toLowerCase()}" data-status="${escapeHtml(m.status)}">${escapeHtml(LIFECYCLE_LABELS[m.status]||m.status)}</span>`;}
export function livenessBadge(value){const m=livenessModel(value);return `<span class="cui-liveness cui-liveness-${m.state.toLowerCase()}" data-liveness="${m.state}">${escapeHtml(m.label)}</span>`;}
export function lifecycleComponent(value){const model=lifecycleModel(value);const steps=lifecycleStrip(value);return `<section class="cui-lifecycle" aria-label="Mission lifecycle"><div class="cui-component-head"><span>Lifecycle</span><b>${escapeHtml(model.stage||"Current")}</b></div><div class="cui-lifecycle-track">${steps.map(s=>`<span class="cui-lifecycle-step ${s.done?"done":""} ${s.active?"active":""}"><i aria-hidden="true"></i><b>${escapeHtml(s.label)}</b></span>`).join("")}</div>${model.next?`<small>Next: ${escapeHtml(LIFECYCLE_LABELS[model.next]||model.next)}</small>`:""}</section>`;}
export function executionComponent({liveness,status,responsibility,readiness,action,inventory}={}){const lm=livenessModel(liveness);const sm=lifecycleModel(status);return `<section class="cui-execution"><div class="cui-execution-head"><div><span>Execution</span><h3>${escapeHtml(action?.label||"Current work")}</h3></div>${livenessBadge(lm.state)}</div><div class="cui-execution-grid"><div><span>Lifecycle</span><b>${escapeHtml(LIFECYCLE_LABELS[sm.status]||sm.status)}</b></div><div><span>Liveness</span><b>${escapeHtml(lm.label)}</b></div><div><span>Responsible</span><b>${escapeHtml(responsibility||"Not established")}</b></div><div><span>Readiness</span><b>${escapeHtml(readiness||"Unknown")}</b></div></div><div class="cui-inventory"><span>Available work</span><b>${Number(inventory?.available||0)}</b><span>Registered</span><b>${Number(inventory?.registered||0)}</b><span>Routes</span><b>${Number(inventory?.routed||0)}</b></div></section>`;}
export function actionButton(action,{primary=false,disabled=false}={}){const code=String(action?.code||"");return `<button type="button" class="cui-action ${primary?"cui-action-primary":""}" data-cui-action="${escapeHtml(code)}" ${disabled?"disabled":""}><strong>${escapeHtml(action?.label||actionLabel(code))}</strong>${action?.reason||action?.hint?`<small>${escapeHtml(action.reason||action.hint)}</small>`:""}</button>`;}
export function feedbackComponent(message="",error=false){return `<div class="cui-feedback ${error?"error":""}" role="status">${escapeHtml(message)}</div>`;}
export function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}


export function custodyResponsibilityComponent(value={}){
  const c=value||{};
  const holder=c.currentHolder||c.custody?.currentHolder||c.responsibility?.actor||null;
  const target=c.target||c.custody?.target||null;
  const state=String(c.state||c.custody?.state||"UNKNOWN").replaceAll("_"," ");
  return `<section class="cui-custody-responsibility" aria-label="Custody and responsibility"><div class="cui-component-head"><span>Custody & Responsibility</span><b>${escapeHtml(state)}</b></div><div class="cui-execution-grid"><div><span>Current holder</span><b>${escapeHtml(holder?.name||holder?.label||holder?.type||"Not established")}</b></div><div><span>Next receiver</span><b>${escapeHtml(target?.name||target?.label||target?.type||"Not selected")}</b></div><div><span>Responsibility</span><b>${escapeHtml(c.responsibility?.actor?.name||c.responsibility?.actor?.type||"Not established")}</b></div><div><span>Control</span><b>Canonical</b></div></div></section>`;
}


export function buildClientCustodyResponsibilityState(m,{role="",owned=false}={}){
  const completed=["Completed","Cancelled","Canceled"].includes(String(m?.status||""));
  const shared=Number(m?.shared_access||0)===1;
  const driverId=shared?Number(m?.shared_driver_id||0):Number(m?.driver_id||0);
  const driverName=shared?(m?.shared_driver_name||""):(m?.driver_name||"");
  const executorName=shared?"":String(m?.executor_name||"");
  const marketplace=!shared&&Number(m?.public_enabled||0)===1&&!driverId&&!executorName;
  let state="UNASSIGNED"; if(completed)state="TERMINAL"; else if(driverId||executorName)state="RESPONSIBLE"; else if(marketplace)state="DISTRIBUTED";
  return Object.freeze({state,shared,driverId:driverId||null,driverName:driverName||null,executorName:executorName||null,marketplace,requiresAction:role==="admin"&&state==="UNASSIGNED",assignee:driverName||executorName||(marketplace?"ForYou":"Unassigned"),owned});
}


export function custodyComponent(value={}){const c=value||{};const state=String(c.state||c.custody?.state||"UNKNOWN").replaceAll("_"," ");const holder=c.currentHolder||c.custody?.currentHolder;return `<section class="cui-custody" aria-label="Custody"><div class="cui-component-head"><span>Custody</span><b>${escapeHtml(state)}</b></div><div class="cui-execution-grid"><div><span>Current holder</span><b>${escapeHtml(holder?.name||holder?.label||holder?.type||"Not established")}</b></div><div><span>Control</span><b>Canonical</b></div></div></section>`;}
export function responsibilityComponent(value={}){const r=value?.responsibility||value||{};const actor=r.actor||r.current||null;return `<section class="cui-responsibility" aria-label="Responsibility"><div class="cui-component-head"><span>Responsibility</span><b>${escapeHtml(r.state||"Current")}</b></div><div class="cui-execution-grid"><div><span>Responsible</span><b>${escapeHtml(actor?.name||actor?.label||actor?.type||"Not established")}</b></div><div><span>Control</span><b>Canonical</b></div></div></section>`;}
export function agreementComponent(value={}){return `<section class="cui-agreement" aria-label="Agreement"><div class="cui-component-head"><span>Agreement</span><b>${escapeHtml(value?.state||"Unknown")}</b></div><small>${escapeHtml(value?.reason||value?.summary||"")}</small></section>`;}
export function evidenceComponent(value={}){return `<section class="cui-evidence" aria-label="Evidence"><div class="cui-component-head"><span>Evidence</span><b>${escapeHtml(value?.state||"Unknown")}</b></div><small>${escapeHtml(value?.summary||value?.message||"")}</small></section>`;}
export function preconditionComponent(value={}){return `<section class="cui-precondition" aria-label="Preconditions"><div class="cui-component-head"><span>Preconditions</span><b>${escapeHtml(value?.state||"Unknown")}</b></div></section>`;}
export function outcomeComponent(value={}){const state=String(value?.state||value?.outcome||"UNKNOWN").toUpperCase();return `<span class="cui-outcome cui-outcome-${escapeHtml(state.toLowerCase())}" data-outcome="${escapeHtml(state)}">${escapeHtml(value?.label||state)}</span>`;}
export function uncertaintyComponent(value={}){return `<section class="cui-uncertainty" aria-label="Uncertainty"><b>${escapeHtml(value?.label||"Unknown")}</b><small>${escapeHtml(value?.reason||"")}</small></section>`;}
export function attentionComponent(value={}){return `<section class="cui-attention" aria-label="Attention"><div class="cui-component-head"><span>Attention</span><b>${escapeHtml(value?.severity||"Review")}</b></div><div>${escapeHtml(value?.reason||value?.message||"")}</div></section>`;}
export function resolutionComponent(value={}){return `<section class="cui-resolution" aria-label="Resolution"><div class="cui-component-head"><span>Resolution</span><b>${escapeHtml(value?.state||"Open")}</b></div><small>${escapeHtml(value?.nextAction||"")}</small></section>`;}
export function operationalContextComponent(value={}){return `<section class="cui-operational-context" aria-label="Operational context"><div class="cui-component-head"><span>Operational context</span><b>${escapeHtml(value?.state||"Current")}</b></div><div>${escapeHtml(value?.summary||"")}</div></section>`;}
export function nextStepComponent(value={}){return `<section class="cui-next-step" aria-label="Next step"><div class="cui-component-head"><span>Next</span><b>${escapeHtml(value?.label||value?.action?.label||"Review")}</b></div><small>${escapeHtml(value?.reason||"")}</small></section>`;}
export function focusComponent(value={}){return `<section class="cui-focus" aria-label="Focus"><div class="cui-component-head"><span>Focus</span><b>${escapeHtml(value?.label||"Current")}</b></div><small>${escapeHtml(value?.reason||"")}</small></section>`;}
export function signalComponent(value={}){return `<span class="cui-signal" data-signal="${escapeHtml(value?.type||"signal")}">${escapeHtml(value?.label||value?.type||"Signal")}</span>`;}
export function recommendationComponent(value={}){return `<section class="cui-recommendation" aria-label="Recommendation"><b>${escapeHtml(value?.label||"Recommendation")}</b><small>${escapeHtml(value?.reason||"")}</small></section>`;}
export function priorityComponent(value={}){return `<span class="cui-priority" data-priority="${escapeHtml(value?.level||"normal")}">${escapeHtml(value?.label||value?.level||"Normal")}</span>`;}
export function dataStateComponent(value={}){return `<section class="cui-data-state" aria-label="Data state"><b>${escapeHtml(value?.state||"Current")}</b><small>${escapeHtml(value?.message||"")}</small></section>`;}
export function projectionHealthComponent(value={}){return `<span class="cui-projection-health" data-health="${escapeHtml(value?.state||"UNKNOWN")}">${escapeHtml(value?.label||value?.state||"Unknown")}</span>`;}
export function dataFreshnessComponent(value={}){return `<span class="cui-data-freshness">${escapeHtml(value?.label||value?.age||"Current")}</span>`;}
export function loadingComponent(label="Loading"){return `<div class="cui-loading" role="status">${escapeHtml(label)}</div>`;}
export function errorComponent(message="Something went wrong"){return `<div class="cui-error" role="alert">${escapeHtml(message)}</div>`;}
export function unavailableComponent(message="Temporarily unavailable"){return `<div class="cui-unavailable" role="status">${escapeHtml(message)}</div>`;}
export function permissionDeniedComponent(message="You do not have permission for this action"){return `<div class="cui-denied" role="status">${escapeHtml(message)}</div>`;}
export function notFoundComponent(message="Not found"){return `<div class="cui-not-found" role="status">${escapeHtml(message)}</div>`;}

export function executorComponent(value={}){const a=value?.actor||value?.executor||null;return `<section class="cui-executor" aria-label="Executor"><div class="cui-component-head"><span>Executor</span><b>${escapeHtml(value?.state||"Current")}</b></div><div>${escapeHtml(a?.name||a?.label||a?.type||value?.label||"Not established")}</div></section>`;}
export function custodyTransferComponent(value={}){return `<section class="cui-custody-transfer" aria-label="Custody transfer"><div class="cui-component-head"><span>Transfer</span><b>${escapeHtml(value?.state||"Not started")}</b></div><small>${escapeHtml(value?.nextStep||value?.reason||"")}</small></section>`;}
export function identityComponent(value={}){return `<span class="cui-identity">${escapeHtml(value?.name||value?.label||"Identity")}</span>`;}
export function tenantBoundaryComponent(value={}){return `<span class="cui-tenant-boundary" data-tenant="${escapeHtml(value?.tenantId||"")}">${escapeHtml(value?.label||"Tenant boundary")}</span>`;}
export function relationshipComponent(value={}){return `<section class="cui-relationship" aria-label="Relationship"><div class="cui-component-head"><span>Relationship</span><b>${escapeHtml(value?.state||"Unknown")}</b></div><small>${escapeHtml(value?.label||value?.reason||"")}</small></section>`;}
export function capabilityComponent(value={}){return `<span class="cui-capability">${escapeHtml(value?.label||value?.name||"Capability")}</span>`;}
export function permissionStateComponent(value={}){return `<span class="cui-permission" data-permitted="${Boolean(value?.allowed||value?.permitted)}">${escapeHtml(value?.label||(value?.allowed||value?.permitted?"Allowed":"Not allowed"))}</span>`;}
export function evidenceStatusComponent(value={}){return `<span class="cui-evidence-status" data-state="${escapeHtml(value?.state||"UNKNOWN")}">${escapeHtml(value?.label||value?.state||"Unknown")}</span>`;}
export function requirementComponent(value={}){return `<section class="cui-requirement" aria-label="Requirement"><div class="cui-component-head"><span>Requirement</span><b>${escapeHtml(value?.state||"Unknown")}</b></div><small>${escapeHtml(value?.label||value?.question||"")}</small></section>`;}
export function degradedStateComponent(value={}){return `<div class="cui-degraded" role="status"><b>${escapeHtml(value?.label||"Degraded")}</b><small>${escapeHtml(value?.reason||"")}</small></div>`;}
export function waitingComponent(value={}){return `<div class="cui-waiting" role="status"><b>Waiting</b><small>${escapeHtml(value?.reason||value?.actor||"")}</small></div>`;}
export function blockedComponent(value={}){return `<div class="cui-blocked" role="status"><b>Blocked</b><small>${escapeHtml(value?.reason||value?.message||"")}</small></div>`;}
export function staleStateComponent(value={}){return `<div class="cui-stale" role="status"><b>Refresh required</b><small>${escapeHtml(value?.reason||"The current state changed")}</small></div>`;}
export function severityComponent(value={}){return `<span class="cui-severity">${escapeHtml(value?.label||value?.severity||"Normal")}</span>`;}
export function attentionReasonComponent(value={}){return `<span class="cui-attention-reason">${escapeHtml(value?.label||value?.reason||"Attention required")}</span>`;}
export function operationalSummaryComponent(value={}){return `<section class="cui-operational-summary" aria-label="Operational summary"><div class="cui-component-head"><span>Operational summary</span><b>${escapeHtml(value?.label||"Current")}</b></div><small>${escapeHtml(value?.summary||"")}</small></section>`;}
export function emptyStateComponent(message="Nothing to show"){return `<div class="cui-empty" role="status">${escapeHtml(message)}</div>`;}
