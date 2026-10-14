import {MISSION_STATUS_FLOW,canonicalMissionStatus} from "./lifecycle-registry.js";
import {api} from "./api.js";
import {formatMissionAddress} from "./mission-presentation.js";
import {formatRelativeTime,formatTime,formatDateTime} from "./dom.js";
import {buildMissionFocus} from "./mission-focus.js";
import {fetchMissionCoordination} from "./mission-coordination.js";
import {operationalMissionHref} from "./operational-mission-route.js";

let root=null,open=false,loading=false,lastItems=[],lastIntelligence=null;
let focusSnapshot={role:null,missions:[],surfaces:{},selectedMissionId:null,operational:null};
let focusCoordination={missionId:null,coordination:null,problems:[],loading:false,loadedAt:0};

boot();

function operatorMissionHref(mission){const id=Number(mission?.id||mission?.missionId||0);if(!id)return "/foryou";const role=String(focusSnapshot?.role||"admin");const publicMission=Number(mission?.public_enabled||0)===1||Boolean(mission?.shared_access||mission?.sharedAccess)||String(mission?.distribution_channel||mission?.distributionChannel||"").toLowerCase()==="foryou";return publicMission&&role==="admin"?`/app#work?mission=${id}`:operationalMissionHref(id,{role});}
function boot(){
  mount();
  loadAttention();
  window.addEventListener("onmission:mission-snapshot",e=>{
    const incoming=e.detail||{};
    focusSnapshot={...focusSnapshot,...incoming,missions:Array.isArray(incoming.missions)?incoming.missions:focusSnapshot.missions,surfaces:incoming.surfaces||focusSnapshot.surfaces||{},operational:incoming.operational||focusSnapshot.operational||null};
    normalizeFocusSelection("snapshot");
    renderMissionFocus();
    const missionId=currentFocusMissionId();if(missionId)refreshFocusCoordination(missionId).catch(()=>{});
  });
  window.addEventListener("onmission:focus-action",e=>{const d=e.detail||{};if(d.code&&d.missionId)openTvAction(d.code,Number(d.missionId),d.requirementId||null);});
  window.addEventListener("onmission:heartbeat",()=>{if(!document.hidden&&!document.querySelector("input:focus,textarea:focus,select:focus"))loadAttention();});
  window.addEventListener("onmission:live-notifications",()=>loadAttention());
  window.setInterval(()=>{if(!document.hidden&&!document.querySelector("input:focus,textarea:focus,select:focus"))loadAttention();},60000);
  bindMobileTvMenus();
  queueMicrotask(()=>window.dispatchEvent(new CustomEvent("onmission:focus-request")));
}

function mount(){
  const link=document.createElement("link");link.rel="stylesheet";link.href="/assets/css/attention.css";document.head.appendChild(link);
  root=document.createElement("section");root.className=`attention-engine ${document.body.classList.contains("bg-slate-950")?"attention-dark":""}`;
  const tenant=document.body.classList.contains("admin-shell");
  root.classList.toggle("attention-tenant",tenant);
  if(tenant){open=true;root.classList.add("open");}
  root.innerHTML=`
    <button class="attention-head" type="button" aria-expanded="${tenant?"true":"false"}">
      <span class="attention-mark">◉</span>
      <span class="attention-title"><small>MISSION TV</small><b>Live mission events</b></span>
      <span class="attention-chevron">⌄</span>
    </button>
    <div id="attFocus" class="mission-focus-slot"></div>
    <div id="attIntelligence" class="intelligence-output"><div class="attention-topline">Analyzing authorized missions…</div></div>
    <div id="attList" class="attention-list ${tenant?"":"hidden"}"></div>`;
  root.querySelector(".attention-head").onclick=()=>{open=!open;root.classList.toggle("open",open);root.querySelector("#attList").classList.toggle("hidden",!open);root.querySelector(".attention-head").setAttribute("aria-expanded",String(open));if(open)renderList();};
  root.addEventListener("click",async e=>{
    const dismiss=e.target.closest("[data-tv-dismiss]");
    if(dismiss){e.preventDefault();rememberDismissed(dismiss.dataset.tvDismiss);renderIntelligence();return;}
    const ui=e.target.closest("[data-tv-ui]");
    if(ui){e.preventDefault();await openTvAction(ui.dataset.tvUi,Number(ui.dataset.tvMission||0),ui.dataset.tvRequirement||null,ui.dataset.tvStateToken||null);return;}
    return;
  });
  const anchor=findAnchor();
  if(anchor?.parentNode)anchor.insertAdjacentElement("afterend",root);else document.querySelector("main")?.prepend(root);
}
function findAnchor(){return document.querySelector(".tenant-module-launcher")||document.querySelector(".driver-cockpit")||document.querySelector(".exec-header")||document.querySelector("header");}
async function loadAttention({force=false}={}){
  if(loading&&!force)return;if(loading&&force){await new Promise(r=>setTimeout(r,0));if(loading)return;}loading=true;
  try{
    const d=await api("/api/attention?limit=20");
    lastItems=d.items||[];
    lastIntelligence=d.intelligence||fallbackIntelligence(d);
    renderSummary(d.summary||{});
    renderIntelligence();
    renderMissionFocus();
    const missionId=currentFocusMissionId();if(missionId)refreshFocusCoordination(missionId).catch(()=>{});
    window.dispatchEvent(new CustomEvent("onmission:intelligence",{detail:lastIntelligence}));
    if(open)renderList();
  }catch(e){
    const box=root?.querySelector("#attIntelligence");if(box)box.innerHTML='<div class="attention-topline">Mission intelligence temporarily unavailable.</div>';
  }finally{loading=false;}
}
function fallbackIntelligence(d){
  const top=(d.items||[])[0]||null,focus=d.focus||null;
  return {available:Boolean(top||focus?.available),missionId:focus?.missionId||top?.missionId||null,reference:focus?.reference||top?.reference||"",statusLabel:top?.statusLabel||"",health:{state:"unknown",summary:top?.reasons?.[0]?.label||""},attention:{level:top?.level||"none",score:Number(top?.score||0),reason:top?.reasons?.[0]?.label||""},priority:{level:focus?.priority||"none",score:Number(focus?.score||0)},focus:focus||{available:false}};
}
function currentFocusMissionId(){
  const missions=(focusSnapshot?.missions||[]).filter(m=>!isTerminalStatus(m.status));
  if(!missions.length)return null;
  const storedId=Number(localStorage.getItem(`onmission:focus:${focusSnapshot?.role||"viewer"}`)||0);
  const selectedId=missions.some(m=>Number(m.id)===storedId)?storedId:Number(focusSnapshot?.selectedMissionId||0);
  return Number(buildMissionFocus({missions,selectedMissionId:selectedId,role:focusSnapshot?.role||"",surfaces:focusSnapshot?.surfaces||{}})?.missionId||0)||null;
}
async function refreshFocusCoordination(missionId,{force=false}={}){
  missionId=Number(missionId||0);if(!missionId)return;
  if(focusCoordination.loading)return;
  if(!force&&focusCoordination.missionId===missionId&&Date.now()-Number(focusCoordination.loadedAt||0)<15000)return;
  focusCoordination={...focusCoordination,loading:true};
  try{
    const d=await fetchMissionCoordination(missionId);
    if(currentFocusMissionId()!==missionId)return;
    focusCoordination={missionId,coordination:d.coordination||null,problems:d.problems||[],loading:false,loadedAt:Date.now()};
    renderMissionFocus();
    renderIntelligence();
  }catch(error){
    focusCoordination={missionId,coordination:null,problems:[String(error?.message||"coordination_unavailable")],loading:false,loadedAt:Date.now()};
  }
}
function coordinatedFocusFor(missionId){return Number(focusCoordination.missionId||0)===Number(missionId||0)?focusCoordination.coordination:null;}
function missionStateToken(missionId){
  const id=Number(missionId||0);
  const coordinated=coordinatedFocusFor(id);
  if(coordinated?.stateToken)return coordinated.stateToken;
  const mission=(focusSnapshot?.missions||[]).find(m=>Number(m.id)===id);
  if(mission){const v=Number(mission.state_version||0);if(v>0)return `v:${v}`;}
  const item=(lastItems||[]).find(x=>Number(x.missionId||0)===id&&x.stateToken);
  return item?.stateToken||null;
}
function adoptFocusStateToken(missionId,token){
  const raw=String(token||"");if(!raw.startsWith("v:"))return;
  const version=Number(raw.slice(2));if(!version)return;
  const mission=(focusSnapshot?.missions||[]).find(m=>Number(m.id)===Number(missionId));
  if(mission)mission.state_version=version;
  if(Number(focusCoordination?.missionId||0)===Number(missionId)&&focusCoordination.coordination){
    focusCoordination={...focusCoordination,coordination:{...focusCoordination.coordination,stateToken:raw,surface:focusCoordination.coordination.surface?{...focusCoordination.coordination.surface,stateToken:raw}:focusCoordination.coordination.surface}};
  }
}

window.addEventListener("onmission:state-advanced",e=>{const missionId=Number(e.detail?.missionId||0);if(missionId)adoptFocusStateToken(missionId,e.detail?.stateToken);});
window.addEventListener("onmission:stale-mission",()=>{reconcileLatestMissionTruth().catch(()=>{});});
function focusStorageKey(){return `onmission:focus:${focusSnapshot?.role||"viewer"}`;}
function activeFocusMissions(){
  return (focusSnapshot?.missions||[]).filter(m=>!isTerminalStatus(m.status));
}
function clearFocusSelection(){
  focusSnapshot={...focusSnapshot,selectedMissionId:null};
  focusCoordination={missionId:null,coordination:null,problems:[],loading:false,loadedAt:0};
  localStorage.removeItem(focusStorageKey());
}
function normalizeFocusSelection(source="normalize"){
  const active=activeFocusMissions();
  if(!active.length){clearFocusSelection();return null;}
  const stored=Number(localStorage.getItem(focusStorageKey())||0);
  const selected=Number(focusSnapshot?.selectedMissionId||0);
  const next=active.find(m=>Number(m.id)===stored)||active.find(m=>Number(m.id)===selected)||active[0];
  const nextId=Number(next.id);
  focusSnapshot={...focusSnapshot,selectedMissionId:nextId};
  localStorage.setItem(focusStorageKey(),String(nextId));
  return nextId;
}
async function reconcileLatestMissionTruth(missionId=null){
  if(!loading)await loadAttention();
  const current=normalizeFocusSelection("truth-refresh");
  renderMissionFocus();
  if(current)await refreshFocusCoordination(current,{force:true});
  window.dispatchEvent(new CustomEvent("onmission:truth-reconciled",{detail:{missionId:Number(missionId||current||0)||null,currentMissionId:current||null}}));
  return current;
}

function renderMissionFocus(){
  const box=root?.querySelector("#attFocus");if(!box)return;
  const missions=activeFocusMissions();
  if(!missions.length){
    clearFocusSelection();
    box.classList.remove("hidden");
    box.innerHTML=`<section class="mission-focus-card mission-focus-empty"><div class="mission-focus-empty-check">✓</div><b>All missions completed</b><span>No active mission</span></section>`;
    return;
  }
  const storedId=Number(localStorage.getItem(`onmission:focus:${focusSnapshot?.role||"viewer"}`)||0);
  const selectedId=missions.some(m=>Number(m.id)===storedId)?storedId:Number(focusSnapshot?.selectedMissionId||0);
  const focus=buildMissionFocus({missions,selectedMissionId:selectedId,role:focusSnapshot?.role||"",surfaces:focusSnapshot?.surfaces||{}});
  if(!focus.available){box.innerHTML="";box.classList.add("hidden");return;}
  box.classList.remove("hidden");
  const {mission,role,actorExecution,route}=focus;
  const coordination=coordinatedFocusFor(mission.id);
  const operatingSurface=coordination?.surface||null;
  const unified=coordination?.unified||null;
  const primary=operatingSurface?.primary||unified?.primary||focus.primary;
  const waiting=operatingSurface?.waiting||unified?.waiting||focus.waiting;
  const liveness=coordination?.liveness||focus.liveness;
  const assignment=coordination?.assignment||null;
  const management=coordination?.management||null;
  const presentation=focusPresentationDecision({mission,role,primary,waiting,liveness,assignment,management,coordination,problems:focusCoordination?.problems||[]});
  localStorage.setItem(`onmission:focus:${role||"viewer"}`,String(Number(mission.id)));
  const ownerName=mission.owner_company_name||mission.company_name||mission.tenant_name||mission.assigning_company_name||"Mission owner";
  const pickupTime=focusClock(mission.pickup_at_utc||mission.pickup_time||mission.mission_start_time);
  const deliveryTime=focusClock(mission.delivery_at_utc||mission.delivery_time||mission.mission_end_time);
  const timeProgress=focusTimeProgress(mission);
  const pickupCompany=mission.pickup_company||"Pickup";
  const deliveryCompany=mission.delivery_company||"Delivery";
  const pickupAddress=formatMissionAddress(mission,"pickup");
  const deliveryAddress=formatMissionAddress(mission,"delivery");
  const instruction=presentation.instruction||focusInstruction(mission,route,pickupTime,deliveryTime,waiting,primary,{coordination,assignment,management});
  const nav=actorExecution&&route.address?`<button type="button" class="mission-focus-nav-icon" data-focus-nav="${Number(mission.id)}" title="${esc(route.navLabel)}" aria-label="${esc(route.navLabel)}">➤</button>`:"";
  const primaryStateToken=primary?.stateToken||coordination?.stateToken||missionStateToken(mission.id)||"";
  const primaryHtml=primary?`<button type="button" class="mission-focus-primary mission-focus-primary-large" data-focus-action="${attr(primary.code||"")}" data-focus-mission="${Number(mission.id)}" data-focus-state-token="${attr(primaryStateToken)}">${esc(focusActionLabel(primary))}</button>`:"";
  const switcher=""; // V8.8.1.5: direct active-mission list replaces the duplicate switch control.
  const currentSituation=String(focusSnapshot?.operational?.situation||"Available");
  const statusHtml=actorExecution?renderFocusSituation(role,currentSituation):"";
  const report=actorExecution&&String(primary?.code||"")!=="report_exception"?`<button type="button" class="mission-focus-report-icon" data-focus-report="${Number(mission.id)}" title="Report problem" aria-label="Report problem">⚠</button>`:"";
  const tenantAction=!actorExecution&&primary?primaryHtml:"";
  const tenantUtilities=!actorExecution?renderTenantFocusUtilities(mission,operatingSurface):"";
  const tenantStatus=missionStatusPresentation(mission.status);
  const executionChannel=assignmentChannelLabel(assignment);

  box.innerHTML=actorExecution?`
    <section class="mission-focus-card mission-focus-cockpit state-${attr(String(liveness?.state||"actionable").toLowerCase())} attention-${attr(presentation.level.toLowerCase())}">
      ${presentation.level==="NORMAL"?"":`<div class="mission-focus-alert-icon" title="${esc(presentation.headline)}" aria-label="${esc(presentation.headline)}">⚠</div>`}
      <div class="mission-focus-identity"><strong>${esc(ownerName)}</strong><b>${esc(mission.reference||`SN${mission.id}`)}</b></div>
      <div class="mission-focus-route"><strong>${esc(pickupCompany)}</strong><i>→</i><strong>${esc(deliveryCompany)}</strong></div>
      <div class="mission-focus-addresses"><span>${esc(pickupAddress)}</span><i>→</i><span>${esc(deliveryAddress)}</span></div>
      ${presentation.level==="NORMAL"?"":`<div class="mission-focus-instruction">${esc(instruction)}</div>`}
      <div class="mission-focus-driver-actions">${nav}${primaryHtml}${report}${switcher}<details class="mission-focus-more"><summary aria-label="More mission actions">⋯</summary><div><a class="mission-focus-open" href="${operatorMissionHref(mission)}">OPEN MISSION</a></div></details></div>
      ${statusHtml}
      ${timeProgress}
    </section>
    ${renderActiveMissionList(missions,mission.id)}`:`
    <section class="mission-focus-card mission-focus-tenant state-${attr(String(liveness?.state||"actionable").toLowerCase())} attention-${attr(presentation.level.toLowerCase())}">
      <div class="mission-focus-attention"><span>${esc(presentation.badge)}</span><b>${esc(presentation.headline)}</b></div>
      <div class="mission-focus-identity"><strong>SELECTED MISSION</strong><b>${esc(mission.reference||`SN${mission.id}`)}</b></div>
      <div class="mission-focus-tenant-status ${attr(tenantStatus.className)}"><small>MISSION STATUS</small><b>${esc(tenantStatus.label)}</b></div>
      <div class="mission-focus-execution-channel"><small>EXECUTION RESPONSIBILITY</small><b>${esc(executionChannel)}</b></div>
      <div class="mission-focus-route"><strong>${esc(pickupCompany)}</strong><i>→</i><strong>${esc(deliveryCompany)}</strong></div>
      <div class="mission-focus-addresses"><span>${esc(pickupAddress)}</span><i>→</i><span>${esc(deliveryAddress)}</span></div>
      ${presentation.level==="NORMAL"?"":`<div class="mission-focus-instruction">${esc(instruction)}</div>`}
      <div class="mission-focus-tenant-state">${primary&&presentation.level==="NORMAL"?"":`<span>${esc(focusStateLabel({liveness,assignment,management,waiting,primary}))}</span>`}${tenantAction}<a class="mission-focus-open-inline" href="${operatorMissionHref(mission)}" aria-label="Open mission">↗</a>${tenantUtilities}</div>
      ${timeProgress}
    </section>`;

  box.querySelector("[data-focus-nav]")?.addEventListener("click",()=>{location.href=operationalMissionHref(Number(mission.id),{role,view:"actions",action:"navigate"});});
  box.querySelector("[data-focus-action]")?.addEventListener("click",e=>openTvAction(e.currentTarget.dataset.focusAction,Number(mission.id),null,e.currentTarget.dataset.focusStateToken||null));
  box.querySelector("[data-focus-switch]")?.addEventListener("click",()=>openMissionSwitcher(Number(mission.id),missions));
  box.querySelectorAll("[data-active-mission]").forEach(b=>b.addEventListener("click",()=>{
    const next=Number(b.dataset.activeMission||0);if(next&&next!==Number(mission.id))selectMissionFocus(next);
  }));
  box.querySelector("[data-focus-report]")?.addEventListener("click",()=>openTvAction("report_exception",Number(mission.id)));
  box.querySelectorAll("[data-focus-secondary-action]").forEach(b=>b.addEventListener("click",()=>{
    const code=b.dataset.focusSecondaryAction;
    if(["start_custody_resolution","start_custody_recovery","finalize_custody_transfer","abort_custody_transfer","cancel_mission"].includes(code)){
      location.href=operatorMissionHref(mission);return;
    }
    openTvAction(code,Number(mission.id));
  }));
  box.querySelectorAll("[data-focus-situation]").forEach(b=>b.addEventListener("click",()=>{
    const requested=b.dataset.focusSituation;
    const next=currentSituation===requested?"Available":requested;
    window.dispatchEvent(new CustomEvent("onmission:focus-situation",{detail:{role,situation:next}}));
  }));
}
function renderFocusSituation(role,current){
  const effective=["Traffic","Driving","Break","Unavailable"].includes(current)?current:"Available";
  const states=[["Traffic","🚦","Traffic"],["Driving","🚚","Driving"],["Break","☕","Break"],["Unavailable","⛔","Unavailable"]];
  return `<div class="mission-focus-situation" aria-label="Executor status">${states.map(([value,icon,label])=>`<button type="button" data-focus-situation="${value}" class="${effective===value?"active":""}" title="${label}${effective===value?" · tap again for Available":""}" aria-label="${label}${effective===value?" · tap again for Available":""}"><span>${icon}</span></button>`).join("")}</div>`;
}
function focusPresentationDecision({mission,role,primary=null,waiting=null,liveness=null,assignment=null,management=null,coordination=null,problems=[]}={}){
  // Presentation priority only. This function never authorizes or mutates mission truth.
  // SECURITY/TRUTH > LIVENESS > MANAGEMENT > CUSTODY/RESPONSIBILITY > ASSIGNMENT > LIFECYCLE > INFO.
  const invariant=coordination?.invariant||{};
  const coordinationProblems=[...(problems||[]),...(coordination?.problems||[])];
  const truthBreach=Boolean(
    invariant.sameMission===false||
    invariant.truthPresent===false||
    invariant.truthStatusAgrees===false||
    invariant.truthValid===false||
    invariant.oneExecutionOwner===false||
    invariant.missionLive===false||
    coordination?.liveness?.state==="BREACH"||
    coordinationProblems.some(x=>/mismatch|conflict|breach|isolation|execution_owner/i.test(String(x||"")))
  );
  if(truthBreach)return Object.freeze({
    level:"BLOCKED",priority:1,badge:"CHECK REQUIRED",headline:"Mission truth needs verification",
    instruction:"This mission cannot safely continue until its execution truth is verified."
  });

  const liveState=String(liveness?.state||"").toUpperCase();
  if(["BREACH","BLOCKED","RECOVERY"].includes(liveState))return Object.freeze({
    level:"BLOCKED",priority:2,badge:liveState==="RECOVERY"?"RECOVERY":"BLOCKED",
    headline:liveness?.label||"Mission needs resolution",
    instruction:primary?.reason||liveness?.label||"Resolve the blocking condition before continuing."
  });

  const requirement=(management?.requirements||[]).find(r=>["ACTION_REQUIRED","WAITING"].includes(String(r?.state||"")));
  if(management?.state==="BLOCKED"||requirement?.state==="ACTION_REQUIRED")return Object.freeze({
    level:"BLOCKED",priority:3,badge:"ACTION REQUIRED",headline:"Mission needs intervention",
    instruction:requirement?.question||primary?.reason||"Resolve the mission requirement before continuing."
  });
  if(management?.state==="AT_RISK")return Object.freeze({
    level:"URGENT",priority:3,badge:"ATTENTION",headline:"Mission needs attention",
    instruction:requirement?.question||primary?.reason||"Review the mission condition and take the recommended action."
  });

  const execution=coordination?.execution||{};
  if(execution?.custodyConflict||execution?.responsibilityConflict||execution?.invariant?.oneExecutionOwner===false)return Object.freeze({
    level:"BLOCKED",priority:4,badge:"EXECUTION HOLD",headline:"Responsibility or custody needs resolution",
    instruction:primary?.reason||"Resolve execution responsibility before continuing."
  });

  if(assignment?.assignmentRequired)return Object.freeze({
    level:"ATTENTION",priority:5,badge:"ASSIGNMENT",headline:"Execution is not assigned",
    instruction:primary?.reason||"Choose who should execute this mission."
  });
  if(assignment?.acquisitionWaiting||waiting)return Object.freeze({
    level:"ATTENTION",priority:5,badge:"WAITING",headline:waiting?.waitingFor?`Waiting for ${waiting.waitingFor}`:"Waiting for execution",
    instruction:waiting?.waitingFor?`Waiting for ${waiting.waitingFor}.`:(primary?.reason||"No action is required until the responsible party responds.")
  });

  const deadlineMs=Date.parse(mission?.deadline_at_utc||mission?.delivery_at_utc||"")-Date.now();
  if(Number.isFinite(deadlineMs)&&deadlineMs>0&&deadlineMs<=30*60000)return Object.freeze({
    level:"URGENT",priority:6,badge:"DEADLINE",headline:"Time-sensitive mission",
    instruction:primary?.reason||"Continue the current mission action. The deadline is approaching."
  });

  return Object.freeze({
    level:"NORMAL",priority:7,badge:"CURRENT MISSION",
    headline:primary?focusActionLabel(primary):"Mission in progress",
    instruction:""
  });
}
function renderTenantFocusUtilities(mission,operatingSurface){
  const allowed=new Set(["reclaim_execution","start_custody_resolution","start_custody_recovery","finalize_custody_transfer","abort_custody_transfer","cancel_mission"]);
  const utilities=(operatingSurface?.utilities||[]).filter(a=>allowed.has(String(a?.code||"")));
  if(!utilities.length)return "";
  return `<details class="mission-focus-more mission-focus-tenant-more"><summary aria-label="More management actions">⋯</summary><div>${utilities.map(a=>`<button type="button" class="mission-focus-open" data-focus-secondary-action="${attr(a.code)}">${esc(focusActionLabel(a))}</button>`).join("")}<a class="mission-focus-open" href="${operatorMissionHref(mission)}">MANAGEMENT</a></div></details>`;
}
function missionStatusPresentation(status){
  const s=String(status||"Pending");
  const map={
    Pending:["PENDING","status-pending"],
    Arrived:["ARRIVED","status-arrived"],
    PickedUp:["PICKED UP","status-pickedup"],
    InTransit:["IN TRANSIT","status-transit"],
    Delivered:["DELIVERED","status-delivered"],
    Completed:["COMPLETED","status-completed"],
    Cancelled:["CANCELLED","status-cancelled"],
    Canceled:["CANCELLED","status-cancelled"]
  };
  const [label,className]=map[s]||[s.toUpperCase(),"status-neutral"];
  return {label,className};
}
function focusInstruction(mission,route,pickupTime,deliveryTime,waiting,primary,{coordination=null,assignment=null,management=null}={}){
  if(waiting?.waitingFor)return `Waiting for ${waiting.waitingFor}.`;
  const requirement=(management?.requirements||[]).find(r=>r.state==="ACTION_REQUIRED"||r.state==="WAITING");
  if(requirement?.question)return requirement.question;
  if(primary?.reason&&/blocked|problem|recover|waiting|custody|complete|assign|driver|network|foryou/i.test(primary.reason))return primary.reason;
  if(assignment?.assignmentRequired&&coordination?.flow?.viewer?.role==="admin")return "Choose who should execute this mission.";
  const status=String(mission.status||"Pending");
  if(isPreCustodyStatus(status))return `Arrive at ${formatMissionAddress(mission,"pickup")} at ${mission.pickup_company||"pickup"}${pickupTime?` at ${pickupTime}`:""}.`;
  if(isCustodyStatus(status))return `Deliver to ${formatMissionAddress(mission,"delivery")} at ${mission.delivery_company||"delivery"}${deliveryTime?` by ${deliveryTime}`:""}.`;
  if(status==="Delivered")return `Delivery confirmed at ${mission.delivery_company||"delivery"}. Complete the mission when ready.`;
  return primary?.reason||"Continue the mission.";
}
function focusStateLabel({liveness=null,assignment=null,management=null,waiting=null,primary=null}={}){
  if(waiting?.waitingFor)return `Waiting for ${waiting.waitingFor}`;
  if(management?.state==="BLOCKED")return "Mission needs intervention";
  if(management?.state==="AT_RISK")return "Mission needs attention";
  if(assignment?.acquisitionWaiting)return assignment?.assignmentSource==="network"?"Waiting for Trusted Network":"Waiting for execution";
  if(assignment?.assignmentRequired)return "Execution not assigned";
  if(primary?.reason)return primary.reason;
  return liveness?.label||management?.state||"Ready";
}

function assignmentChannelLabel(assignment){
  const source=String(assignment?.assignmentSource||"").toLowerCase();
  if(source==="owner")return "OWNER ASSIGNMENT";
  if(source==="executor")return "INDEPENDENT EXECUTOR";
  if(source==="executing_tenant")return "EXECUTING TENANT";
  if(source==="network")return "TRUSTED NETWORK";
  if(source==="foryou")return "FOR YOU";
  if(assignment?.assignmentRequired)return "NOT ASSIGNED";
  return "RESPONSIBILITY PENDING";
}

function focusClock(value){
  if(!value)return "";
  const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value).slice(0,5);
  return new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit"}).format(d);
}
function focusTimeProgress(mission){
  const start=focusDateValue(mission?.pickup_at_utc||mission?.mission_start_time||mission?.pickup_time);
  const delivery=focusDateValue(mission?.delivery_at_utc||mission?.mission_end_time||mission?.delivery_time);
  let end=focusDateValue(mission?.deadline_at_utc||mission?.deadline_at||mission?.delivery_at_utc||mission?.mission_end_time||mission?.delivery_time);
  if(!start||!end||end<=start)return "";
  const now=Date.now(),duration=end-start,elapsed=Math.max(0,Math.min(duration,now-start));
  const pct=Math.max(0,Math.min(100,(elapsed/duration)*100));
  const deliveryPct=delivery&&delivery>=start&&delivery<=end?Math.max(0,Math.min(100,((delivery-start)/duration)*100)):null;
  const state=now<start?"BEFORE":now>end?"OVERDUE":"ACTIVE";
  return `<div class="mission-focus-time-progress state-${state.toLowerCase()}" aria-label="Scheduled mission time progress">
    <div class="mission-focus-time-track"><i style="width:${pct.toFixed(2)}%"></i>${deliveryPct!==null?`<em style="left:${deliveryPct.toFixed(2)}%" title="Delivery time"></em>`:""}</div>
  </div>`;
}
function focusDateValue(value){
  if(value===null||value===undefined||value==="")return null;
  if(typeof value==="number"&&Number.isFinite(value))return value;
  const raw=String(value);
  if(/^\d{1,2}:\d{2}/.test(raw))return null;
  const d=new Date(raw);return Number.isNaN(d.getTime())?null:d.getTime();
}
function focusDuration(ms){
  const mins=Math.max(0,Math.ceil(ms/60000));
  const h=Math.floor(mins/60),m=mins%60;
  if(h>=24){const d=Math.floor(h/24),rh=h%24;return `${d}d ${rh}h`;}
  return h?`${h}h ${m}m`:`${m}m`;
}
function focusDeadline(value){
  if(!value)return "";
  const d=new Date(value),ms=d-Date.now();if(Number.isNaN(d.getTime()))return "";
  if(ms<=0)return "Due";
  const mins=Math.ceil(ms/60000),h=Math.floor(mins/60),m=mins%60;
  return h?`${h}h ${m}m`: `${m}m`;
}

function openMissionSwitcher(currentId,missions){
  const options=(missions||[]).filter(m=>Number(m.id)!==Number(currentId));
  openTvModal({
    title:"Work on another mission",
    hint:"Changing focus changes attention only. Responsibility, custody and lifecycle stay unchanged.",
    body:`<div class="focus-switch-list">${options.map(m=>`<button type="button" data-switch-mission="${Number(m.id)}"><b>${esc(m.reference||`Mission ${m.id}`)}</b><small>${esc(String(m.status||"Pending"))} · ${esc(m.pickup_company||m.delivery_company||"Mission")}</small></button>`).join("")}</div>`,
    onReady:()=>document.querySelectorAll("#missionTvModal [data-switch-mission]").forEach(b=>b.onclick=()=>{selectMissionFocus(Number(b.dataset.switchMission));closeTvModal();})
  });
}
function selectMissionFocus(missionId){
  missionId=Number(missionId||0);
  if(!activeFocusMissions().some(m=>Number(m.id)===missionId))return;
  focusSnapshot={...focusSnapshot,selectedMissionId:missionId};
  focusCoordination={missionId:null,coordination:null,problems:[],loading:false,loadedAt:0};
  localStorage.setItem(focusStorageKey(),String(missionId));
  document.querySelectorAll(".mission-focus-more[open],details.tv-more[open]").forEach(x=>x.open=false);
  window.dispatchEvent(new CustomEvent("onmission:focus-selected",{detail:{missionId,role:focusSnapshot.role,source:"switch"}}));
  renderMissionFocus();
  refreshFocusCoordination(missionId,{force:true}).catch(()=>{});
}

function focusActionLabel(action){
  if(action?.experience?.label){
    const icon=String(action.experience.icon||"").trim();
    return `${icon?icon+" ":""}${String(action.experience.label).toUpperCase()}`.trim();
  }
  const map={
    confirm_arrival:"✓ ARRIVED",
    confirm_pickup:"📦 PICKED UP",
    start_transit:"➜ START TRANSIT",
    confirm_delivery:"🖼️ DELIVERED",
    complete_mission:"100% ✅",
    assign_driver:"👤 ASSIGN",
    change_driver:"↻ CHANGE EXECUTOR",
    share_foryou:"🌐 PUBLISH FORYOU",
    share_network:"🤝 SEND",
    approve_foryou_request:"✓ APPROVE",
    approve_foryou:"✓ APPROVE",
    approve_foryou_request:"✓ APPROVE",
    accept_network_mission:"✓ ACCEPT",
    reclaim_execution:"↩ TAKE BACK",
    withdraw_network:"× CANCEL SHARE",
    withdraw_foryou:"× CANCEL FORYOU",
    capture_delivery_proof:"🖼️ ADD PHOTO",
    report_exception:"⚠ REPORT"
  };
  return map[action?.code]||String(action?.label||"OPEN").toUpperCase();
}
function renderActiveMissionList(missions,selectedId){
  if(!missions?.length)return "";
  return `<div class="mission-focus-active-list" aria-label="Active missions">${missions.map(m=>{
    const active=Number(m.id)===Number(selectedId);
    const pickup=m.pickup_company||formatMissionAddress(m,"pickup");
    const delivery=m.delivery_company||formatMissionAddress(m,"delivery");
    return `<button type="button" data-active-mission="${Number(m.id)}" class="${active?"active":""}" aria-pressed="${active?"true":"false"}">
      <b>${esc(m.reference||`SN${m.id}`)}${active?' <em>CURRENT</em>':""}</b><span>${esc(pickup)} <i>→</i> ${esc(delivery)}</span><small>${esc(missionStatusPresentation(m.status).label)}</small>
    </button>`;
  }).join("")}</div>`;
}
function cycleMissionFocus(currentId,missions){
  const ids=missions.map(m=>Number(m.id)),index=Math.max(0,ids.indexOf(Number(currentId))),next=ids[(index+1)%ids.length];
  focusSnapshot={...focusSnapshot,selectedMissionId:next};
  localStorage.setItem(`onmission:focus:${focusSnapshot.role||"viewer"}`,String(next));
  window.dispatchEvent(new CustomEvent("onmission:focus-selected",{detail:{missionId:next,role:focusSnapshot.role,source:"ignore"}}));
  renderMissionFocus();
}
function bindMobileTvMenus(){
  document.addEventListener("toggle",e=>{
    const details=e.target?.closest?.("details.tv-more");
    if(!details||!details.open)return;
    document.querySelectorAll("details.tv-more[open]").forEach(x=>{if(x!==details)x.open=false;});
    if(window.matchMedia("(max-width:680px)").matches){
      const menu=details.querySelector(".tv-more-menu");
      if(menu){details.open=false;openMobileTvOverflow(menu);}
    }
  },true);
  document.addEventListener("click",e=>{
    if(!window.matchMedia("(max-width:680px)").matches)return;
    const details=document.querySelector("details.tv-more[open]");if(!details||details.contains(e.target))return;
    details.open=false;
  });
  window.addEventListener("orientationchange",()=>document.querySelectorAll("details.tv-more[open]").forEach(x=>x.open=false));
}
function openMobileTvOverflow(menu){
  const html=[...menu.children].map(x=>x.outerHTML).join("");
  openTvModal({title:"Mission actions",hint:"Open the mission workspace to continue.",body:`<div class="tv-mobile-action-sheet">${html}</div>`,onReady:()=>{
    const modal=document.querySelector("#missionTvModal");if(!modal)return;
    modal.querySelectorAll("[data-tv-ui]").forEach(b=>b.onclick=()=>{closeTvModal();openTvAction(b.dataset.tvUi,Number(b.dataset.tvMission||0),b.dataset.tvRequirement||null,b.dataset.tvStateToken||null);});
    modal.querySelectorAll("[data-tv-dismiss]").forEach(b=>b.onclick=()=>{rememberDismissed(b.dataset.tvDismiss);closeTvModal();renderIntelligence();});
  }});
}

function renderIntelligence(){
  const box=root?.querySelector("#attIntelligence");if(!box)return;
  const x=lastIntelligence||{},tv=x.tv||fallbackTvContract(x);
  const focusedMissionId=Number(localStorage.getItem(`onmission:focus:${focusSnapshot?.role||"viewer"}`)||focusSnapshot?.selectedMissionId||0);
  const items=(tv.items||[]).filter(i=>!isDismissed(i.id)&&!isRoutineFocusedEvent(i,focusedMissionId));
  if(!tv.available&&!items.length){
    box.innerHTML='<div class="mission-tv"><div class="mission-tv-top"><span class="tv-live"><i></i> LIVE</span></div><div class="mission-tv-clear"><span>✓</span><div><b>No new mission events.</b></div></div></div>';return;
  }
  const primary=items[0]||null,rest=items.slice(1,4);
  if(!primary){box.innerHTML='<div class="mission-tv"><div class="mission-tv-clear"><span>✓</span><div><b>No new mission events.</b></div></div></div>';return;}
  const presentation=presentationFor(primary);
  const time=primary.occurredAt?formatTimeAge(primary.occurredAt):"now";
  const cls=primary.alert?" tv-event-alert":"";
  box.innerHTML=`
    <div class="mission-tv mission-tv-simple health-${attr(x.health?.state||"unknown")}">
      <div class="mission-tv-top"><span class="tv-live"><i></i> LIVE</span></div>
      <div class="mission-tv-event${cls}">
        <div class="tv-event-icon">${esc(primary.icon||"●")}</div>
        <a class="tv-event-copy tv-event-link" href="${attr(primary.href||"/foryou")}"><small>${esc(time)}</small><h3>${esc(presentation.line)}</h3>${presentation.subline?`<p>${esc(presentation.subline)}</p>`:""}</a>
        <a class="tv-act-link" href="${attr(primary.href||"/foryou")}">ACT ↗</a>
        ${renderContractActions(primary)}
      </div>
      ${rest.length?`<div class="tv-event-stream">${rest.map(renderContractRow).join("")}</div>`:""}
    </div>`;
}
function isRoutineFocusedEvent(item,focusedMissionId){
  if(!focusedMissionId||Number(item?.missionId||0)!==focusedMissionId||item?.alert)return false;
  const p=presentationFor(item),code=String(p?.primary?.code||"");
  const text=`${item?.headline||""} ${item?.detail||""}`.toLowerCase();
  if(["report_exception","resolve_exception","resolve_blocker","recover_completion","message","reclaim_execution"].includes(code))return false;
  if(/message|address|damage|exception|problem|blocked|deadline|waiting|changed|corrected|invitation|request/.test(text))return false;
  const coordinated=coordinatedFocusFor(focusedMissionId),focusCode=String(coordinated?.unified?.primary?.code||"");
  if(focusCode&&code===focusCode)return true;
  return ["confirm_arrival","confirm_pickup","start_transit","confirm_delivery","complete_mission","navigate","start_navigation"].includes(code);
}
function renderContractRow(item){
  const p=presentationFor(item),actions=renderContractActions(item,true);
  return `<div class="tv-event-row${item.alert?" alert":""}"><a class="tv-event-row-main" href="${attr(item.href||"/foryou")}"><span class="tv-event-row-icon">${esc(item.icon||"•")}</span><span class="tv-event-row-copy"><small>${esc(item.occurredAt?formatTimeAge(item.occurredAt):"now")}</small><b>${esc(p.line)}</b>${p.subline?`<em>${esc(p.subline)}</em>`:""}</span></a>${actions}</div>`;
}
function renderContractActions(item,stream=false){
  const p=presentationFor(item);
  const choices=[...(p.choices||[])],secondary=[...(p.overflow||[])];
  let primary=p.primary||null;
  if(!primary&&choices.length)primary=choices.shift();
  const overflow=[...choices,...secondary].filter(a=>a&&a.code!==primary?.code);
  if(!primary&&!overflow.length)return "";
  const primaryHtml=primary?renderTvAction(primary,item,stream?"compact":"primary"):"";
  const overflowHtml=overflow.length?`<details class="tv-more"><summary aria-label="More actions">⋯</summary><div class="tv-more-menu">${overflow.map(a=>renderTvAction(a,item,"menu")).join("")}</div></details>`:"";
  return `<span class="tv-stream-actions tv-action-stack">${primaryHtml}${overflowHtml}</span>`;
}
function renderTvAction(a,item,mode="compact"){
  const cls=mode==="primary"?"tv-primary-action":mode==="menu"?"tv-more-action":mode==="choice"?"tv-execution-shortcut":"tv-stream-action";
  const exp=a?.experience||null;
  const rawLabel=String(exp?.label||a.label||"DO");
  const icon=String(exp?.icon||"").trim();
  const label=esc(`${icon?icon+" ":""}${rawLabel}`.trim());
  const missionId=Number(a.missionId||item.missionId||0);
  const stateToken=String(a.stateToken||item.stateToken||"");
  const confirmation=String(exp?.confirm&&exp.confirm!=="none"?(exp.confirmationText||a.confirm||""):a.confirm||"");
  if(a.kind==="dismiss")return `<button type="button" class="${cls}" data-tv-dismiss="${attr(item.id)}">${label}</button>`;
  if(a.kind==="ui")return `<button type="button" class="${cls}" data-tv-ui="${attr(a.code||"")}" data-tv-mission="${missionId}" data-tv-state-token="${attr(stateToken)}" data-tv-requirement="${attr(a.requirementId||"")}">${label}</button>`;
  if(a.kind==="command")return `<button type="button" class="${cls}" data-tv-ui="${attr(a.code||"")}" data-tv-mission="${missionId}" data-tv-state-token="${attr(stateToken)}">${label}</button>`;
  return `<a class="${cls}" href="${attr(a.href||item.href||"/foryou")}">${label}</a>`;
}
function presentationFor(item){
  if(item?.presentation)return item.presentation;
  const actions=item?.actions||[];
  return {line:renderContractText(item?.headline,item?.localTime),subline:renderContractText(item?.detail,item?.localTime),primary:actions[0]||null,choices:[],overflow:actions.slice(1)};
}
function renderContractText(text,localTime){
  let out=String(text||"");
  if(localTime?.value&&localTime?.token)out=out.split(localTime.token).join(formatTime(localTime.value));
  return out;
}
function renderContractProgress(value,missionId){
  const n=Number(value||0);if(!n)return "";
  return `<span class="tv-progress" aria-label="Mission ${Number(missionId||0)} ${n}% complete"><span class="tv-progress-track"><i style="width:${n}%"></i></span><small>${n}%</small></span>`;
}
function openTvAction(code,missionId,requirementId=null,actionStateToken=null){
  const id=Number(missionId||0);if(!id)return;
  const role=String(focusSnapshot?.role||"admin");
  const action=String(code||"").trim();
  const url=operationalMissionHref(id,{role,view:"actions",action});
  location.href=url;
}
function openTvModal({title,hint="",body="",onReady=null,onChoice=null}){closeTvModal();document.querySelectorAll("details[open]").forEach(x=>x.open=false);const wrap=document.createElement("div");wrap.id="missionTvModal";wrap.className="tv-modal-backdrop";wrap.innerHTML=`<div class="tv-modal-card"><div class="tv-modal-head"><div><small>MISSION TV ACTION</small><h3>${esc(title)}</h3><p>${esc(hint)}</p></div><button type="button" id="tvModalClose">×</button></div><div class="tv-modal-body">${body}</div></div>`;document.body.appendChild(wrap);wrap.querySelector("#tvModalClose").onclick=closeTvModal;wrap.addEventListener("click",e=>{if(e.target===wrap)closeTvModal();const c=e.target.closest("[data-tv-choice]");if(c&&onChoice){const id=c.dataset.tvChoice,type=c.dataset.tvChoiceType;c.disabled=true;Promise.resolve(onChoice(id,type)).catch(err=>{alert(err.message);c.disabled=false;});}});onReady?.();}
function closeTvModal(){document.querySelector("#missionTvModal")?.remove();}
function choice(type,id,name,meta){return `<button type="button" class="tv-modal-choice" data-tv-choice="${attr(id)}" data-tv-choice-type="${attr(type)}" data-tv-search="${attr(`${name} ${meta}`.toLowerCase())}"><b>${esc(name)}</b><small>${esc(meta||"")}</small></button>`;}
function bindChoiceSearch(){const input=document.querySelector("#tvModalSearch");if(!input)return;input.oninput=()=>{const q=input.value.trim().toLowerCase();document.querySelectorAll("#tvModalChoices [data-tv-choice]").forEach(x=>x.classList.toggle("hidden",q&&!String(x.dataset.tvSearch||"").includes(q)));};}
function fallbackTvContract(x){
  const events=Array.isArray(x.events)?x.events:[];
  return {version:"legacy",available:Boolean(x.available||events.length),items:events.map((e,i)=>({id:eventKey(e),missionId:e.missionId,reference:e.reference,type:e.kind||"event",headline:eventLabel(e),detail:e.detail||"",occurredAt:e.at||null,lifecycle:e.persistent?"active":"historical",priority:x.priority?.level||"low",progress:missionProgress(e.status||x.status),href:e.href||eventHref(e,x),actions:(e.actions||[]).map(a=>a.dismiss?{...a,kind:"dismiss"}:a.method==="POST"?{...a,kind:"command"}:{...a,kind:"navigate"}),persistent:Boolean(e.persistent),alert:Boolean(e.alert),icon:e.icon||priorityIcon(String(x.priority?.level||"low").toUpperCase())}))};
}
function eventLabel(e){
  if(e.kind==="assignment"&&e.assignment?.personal){
    const a=e.assignment,clock=a.pickupAt?formatTime(a.pickupAt):"",left=durationLeft(a.remainingMinutes);
    return `${a.assigningCompany} assigned you · ${a.route}${clock?` · pickup at ${clock}`:""}${left?` · ${left}`:""}`;
  }
  if(e.kind==="deadline"&&e.deadlineAt){
    const clock=formatTime(e.deadlineAt),left=Number(e.remainingMinutes);
    if(left>=0&&clock)return `${e.personal?"Your m":"M"}ission ${e.reference||e.missionId} deadline is at ${clock} (${left} minute${left===1?"":"s"} left)`;
  }
  return e.label||"Mission update";
}
function durationLeft(minutes){
  const n=Number(minutes);if(!Number.isFinite(n))return "";if(n<=0)return "pickup time reached";
  const h=Math.floor(n/60),m=n%60;if(h&&m)return `you have ${h}h ${m}m`;if(h)return `you have ${h}h`;return `you have ${m}m`;
}
function eventKey(e){return `${e.kind||"event"}:${e.code||""}:${e.missionId||0}:${e.at||""}`;}
function rememberDismissed(key){try{sessionStorage.setItem(`onmission:tv-dismiss:${key}`,"1");}catch{}}
function isDismissed(key){try{return sessionStorage.getItem(`onmission:tv-dismiss:${key}`)==="1";}catch{return false;}}
function eventHref(event,intelligence){if(event?.href)return event.href;const id=Number(event?.missionId||intelligence?.missionId||0);const m=[...lastItems].find(x=>Number(x?.missionId||x?.id)===id)||{};const publicMission=Number(m?.public_enabled||intelligence?.public_enabled||0)===1||Boolean(m?.shared_access||m?.sharedAccess||intelligence?.shared_access||intelligence?.sharedAccess)||String(m?.distribution_channel||intelligence?.distribution_channel||"").toLowerCase()==="foryou";return id?(publicMission&&String(focusSnapshot?.role||"admin")==="admin"?`/app#work?mission=${id}`:operationalMissionHref(id,{role:String(focusSnapshot?.role||"admin")})):"/foryou";}
function formatTimeAge(v){const out=formatRelativeTime(v);return out==="Never"?"now":out;}
function missionProgress(status){const flow=MISSION_STATUS_FLOW,values=[5,20,38,62,82,100];const i=flow.indexOf(canonicalMissionStatus(status));return i>=0?values[i]:0;}
function priorityIcon(v){return v==="CRITICAL"?"🚨":v==="HIGH"?"⚠️":v==="MEDIUM"?"⏳":"●";}

function renderSummary(){ /* TV is event-first; summary metrics are intentionally not rendered here. */ }
function renderList(){
  const box=root.querySelector("#attList");
  if(!lastItems.length){box.innerHTML='<div class="attention-empty"><span>✓</span><div><b>Operations clear</b><small>No active attention requires action.</small></div></div>';return;}
  const tenant=document.body.classList.contains("admin-shell"),limit=tenant?12:8;
  // Presentation-only convergence: one mission gets one attention card. The
  // underlying signals remain untouched; we simply surface the strongest
  // signal for each mission so the operator has one statement to read.
  const byMission=new Map();
  for(const x of lastItems){
    const id=Number(x?.missionId||0);
    const key=id?`m:${id}`:`item:${String(x?.id||x?.link||Math.random())}`;
    const existing=byMission.get(key);
    const rank=v=>({critical:4,attention:3,watch:2,normal:1}[String(v||"").toLowerCase()]||0);
    if(!existing||rank(x.level)>rank(existing.level)||Number(x.score||0)>Number(existing.score||0))byMission.set(key,x);
  }
  const rows=[...byMission.values()].sort((a,b)=>{
    const level={critical:4,attention:3,watch:2,normal:1};
    return (level[String(b.level||"").toLowerCase()]||0)-(level[String(a.level||"").toLowerCase()]||0)
      ||Number(b.score||0)-Number(a.score||0)
      ||new Date(b.updatedAt||b.at||0)-new Date(a.updatedAt||a.at||0);
  }).slice(0,limit);
  box.innerHTML=rows.map(x=>{
    const reasons=Array.isArray(x.reasons)?x.reasons:[];
    const reason=reasons[0]?.label||x.statusLabel||"Review mission condition";
    const secondary=reasons[1]?.label||"";
    const level=String(x.level||"watch").toLowerCase();
    const route=tenant&&((x.pickupCompany||x.deliveryCompany))?`<span class="attention-route"><strong>${esc(x.pickupCompany||"Pickup")}</strong><i>→</i><strong>${esc(x.deliveryCompany||"Delivery")}</strong></span>`:"";
    const deadline=x.deadlineAtUtc?`<span class="attention-meta">Deadline ${esc(formatDateTime(x.deadlineAtUtc))}</span>`:"";
    return `<a class="attention-item attention-item-smart level-${attr(level)}" href="${attr(x.link)}">
      <span class="attention-score ${attr(level)}">${Number(x.score||0)}</span>
      <span class="attention-main">
        <span class="attention-item-top"><b>${esc(x.reference||`Mission ${x.missionId||""}`)}</b><em>${esc(x.statusLabel||"ATTENTION")}</em></span>
        <strong class="attention-statement">${esc(reason)}</strong>
        ${secondary?`<small class="attention-secondary">${esc(secondary)}</small>`:""}
        ${route}${deadline}
      </span>
      <span class="attention-open">OPEN <b>→</b></span>
    </a>`;
  }).join("");
}
function prettyState(v){return String(v||"unknown").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function attr(v){return esc(v);}
