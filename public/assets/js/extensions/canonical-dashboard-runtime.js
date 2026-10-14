import {RELEASE_VERSION} from "/assets/js/core/release.js";
/* ON Mission 10.35.5 — Canonical Dashboard Runtime.
 * One UI system, one dashboard orchestration layer, role-specific presentation only.
 * Truth, authorization, lifecycle, custody, liveness and mutation remain server-authoritative.
 */
import {MISSION_STATUS_FLOW,isTerminalStatus,canonicalMissionStatus} from "../core/lifecycle-registry.js";
import {canonicalLivenessState,isLivenessBreach} from "../core/liveness-registry.js";
import {api,jsonOptions} from "../core/api.js";
import {executeAction as executeSecuredAction} from "./secured-action-execution.js";
import {contextsFor,contextMatches,contextCounts} from "./operational-contexts.js";
import {renderPeopleContext,renderRequestContext,missionContextDescription} from "../../ui/index.js";
import {renderMissionWorkbench} from "../../ui/index.js";
import {hasCanonicalAction,normalizeActionId} from "../core/action-registry.js";
const isCanonicalMissionAction=code=>hasCanonicalAction(code);
const openCanonicalMissionAction=async(host,missionId,actionCode)=>renderMissionWorkbench(host,missionId,normalizeActionId(actionCode));
import {canonicalActionId} from "../core/action-registry.js";
import {executeCanonicalObjectAction} from "../core/canonical-action-client.js";
import {executionComponent,livenessBadge,statusBadge} from "../../ui/index.js";
import {workspaceActions,firstExecutableWorkspaceAction,workspaceActionContext} from "../core/canonical-workspace-actions.js";
import {renderIfChanged,stateSignature,interaction,memoizePure} from "./runtime-render-efficiency.js";
import {reconcileRefresh,resilientRead} from "./runtime-resilience.js";
import {networkSnapshot,isNetworkOffline} from "../core/network-continuity.js";

/* ON Mission 10.35.5 — Canonical Frontend Runtime / People / Requests Context Model
 * One company surface. One universal workbench. One canonical action surface.
 * Presentation/orchestration only. Existing secured services remain authoritative.
 */
(() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num=v=>Number(v||0), txt=v=>String(v??"").trim(), low=v=>txt(v).toLowerCase();
  const terminal=v=>{const status=canonicalMissionStatus(v?.status||v?.missionStatus||v);return status==="Completed"||status==="Cancelled";}
  const idOf=x=>{const k=low(x?.kind||x?.type||"");if(k==="request"||k==="foryourequest"||k==="networkinvitation"||k==="network_invitation"||k==="trust")return num(x?.requestId||x?.request_id||x?.invitationId||x?.invitation_id||x?.id);if(k==="driver"||k==="executor")return num(x?.driverId||x?.id);if(k==="customer")return num(x?.customerId||x?.id);if(k==="partner")return num(x?.partnerId||x?.recipientId||x?.id);return num(x?.missionId||x?.mission_id||x?.id)};
  const kind=x=>low(x?.kind||x?.type||"mission");
  const key=x=>`${kind(x)}:${idOf(x)}`;
  const ref=x=>txt(x?.reference||x?.mission_reference||x?.title||x?.name||x?.company_name||x?.partner_company_name||`Record ${idOf(x)}`);
  const escAttr=esc;
  const state={area:"home",workRows:[],workQuery:"",workSelected:null,contextToken:0,contextQueueLimit:30,contextQueuePage:1,home:null,network:null,networkView:"partners",peopleRows:[],requestRows:[],workTab:"situation",workView:"all",busy:false,contexts:{missions:"all",people:"all",requests:"all"},loadSeq:{home:0,work:0,network:0,people:0,requests:0}};

  function shell(){return $("#tenantWorkspaceNav");}
  function setArea(area,{route=true}={}){area=area==="requests"?"work":area;if(state.nativeMissionWorkspace){try{state.nativeMissionWorkspace.unmount();}catch{} state.nativeMissionWorkspace=null;} state.area=area; if(route){const hash=`#operations?section=${encodeURIComponent(area)}`;if(location.hash!==hash)history.pushState({onMission:true,section:area},"",hash); } state.contextQueuePage=1; $$('[data-exp-area]').forEach(b=>{const a=b.dataset.expArea===area;b.classList.toggle("active",a);b.setAttribute("aria-current",a?"page":"false")});$$('[data-exp-panel]').forEach(p=>{const a=p.dataset.expPanel===area;p.hidden=!a;p.classList.toggle("active",a)}); renderContextQueue(); if(area==="home")loadHome(); if(area==="work")loadWork(); if(area==="network")loadNetwork(); if(area==="people")loadPeople(); if(area==="objects")window.dispatchEvent(new Event("onmission:universalization-objects")); if(area==="requests")loadRequests(); if(area==="insights")loadInsights(); if(area==="find")focusFind();}
  function navigate(intent){
    const map={home:"home",work:"work",network:"network",people:"people",objects:"objects",requests:"requests",find:"find",insights:"insights"};
    setArea(map[intent]||"home");
  }
  function contextStart(x){state.contextToken++;state.workSelected={...x};return state.contextToken;}
  function current(x,t){return t===state.contextToken&&state.workSelected&&key(state.workSelected)===key(x);}
  async function readApi(url,fallback={},timeoutMs=10000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{return await api(url,{signal:controller.signal});}
    catch(e){return {...fallback,__readError:e?.name==="AbortError"?"TIMEOUT":(e?.message||"READ_FAILED")};}
    finally{clearTimeout(timer);}
  }
  function showWorkbenchError(message){
    const root=$("#workbench");if(!root)return;
    root.innerHTML=`<div class="wb-empty wb-error"><strong>Current situation could not be read completely.</strong><span>${esc(message||"Refresh and try again.")}</span><button type="button" class="wb-primary" data-work-retry>RETRY</button><button type="button" data-wb-back>BACK TO WORK</button></div>`;
    $("[data-work-retry]")?.addEventListener("click",()=>{const x=state.workSelected;if(x)openWork(x);});
    $("[data-wb-back]")?.addEventListener("click",()=>{state.workSelected=null;renderWorkQueue();});
  }
  async function recomputeSelected(x,token=state.contextToken){
    if(!current(x,token))return;
    if(kind(x)!=="mission")return;
    await loadWork();
    if(!current(x,token))return;
    const fresh=state.workRows.find(r=>kind(r)==="mission"&&idOf(r)===idOf(x))||x;
    state.workSelected={...fresh};
    await renderMissionWorkbench($("#workbench"),idOf(fresh),normalizeActionId(fresh?._actionCenterCode||""));
  }

  async function loadCompanySnapshot(){
    if(isNetworkOffline()){window.dispatchEvent(new CustomEvent("onmission:network-deferred",{detail:networkSnapshot()}));return state.home||{work:[],attention:0,requests:0,network:{},risk:0,interventions:0};}
    const today=new Date().toLocaleDateString("en-CA");
    const results=await Promise.allSettled([
      api(`/api/tenant/overview?date=${today}`),api(`/api/operations/command?limit=100&includeMissions=1`),api(`/api/public/requests/count`),
      api(`/api/operations/multi-mission?limit=100`),api(`/api/operations/coordination-mesh?limit=100`),api(`/api/operations/temporal-coordination?limit=100`),
      api(`/api/attention?limit=20`),api(`/api/network/summary`)
    ]);
    const v=i=>results[i]?.status==="fulfilled"?results[i].value||{}:{};
    const command=v(1), coord=v(3)?.coordination||null, mesh=v(4)?.mesh||null, temporal=v(5)?.temporalCoordination||null;
    const work=Array.isArray(command.work)?command.work:Array.isArray(command.focusQueue)?command.focusQueue:[];
    const attention=num(v(6)?.summary?.total), requests=num(v(2)?.pending??v(2)?.count), network=v(7)?.summary||{};
    const risk=work.filter(x=>/overdue|breach|critical|blocked|at risk|risk/i.test(`${x?.status||""} ${x?.reason||""} ${x?.level||""}`)).length;
    const interventions=work.filter(x=>/actionable|intervention|overdue|breach|blocked|critical/i.test(JSON.stringify(x))).length;
    state.home={work,attention,requests,network,risk,interventions,coord,mesh,temporal,intelligence:v(6)?.intelligence||null};
    return state.home;
  }
  async function loadHome(){
    const h=await loadCompanySnapshot();
    const hour=new Date().getHours(),greeting=hour<5?"Good evening":hour<12?"Good morning":hour<18?"Good afternoon":"Good evening";
    const companyEl=$("#companyName"); if(companyEl?.parentElement) companyEl.parentElement.firstChild.textContent=greeting+", ";
    const work=h.work||[], attentionRows=(h.attentionItems||[]);
    const situation=h.interventions?`${h.interventions} item${h.interventions===1?"":"s"} need intervention.`:h.requests?`${h.requests} network request${h.requests===1?" is":"s are"} waiting.`:h.attention?`${h.attention} item${h.attention===1?"":"s"} need${h.attention===1?"s":""} attention.`:"Operations are stable.";
    $("#homeSituation").textContent=situation;
    $("#homeSituationMeta").textContent=`${h.risk} at risk · ${h.requests} requests · ${num(h.network?.trusted)} trusted network relationships`;
    const set=(id,v)=>{const el=$(id);if(el)el.textContent=String(v);};
    const status=x=>low(x?.status||x?.lifecycle||x?.state||x?.missionStatus||x?.currentStatus||"");
    const waiting=work.filter(x=>/waiting|awaiting|pending|hold|paused|blocked/.test(status(x)+" "+low(x?.reason||x?.nextAction||""))).length;
    const done=work.filter(x=>/completed|complete|delivered|cancelled|canceled|closed|terminated|archived/.test(status(x))).length;
    const active=Math.max(0,work.length-done-waiting);
    const missionCount=work.filter(x=>kind(x)==="mission").length;
    set("#homeTodayActive",active);set("#homeTodayWaiting",waiting);set("#homeTodayDone",done);
    set("#homePulseMissions",missionCount);set("#homePulseExecutors",h.network?.executors||h.network?.drivers||0);set("#homePulseNetwork",num(h.network?.trusted||h.network?.relationships||0));
    const m=h.mesh?.mesh||{};
    const needs=work.filter(x=>!terminal(x)).slice(0,3);
    const intel=h.intelligence||{},smart=txt(intel?.focus?.reason||intel?.finalOperationalProduct?.headline||intel?.health?.summary||"");
    $("#homeNeeds").innerHTML=(smart?`<div class="home-intelligence"><span>ON MISSION INTELLIGENCE</span><strong>${esc(smart)}</strong><small>${esc(intel?.priority?.level?`Priority: ${intel.priority.level} · Focus: ${intel.focus?.available?"ready":"review"}.`:"Current operational signals are being evaluated.")}</small></div>`:"")+(needs.map(x=>`<button type="button" class="attention-item" data-home-mission="${num(x.missionId||x.id)}"><span class="dot" aria-hidden="true"></span><span><strong>${esc(ref(x))}</strong><small>${esc(txt(x.reason||x.subtitle||x.status||"Needs attention"))}</small></span><b>${esc(txt(x.nextAction||x.actionLabel||x.expectedNext||"OPEN"))}</b></button>`).join("")||'<div class="empty">Nothing currently requires intervention.</div>');
    // Coordination presentation is intentionally owned by Network after the Home simplification.
  }

  function renderContextTabs(domain,items){
    const host=$(domain==="missions"?"#missionContextTabs":domain==="people"?"#peopleContextTabs":"#requestContextTabs");
    if(!host)return;
    const contexts=contextsFor(domain),counts=contextCounts(domain,items);
    host.innerHTML=contexts.map(c=>`<button type="button" class="context-tab ${state.contexts[domain]===c.id?"active":""}" data-context-domain="${c.id==='all'?'':domain}" data-context-id="${escAttr(c.id)}">${esc(c.label)} <b>${counts[c.id]||0}</b></button>`).join("");;if(domain==="missions"){const d=$("#missionContextDescription");if(d){const c=contexts.find(v=>v.id===state.contexts[domain])||contexts[0];d.textContent=missionContextDescription(c.id);}}
    $$('[data-context-id]',host).forEach(b=>b.onclick=()=>{state.contexts[domain]=b.dataset.contextId;renderContextTabs(domain,items);if(domain==="missions")renderWorkQueue();else if(domain==="people")loadPeople();else loadRequests();});
  }
  function filteredDomainRows(domain,items){const id=state.contexts[domain]||"all";return (items||[]).filter(x=>contextMatches(domain,id,x));}
  async function performLoadWork(){
    const seq=++state.loadSeq.work;
    return resilientRead("dashboard:work",async signal=>{
    const [command,missions,requests,drivers,customers,partners,networkMissions,coordination]=await Promise.all([
      api("/api/operations/command?limit=100&includeMissions=1",{signal}).catch(()=>({})),api("/api/missions?limit=100&projection=mission-role-queue",{signal}).catch(()=>({missions:[]})),api("/api/public/requests",{signal}).catch(()=>({requests:[]})),
      api("/api/drivers",{signal}).catch(()=>({drivers:[]})),api("/api/network/customers?all=1",{signal}).catch(()=>({customers:[]})),api("/api/network/execution-partners",{signal}).catch(()=>({partners:[]})),api("/api/network/missions",{signal}).catch(()=>({missions:[]})),api("/api/operations/multi-mission?limit=100",{signal}).catch(()=>({coordination:null}))
    ]);
    if(seq!==state.loadSeq.work){return state.workRows;}
    const rows=[]; const add=(arr,k)=>Array.isArray(arr)&&arr.forEach(x=>rows.push({...x,kind:k}));
    add(command.work||command.focusQueue,"mission");add(command.missions,"mission");add(missions.missions,"mission");add(requests.requests,"request");add(networkMissions.missions,"mission");
    const map=new Map();rows.forEach(x=>{const k=key(x);if(!idOf(x)||map.has(k))return;map.set(k,x)});const cp=coordination?.coordination||null;const reason=cp?.nextBestWork?.reason||"";state.workRows=[...map.values()].map(x=>kind(x)==="mission"&&reason?{...x,coordinationReason:reason}:x);renderContextTabs("missions",state.workRows.filter(x=>kind(x)==="mission"));renderWorkQueue();return state.workRows;
    },{maxAttempts:3,deferOffline:true,offlineWaitMs:8000});
  }
  function loadWork(){return reconcileRefresh("dashboard:work-refresh",performLoadWork);}
  function workRows(){const q=low(state.workQuery);if(!q)return state.workRows;return state.workRows.filter(x=>JSON.stringify(x).toLowerCase().includes(q));}
  function queueMeta(){return {home:{title:"Home",kicker:"HOME",placeholder:"Search home",empty:"Nothing currently needs attention."},work:{title:"Work",kicker:"WORK",placeholder:"Search work",empty:"No current work matches this view."},network:{title:"Network",kicker:"NETWORK",placeholder:"Search network",empty:"No network objects in this view."},objects:{title:"Objects",kicker:"OBJECTS",placeholder:"Search objects",empty:"No objects in this context."},people:{title:"People",kicker:"PEOPLE",placeholder:"Search people",empty:"No people in this context."},requests:{title:"Requests",kicker:"REQUESTS",placeholder:"Search requests",empty:"No requests in this context."},insights:{title:"Insights",kicker:"INSIGHTS",placeholder:"Search signals",empty:"No insight signals available."},find:{title:"Find",kicker:"FIND",placeholder:"Search anything",empty:"No matching objects."}}[state.area]||{title:"Queue",kicker:"QUEUE",placeholder:"Search",empty:"No objects."};}
  function workViewMatch(x){const s=low(x?.status||x?.lifecycle||x?.state||x?.missionStatus||x?.currentStatus||"");const a=low(x?.nextAction||x?.actionLabel||x?.reason||"");const terminal=/completed|complete|delivered|cancelled|canceled|closed|terminated|archived/.test(s);const waiting=/waiting|awaiting|pending|hold|paused|blocked/.test(s+" "+a);const active=/active|progress|transit|pickup|delivery|executing|running/.test(s+" "+a);const needs=/actionable|needs|assign|attention|overdue|breach|critical|intervention|required/.test(s+" "+a);switch(state.workView){case"needs":return !terminal&&needs;case"active":return !terminal&&active&&!waiting;case"waiting":return !terminal&&waiting;case"done":return terminal;default:return true;}}
  function contextQueueRows(){const area=state.area;if(area==="work"){if(state.objectMode&&state.workSelected)return [state.workSelected];return workRows().filter(x=>(kind(x)==="mission"||kind(x)==="request")&&workViewMatch(x)&&(kind(x)!=="mission"||contextMatches("missions",state.contexts.missions,x)));}if(area==="network")return networkItems(state.networkView).map(x=>({...x,kind:state.networkView==="partners"?"partner":state.networkView==="customers"?"customer":state.networkView==="requests"?"request":state.networkView==="trust"?"partner":"mission"})).filter(x=>idOf(x));if(area==="people")return filteredDomainRows("people",state.peopleRows);return [];}
  function queueObjectClick(x){if(!x)return;const k=kind(x);if(["mission","request","driver","executor","customer","partner"].includes(k)){state.objectMode=true;state.objectOrigin=state.area;navigate("work");openWork(x);}}
  function renderContextQueue(){const host=state.area==="work"?$("#workQueueHost"):$("#contextQueue");const search=state.area==="work"?$("#workQueueSearch"):$(`#railContextSearchInput`);if(!host)return;const meta=queueMeta();if(search){search.placeholder=meta.placeholder;search.value=state.area==="work"?state.workQuery:(state.contextQueueQuery||"");}let rows=contextQueueRows();const q=low(state.area==="work"?state.workQuery:state.contextQueueQuery);if(q)rows=rows.filter(x=>JSON.stringify(x).toLowerCase().includes(q));const limit=Math.max(1,Number(state.contextQueueLimit||30)),page=Math.max(1,Number(state.contextQueuePage||1)),visible=rows.slice(0,limit*page),hasMore=visible.length<rows.length;renderIfChanged(host,stateSignature({area:state.area,query:q,page,limit,selected:key(state.workSelected||{}),rows:visible.map(x=>({k:key(x),s:x.status,r:x.reason,a:x.nextAction}))}),()=>{host.innerHTML=(visible.map(x=>{const actions=workspaceActions(x),primary=firstExecutableWorkspaceAction(x);const actionLabel=primary?.label||"OPEN";return `<article class="work-queue-item ${state.workSelected&&key(state.workSelected)===key(x)?"active":""}" data-context-object-key="${escAttr(key(x))}"><button type="button" class="wqi-open" data-context-object-key="${escAttr(key(x))}"><span class="wqi-type">${esc(kind(x).replace(/_/g," "))}</span><strong>${esc(ref(x))}</strong><small>${esc(txt(x?.reason||x?.coordinationReason||x?.nextAction||x?.status||x?.city||x?.email||"Current context"))}</small></button><div class="wqi-actions">${primary?`<button type="button" class="wqi-action ${primary.danger?"danger":"wb-primary"}" data-queue-action="${escAttr(primary.code)}" data-queue-key="${escAttr(key(x))}">${esc(actionLabel)}</button>`:`<button type="button" class="wqi-action" data-context-object-key="${escAttr(key(x))}">MANAGE</button>`}</div></article>`;}).join("")||`<div class="empty">${esc(meta.empty)}</div>`)+(hasMore?`<button type="button" class="queue-load-more" data-context-queue-more>SHOW MORE · ${esc(String(Math.min(limit,rows.length-visible.length)))} MORE</button>`:"");});syncRail();}
  function actionCodeFor(x){return txt(x?.actionCode||x?.action_code||x?.primaryActionCode||x?.primary_action_code||x?.nextActionCode||x?.next_action_code||x?.action?.code||x?.nextAction?.code||x?.next_action?.code);}
  function actionCenterRows(){
    const rows=state.workRows.filter(x=>kind(x)==="mission"&&!terminal(x));
    const scored=memoizePure("action-center",rows.map(x=>({k:key(x),status:x?.status,reason:x?.reason,nextAction:x?.nextAction,actionLabel:x?.actionLabel})),()=>rows.map(x=>{const text=low(`${x?.reason||""} ${x?.nextAction||x?.actionLabel||""} ${x?.status||""}`);let score=0;if(/critical|breach/.test(text))score+=100;if(/overdue/.test(text))score+=80;if(/blocked|intervention|required|attention/.test(text))score+=50;if(/waiting|awaiting/.test(text))score-=20;return {...x,__actionScore:score};}).sort((a,b)=>b.__actionScore-a.__actionScore));
    return scored.slice(0,1);
  }
  function renderActionCenter(){
    const host=$("#actionCenterHost");if(!host)return;const rows=actionCenterRows();
    host.innerHTML=rows.length?rows.map(x=>{const code=canonicalActionId(actionCodeFor(x))||"open_mission";const label=txt(x?.nextAction||x?.actionLabel||x?.expectedNext||"Review mission");const reason=txt(x?.reason||x?.coordinationReason||x?.status||"Current mission needs review");return `<button type="button" class="action-center-item" data-action-center-mission="${num(x.missionId||x.id)}" data-action-center-code="${escAttr(code)}"><span><strong>${esc(ref(x))}</strong><small>${esc(reason)}</small></span><b>${esc(label)} →</b></button>`;}).join(""):'<div class="action-center-empty">No current action requires intervention.</div>';
  }
  function renderWorkQueue(){renderContextQueue();renderActionCenter();}
  function syncRail(){const r=$("#railWorkCount");if(r)r.textContent=String(contextQueueRows().length);const c=$("#workQueueCount");if(c)c.textContent=String(contextQueueRows().length);}
  function loadMoreContextQueue(){state.contextQueuePage=Math.max(1,Number(state.contextQueuePage||1)+1);renderContextQueue();}
  function filterContextQueue(){state.contextQueuePage=1;const q=low($(state.area==="work"?"#workQueueSearch":"#railContextSearchInput")?.value);if(state.area==="work")state.workQuery=q;else if(state.area==="find"){const g=$("#globalFindInput");if(g)g.value=q;}else state.contextQueueQuery=q;renderContextQueue();}
  async function openWork(x){
    if(kind(x)==="mission"&&idOf(x)){
      const mid=idOf(x),action=normalizeActionId(x?._actionCenterCode||"");
      const params=new URLSearchParams({mission:String(mid),view:action?"actions":"situation"});
      if(action)params.set("action",action);
      const hash=`#operations?${params.toString()}`;
      if(location.hash!==hash)history.pushState({onMission:true,missionId:mid,view:action?"actions":"situation",action:action||null},"",hash);
    }
    if(state.nativeMissionWorkspace){try{state.nativeMissionWorkspace.unmount();}catch{} state.nativeMissionWorkspace=null;}
    const token=contextStart(x); renderWorkQueue(); $("#workbench").innerHTML='<div class="wb-loading">Reading current situation…</div>';
    try{
      if(kind(x)==="mission"&&idOf(x)){await renderMissionWorkbench($("#workbench"),idOf(x),normalizeActionId(x?._actionCenterCode||""));return}
      if(kind(x)==="request"){await requestWorkbench(x,token);return}
      if(kind(x)==="driver"){await driverWorkbench(x,token);return}
      if(kind(x)==="customer"){await customerWorkbench(x,token);return}
      if(kind(x)==="partner"){await partnerWorkbench(x,token);return}
      throw new Error("This work object has no supported workbench.");
    }catch(e){if(current(x,token))showWorkbenchError(e?.message||"Refresh and try again.");}
  }

  function wbNav(tabs){return `<nav class="wb-tabs">${tabs.map((x,i)=>`<button type="button" class="${i===0?"active":""}" data-wb-tab="${escAttr(x)}">${esc(x)}</button>`).join("")}</nav>`}
  function bindTabs(){
    $$("[data-wb-tab]",$("#workbench")).forEach(b=>b.addEventListener("click",()=>{$$("[data-wb-tab]",$("#workbench")).forEach(x=>x.classList.toggle("active",x===b));$$("[data-wb-pane]",$("#workbench")).forEach(p=>p.hidden=p.dataset.wbPane!==b.dataset.wbTab)}));
  }
  function fact(label,value){return `<div class="wb-fact"><span>${esc(label)}</span><strong>${esc(value||"—")}</strong></div>`}
  function statusLine(label,value){return `<div class="wb-status-line"><span>${esc(label)}</span><strong>${esc(value||"—")}</strong></div>`}
  function currentNeed(m,context){
    const readiness=context?.operationalReadiness||context?.context?.operationalReadiness||{};
    const next=readiness?.next?.label||context?.canonicalCapability?.label||m?.next_action||m?.nextAction||"Review current situation";
    const responsibility=context?.canonicalResponsibility?.responsible?.name||context?.canonicalResponsibility?.responsibleActor?.name||"Not established";
    const waiting=readiness?.waiting?.isActive?`Waiting for ${readiness.waiting.actor?.name||"responsible actor"}`:"No active waiting condition";
    return {next,responsibility,waiting,state:readiness?.readiness?.state||"CURRENT",execution:readiness?.execution?.state||"NOT_ESTABLISHED",risk:readiness?.risk?.label||readiness?.risk?.code||"No material risk"};
  }

  function openActionWorkspace(action,x){
    const id=idOf(x), label=action?.label||action?.code||"Action";
    const hint=action?.hint||action?.reason||"This action will be checked again against the current mission state before anything changes.";
    const high=String(action?.confirmation||"").toLowerCase()==="strong";
    $("#workbench").innerHTML=`<div class="wb-card action-workspace"><header class="wb-context-head"><div><span>ACTION WORKSPACE</span><h2>${esc(label)}</h2><p>${esc(ref(x))}</p></div><button type="button" data-action-back>BACK</button></header><div class="wb-grid">${fact("Action",label)}${fact("Mission",ref(x))}${fact("Impact",high?"High consequence — final service validation required":"Contextual operational change")}</div><p class="action-workspace-hint">${esc(hint)}</p><div class="wb-actions"><button type="button" class="wb-primary" data-action-approve>CONTINUE</button><button type="button" data-action-cancel>BACK</button></div><span id="wbFeedback"></span></div>`;
    $("[data-action-back]").onclick=$("[data-action-cancel]").onclick=()=>openWork(x);
    $("[data-action-approve]").onclick=async ev=>{const button=ev.currentTarget;button.disabled=true;try{const changed=await executeObjectAction({...action,__workspaceApproved:true},x);if(changed)await recomputeSelected(x,state.contextToken);}catch(e){$("#wbFeedback").textContent=e?.message||"The action could not be completed.";button.disabled=false;}};
  }

  async function executeObjectAction(action,x){
    const k=kind(x),code=canonicalActionId(action?.code);
    if(!code)throw new Error("This object action is not registered in the canonical Action Registry.");
    const id=idOf(x);
    if(k==="request"||k==="foryourequest")return requestWorkbench({...x,kind:"mission"},state.contextToken);
    const context={
      personId:(k==="driver"||k==="executor")?id:undefined,
      customerId:k==="customer"?id:undefined,
      partnerId:k==="partner"?id:undefined,
      relationshipId:(k==="partner"||k==="trust")?num(x.trustId||x.relationshipId):undefined,
      expectedUpdatedAt:action?.stateToken||undefined,
      payload:action?.input&&typeof action.input==="object"?action.input:{}
    };
    await executeCanonicalObjectAction(code,context);
    if(k==="driver"||k==="executor"){await loadPeople();return false;}
    if(k==="customer"){await loadPeople();return false;}
    if(k==="partner"||k==="trust"){await loadNetwork();return false;}
    throw new Error(`Unsupported work object: ${k}`);
  }

  async function requestWorkbench(x,token){
    const rid=idOf(x), networkInvitation=kind(x)==="networkinvitation"||kind(x)==="network_invitation"||Boolean(x?.invitation_id);
    const mid=num(x.mission_id||x.missionId);
    if(!mid){
      $("#workbench").innerHTML=`<div class="wb-card"><h3>Request</h3><p>This request is not linked to a mission workspace.</p></div>`;return;
    }
    const action=networkInvitation
      ? (low(x.status)==="pending"?"accept_network":"")
      : (low(x.status)==="pending"?"approve_foryou_request":"");
    const detail=networkInvitation
      ? `This invitation will be reviewed and executed inside the mission workspace.`
      : `This execution request will be reviewed and decided inside the mission workspace.`;
    $("#workbench").innerHTML=`<div class="wb-card"><header class="wb-context-head"><div><span>${networkInvitation?"TRUSTED NETWORK INVITATION":"EXECUTION REQUEST"}</span><h2>${esc(x.mission_reference||ref(x)||`Mission ${mid}`)}</h2><p>${esc(x.owner_company_name||x.requester_company_name||x.requester_name||"Mission participant")}</p></div><button type="button" data-request-back>WORK</button></header><div class="wb-grid">${fact("Status",x.status||"Pending")}${fact("Mission",x.mission_reference||mid)}${fact(networkInvitation?"From":"Requester",x.owner_company_name||x.requester_company_name||x.requester_name||"—")}${fact("Type",networkInvitation?"Trusted Network":"ForYou")}</div><p class="wb-note">${detail}</p><div class="wb-actions"><button type="button" class="wb-primary" data-request-open-canonical>OPEN MISSION WORKSPACE</button><button type="button" data-request-back>BACK</button></div></div>`;
    $$('[data-request-back]').forEach(b=>b.onclick=()=>{state.workSelected=null;renderWorkQueue();});
    $("[data-request-open-canonical]").onclick=()=>openWork({...x,kind:"mission",_actionCenterCode:action});
  }

  async function openCommunicationWorkspace(x){
    const id=Number(x?.driverId||x?.id||0)||0;
    if(!id)return;
    const name=ref(x)||"Executor";
    const load=async()=>{
      const box=$("#directMessageList");
      if(!box)return;
      try{
        const d=await api(`/api/drivers/${id}/direct-messages`);
        const rows=Array.isArray(d?.messages)?d.messages:[];
        box.innerHTML=rows.slice(-50).map(m=>`<article class="history-row"><strong>${esc(m.sender_name||m.sender_role||"Message")}</strong><span>${esc(m.message||"")}</span><small>${esc(m.created_at||"")}</small></article>`).join("")||'<div class="empty">No direct messages yet.</div>';
      }catch(e){box.innerHTML=`<div class="empty">${esc(e?.message||"Messages are unavailable.")}</div>`;}
    };
    $("#workbench").innerHTML=`<header class="wb-context-head"><div><span>PEOPLE</span><h2>${esc(name)}</h2><p>Direct communication with this executor.</p></div><button type="button" data-wb-back>WORK</button></header><div class="wb-card"><div id="directMessageList">Loading…</div><form id="directMessageForm" class="wb-form"><textarea name="message" maxlength="2000" required placeholder="Write a message…"></textarea><button class="wb-primary" type="submit">SEND MESSAGE</button><button type="button" id="directMessageBack">BACK</button><span id="wbFeedback"></span></form></div>`;
    $("[data-wb-back]").onclick=()=>{state.workSelected=null;renderWorkQueue();};
    $("#directMessageBack").onclick=()=>driverWorkbench(x);
    $("#directMessageForm").onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;const button=form.querySelector("button[type=submit]");const message=String(new FormData(form).get("message")||"").trim();if(!message)return;button.disabled=true;try{await executeCanonicalObjectAction("message_executor",{personId:id,payload:{message}});form.reset();await load();$("#wbFeedback").textContent="Message sent.";}catch(err){$("#wbFeedback").textContent=err?.message||"Message could not be sent.";}finally{button.disabled=false;}};
    await load();
  }

  async function driverWorkbench(x){const id=idOf(x);const d=await api(`/api/drivers/${id}/overview?history=1`).catch(()=>({driver:x}));const v=d?.driver||x;
    $("#workbench").innerHTML=`<header class="wb-context-head"><div><span>PEOPLE</span><h2>${esc(v.name||ref(v))}</h2><p>Executor relationship management.</p></div><button data-wb-back>WORK</button></header><div class="wb-card"><div class="wb-grid">${fact("Status",num(v.active)!==0?"Active":"Disabled")}${fact("Username",v.username)}${fact("Current work",v.active_mission_count||v.activeMissionCount)}${fact("Person ID",id)}</div><div class="wb-actions"><button data-driver-edit class="wb-primary">EDIT PROFILE</button><button data-driver-toggle>${num(v.active)!==0?"DISABLE":"ENABLE"}</button><button data-driver-message>MESSAGE</button><button data-driver-remove class="danger">REMOVE EXECUTOR</button></div><span id="wbFeedback"></span></div>`;
    $("[data-wb-back]").onclick=()=>{state.workSelected=null;renderWorkQueue()};
    $("[data-driver-edit]").onclick=()=>{$("#workbench").innerHTML=`<div class="wb-card"><h3>Edit executor</h3><form id="driverEditForm" class="wb-form"><input name="name" value="${escAttr(v.name||"")}" required><button class="wb-primary">SAVE</button><button type="button" id="driverEditBack">BACK</button><span id="wbFeedback"></span></form></div>`;$("#driverEditBack").onclick=()=>driverWorkbench(x);$("#driverEditForm").onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(e.currentTarget));await executeCanonicalObjectAction("edit_driver",{personId:id,payload:data});await loadPeople();const row=state.workRows.find(z=>kind(z)==="driver"&&idOf(z)===id);if(row)openWork(row);}catch(e){$("#wbFeedback").textContent=e.message;}}};
    $("[data-driver-toggle]").onclick=async()=>{try{await executeCanonicalObjectAction("toggle_driver_status",{personId:id,payload:{active:num(v.active)===0}});await loadPeople();const row=state.workRows.find(z=>kind(z)==="driver"&&idOf(z)===id);if(row)openWork(row);}catch(e){$("#wbFeedback").textContent=e.message;}};
    $("[data-driver-message]").onclick=()=>openCommunicationWorkspace(x);
    $("[data-driver-remove]").onclick=async()=>{const b=$("[data-driver-remove]");if(!confirm(`Remove ${v.name||"this executor"} from active People?`))return;b.disabled=true;try{await executeObjectAction({code:"remove_driver"},x);await loadPeople();navigate("people");}catch(e){b.disabled=false;$("#wbFeedback").textContent=e?.message||"Executor could not be removed.";}};
  }
  async function customerWorkbench(x){const id=idOf(x);const l=await readApi(`/api/network/customers/${id}/locations`,{locations:[]});const locations=Array.isArray(l?.locations)?l.locations:[];
    $("#workbench").innerHTML=`<header class="wb-context-head"><div><span>NETWORK</span><h2>${esc(ref(x))}</h2><p>Customer relationship and locations.</p></div><button data-wb-back>WORK</button></header><div class="wb-card"><div class="wb-grid">${fact("Reference",x.customer_reference||x.reference)}${fact("Contact",x.contact_name)}${fact("Email",x.email)}${fact("Phone",x.phone)}${fact("Locations",locations.length)}${fact("Status",x.status||"active")}</div><h3>Locations</h3>${locations.map(z=>`<div class="history-row"><strong>${esc(z.label||"Location")}</strong><span>${esc(z.address||"")}</span></div>`).join("")||'<div class="empty">No locations recorded.</div>'}<div class="wb-actions"><button data-customer-edit class="wb-primary">EDIT CUSTOMER</button><button data-customer-location>ADD LOCATION</button><button data-customer-archive class="danger">ARCHIVE CUSTOMER</button><button data-customer-delete class="danger">DELETE CUSTOMER</button></div><span id="wbFeedback"></span></div>`;
    $("[data-wb-back]").onclick=()=>{state.workSelected=null;renderWorkQueue()};
    $("[data-customer-location]").onclick=()=>{$("#workbench").innerHTML=`<div class="wb-card"><h3>Add customer location</h3><form id="customerLocationForm" class="wb-form"><input name="label" placeholder="Location label" required><input name="address" placeholder="Address" required><input name="accessFrom" type="time"><input name="accessTo" type="time"><button class="wb-primary">ADD LOCATION</button><button type="button" id="customerLocBack">BACK</button><span id="wbFeedback"></span></form></div>`;$("#customerLocBack").onclick=()=>customerWorkbench(x);$("#customerLocationForm").onsubmit=async e=>{e.preventDefault();try{const z=Object.fromEntries(new FormData(e.currentTarget));await executeCanonicalObjectAction("add_customer_location",{customerId:id,payload:{...z,companyName:x.company_name||x.name||"Customer"}});await customerWorkbench(x);}catch(e){$("#wbFeedback").textContent=e.message;}}};
    $("[data-customer-edit]").onclick=()=>{
      $("#workbench").innerHTML=`<div class="wb-card"><h3>Edit customer</h3><form id="customerEditForm" class="wb-form"><input name="companyName" value="${escAttr(x.company_name||x.name||"")}" placeholder="Customer company" required><input name="contactName" value="${escAttr(x.contact_name||"")}" placeholder="Contact name"><input name="email" type="email" value="${escAttr(x.email||"")}" placeholder="Email"><input name="phone" value="${escAttr(x.phone||"")}" placeholder="Phone"><input name="address" value="${escAttr(x.address||"")}" placeholder="Address"><input name="customerReference" value="${escAttr(x.customer_reference||"")}" placeholder="Customer reference"><textarea name="notes" maxlength="1000" placeholder="Notes">${esc(x.notes||"")}</textarea><button class="wb-primary">SAVE</button><button type="button" id="customerEditBack">BACK</button><span id="wbFeedback"></span></form></div>`;
      $("#customerEditBack").onclick=()=>customerWorkbench(x);
      $("#customerEditForm").onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));try{await executeObjectAction({code:"edit_customer" ,input:{payload:data}},x);await loadNetwork();const fresh=(state.network?.customers||[]).find(z=>idOf({...z,kind:"customer"})===id);if(fresh)customerWorkbench(fresh);else navigate("network");}catch(err){$("#wbFeedback").textContent=err?.message||"Customer could not be updated.";}};
    };
    $("[data-customer-archive]").onclick=async()=>{const b=$("[data-customer-archive]");b.disabled=true;try{await executeObjectAction({code:"archive_customer",confirmation:"strong"},x);await loadNetwork();navigate("network");}catch(e){b.disabled=false;$("#wbFeedback").textContent=e?.message||"Customer could not be archived.";}};
    $("[data-customer-delete]").onclick=async()=>{const confirmation=prompt(`Type DELETE or the exact customer reference to permanently delete ${ref(x)}.`);if(!confirmation)return;const b=$("[data-customer-delete]");b.disabled=true;try{await executeObjectAction({code:"delete_customer",input:{payload:{confirmation}}},x);await loadNetwork();navigate("network");}catch(e){b.disabled=false;$("#wbFeedback").textContent=e?.message||"Customer could not be deleted.";}};
  }
  async function partnerWorkbench(x){
    const rel=await readApi("/api/network/tenant-trust",{relationships:[]});
    const rows=rel.relationships||[],r=rows.find(z=>num(z.partner_company_id)===num(x.partnerId||x.recipientId||x.id)||num(z.id)===num(x.trustId))||{};
    const current={...x,kind:"partner",partnerId:num(x.partnerId||x.recipientId||x.id),trustId:num(r.id)||undefined,status:r.status||x.status||"none"};
    const actions=workspaceActions(current);
    const buttons=actions.map(a=>`<button type="button" class="${a.danger?"danger":"wb-primary"}" data-partner-action="${escAttr(a.code)}">${esc(a.label)}</button>`).join("");
    $("#workbench").innerHTML=`<header class="wb-context-head"><div><span>NETWORK</span><h2>${esc(ref(current))}</h2><p>Partner relationship and trust control.</p></div><button data-wb-back>WORK</button></header><div class="wb-card"><div class="wb-grid">${fact("Relationship",current.status)}${fact("Type",current.recipientType||"Execution partner")}${fact("Partner ID",current.partnerId)}</div><div class="wb-actions">${buttons||'<span class="empty">No valid relationship action is available in the current state.</span>'}</div><span id="wbFeedback"></span></div>`;
    $("[data-wb-back]").onclick=()=>{state.workSelected=null;renderWorkQueue()};
    $$('[data-partner-action]').forEach(b=>b.addEventListener('click',async()=>{const code=b.dataset.partnerAction;b.disabled=true;try{if(["request_trust","accept_trust","reject_trust","suspend_trust"].includes(code)){if(code==="suspend_trust"||code==="reject_trust")openActionWorkspace({code,label:workspaceActions(current).find(a=>a.code===code)?.label||code,confirmation:"strong"},current);else{await executeCanonicalObjectAction(code,workspaceActionContext(current,{code}));await loadNetwork();await partnerWorkbench(current);}}else throw new Error("Unsupported relationship action.");}catch(e){b.disabled=false;$("#wbFeedback").textContent=e?.message||"Action failed";}}));
  }
  async function loadNetwork(){
    const [summary,coordination,mesh,partners,customers,missions,invitations,trust,forYou,publicMissions,requests]=await Promise.all([
      api("/api/network/summary").catch(()=>({summary:{}})),api("/api/operations/multi-mission?limit=100").catch(()=>({coordination:null})),api("/api/operations/coordination-mesh?limit=100").catch(()=>({mesh:null})),api("/api/network/execution-partners").catch(()=>({partners:[]})),api("/api/network/customers?all=1").catch(()=>({customers:[]})),api("/api/network/missions").catch(()=>({missions:[]})),api("/api/network/invitations").catch(()=>({invitations:[]})),api("/api/network/tenant-trust").catch(()=>({relationships:[]})),api("/api/network/for-you-partners").catch(()=>({partners:[]})),api("/api/public/missions").catch(()=>({missions:[]})),api("/api/public/requests").catch(()=>({requests:[]}))
    ]);
    const networkRequests=(invitations?.invitations||[]).map(x=>({...x,kind:"networkinvitation",invitation_id:num(x.id),requestId:num(x.id),mission_reference:x.reference,mission_id:num(x.mission_id),requester_company_name:x.owner_company_name,status:x.status,request_type:"trusted_network"}));
    const publicRequests=(requests?.requests||[]).filter(x=>!terminal({status:x.mission_status||x.status})&&low(x.status)==="pending");
    const trustRows=trust?.relationships||[];const trustByPartner=new Map(trustRows.map(r=>[num(r.partner_company_id),r]));const partnerRows=[...(partners?.partners||[]),...(forYou?.partners||[])].map(x=>{const id=num(x.partnerId||x.recipientId||x.id),r=trustByPartner.get(id);return {...x,kind:"partner",partnerId:id,trustId:num(r?.id)||undefined,status:r?.status||x.status||"connected",partner_company_name:x.partner_company_name||x.name};});
    state.network={summary:summary?.summary||{},coordination:coordination?.coordination||null,mesh:mesh?.mesh||null,partners:partnerRows,customers:customers?.customers||[],missions:[...(missions?.missions||[]),...(publicMissions?.missions||[])].filter(x=>!terminal(x)),invitations:invitations?.invitations||[],trust:trustRows,requests:[...networkRequests,...publicRequests]};renderNetwork();renderContextQueue();
  }
  function networkItems(view){const n=state.network||{};const raw=view==="partners"?n.partners:view==="customers"?n.customers.filter(x=>low(x?.status||"active")==="active"):view==="shared"?n.missions.filter(x=>String(x?.source||x?.visibility||"").toLowerCase().includes("network")):view==="requests"?n.requests:view==="trust"?n.trust:n.missions;const seen=new Set();return (raw||[]).filter(x=>{const k=key({...x,kind:view==="partners"?"partner":view==="customers"?"customer":view==="requests"?"request":view==="trust"?"trust":"mission"});if(seen.has(k))return false;seen.add(k);return true;});}
  function renderNetwork(){const n=state.network||{};const pending=(n.requests||[]).filter(x=>["pending","requested","open"].includes(low(x.status||"pending")));const recent=(n.requests||[]).filter(x=>!pending.includes(x)).slice(0,12);$("#networkStats").innerHTML=[fact("Trusted partners",n.summary.trusted||n.trust?.filter(x=>low(x.status)==="trusted"||low(x.status)==="active").length),fact("Shared missions",n.missions.length),fact("Requests",pending.length),fact("Customers",n.customers.length)].join("");const rows=networkItems(state.networkView);$("#networkQueue").innerHTML=rows.slice(0,60).map((x,i)=>{const k=state.networkView==="partners"?"partner":state.networkView==="customers"?"customer":state.networkView==="requests"?"request":state.networkView==="trust"?"trust":"mission";return `<button class="network-item" data-network-key="${escAttr(key({...x,kind:k}))}"><span>${esc(state.networkView)}</span><strong>${esc(ref(x))}</strong><small>${esc(x?.status||x?.city||x?.requester_company_name||"Current network context")}</small></button>`;}).join("")||'<div class="empty">No network records in this view.</div>';const requestAttention=state.networkView==="requests"?`<section class="network-attention-groups"><div class="network-group"><span>NEEDS ATTENTION</span><strong>${pending.length} request${pending.length===1?"":"s"}</strong><div class="network-grid">${pending.slice(0,15).map((x,i)=>networkCard(x,"requests",i)).join("")||'<div class="empty">Nothing needs a decision.</div>'}</div></div><div class="network-group"><span>RECENT ACTIVITY</span><strong>${recent.length} recent</strong><div class="network-grid">${recent.map((x,i)=>networkCard(x,"requests",i)).join("")||'<div class="empty">No recent request activity.</div>'}</div></div></section>`:"";$("#networkBody").innerHTML=`<div class="network-hero"><span>NETWORK SITUATION</span><strong>${pending.length} request${pending.length===1?"":"s"} waiting · ${num(n.missions.length)} shared/public missions visible</strong><p>Relationships and coordination live here; current operational action still converges on the canonical workbench.</p><small>${esc(`Connected work: ${num(state.network.coordination?.coordinationPicture?.missionCount||state.network.coordination?.coordinatedCount)} · hotspots: ${num(state.network.mesh?.mesh?.hotspotCount||state.network.mesh?.hotspots?.length)}`)}</small></div>${requestAttention||`<div class="network-grid">${rows.slice(0,24).map((x,i)=>networkCard(x,state.networkView,i)).join("")}</div>`}`;}
  function networkCard(x,type,i){const name=ref(x);if(type==="marketplace"){const id=num(x.id||x.mission_id),own=num(x.owned_by_requester)===1||num(x.company_id)===num(x.requester_company_id),accessible=num(x.tenant_access_active)===1||num(x.tenant_request_pending)===1,requested=num(x.tenant_request_pending)===1;return `<article class="network-card"><span>OPPORTUNITY</span><h3>${esc(name)}</h3><p>${esc(x.pickup_city&&x.delivery_city?`${x.pickup_city} → ${x.delivery_city}`:"ForYou opportunity")}</p><b>${esc(requested?"REQUEST PENDING":own?"YOUR FORYOU MISSION":x.status||"OPEN")}</b><div class="network-card-actions">${!own&&!accessible&&id?`<button type="button" class="wb-primary" data-network-action="request_foryou_mission" data-network-key="${escAttr(key({...x,kind:"mission"}))}" data-network-kind="mission">REQUEST MISSION</button>`:""}<button type="button" data-network-open data-network-type="mission" data-network-index="${i}">OPEN WORK</button></div></article>`;}const k=type==="trust"?"trust":type==="partners"?"partner":type==="customers"?"customer":type==="requests"?"request":"mission";const actions=workspaceActions({...x,kind:k});const actionButtons=actions.slice(0,2).map(a=>`<button type="button" class="${a.danger?"danger":""}" data-network-action="${escAttr(a.code)}" data-network-key="${escAttr(key({...x,kind:k}))}" data-network-kind="${escAttr(k)}">${esc(a.label)}</button>`).join("");return `<article class="network-card"><span>${esc(type.toUpperCase())}</span><h3>${esc(name||x.partner_company_name||x.customer_name||"Network context")}</h3><p>${esc(x.partner_company_name||x.requester_company_name||x.owner_company_name||x.city||x.address||x.email||"Operational relationship")}</p><b>${esc(x.status||"CURRENT")}</b><div class="network-card-actions">${actionButtons}<button type="button" data-network-open data-network-type="${escAttr(k)}" data-network-index="${i}">MANAGE</button></div></article>`;}

  function contextWorkspaceHeader(kicker,title,description,tools=""){return `<header class="ctx-workspace-head"><div><span class="exp-kicker">${esc(kicker)}</span><h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="ctx-workspace-tools">${tools}</div></header>`;}
  async function loadPeopleAccessWorkspace(){const host=$("#peopleAccessWorkspace");if(!host)return;host.classList.remove('hidden');host.innerHTML='<div class="ctx-workspace"><div class="empty">Loading organization access…</div></div>';try{const d=await api('/api/organization/people');const roles=['owner','admin','manager','operator','driver','developer'];host.innerHTML=`<section class="ctx-workspace"><div class="context-workspace-header"><div><span class="exp-kicker">PEOPLE + ACCESS</span><h2>Organization access</h2><p>People, invitations, roles and capability eligibility are governed by the canonical access runtime.</p></div><button type="button" id="peopleAccessClose">CLOSE</button></div><div class="ctx-split"><section class="ctx-detail"><h3>Invite a person</h3><form id="peopleInviteForm" class="wb-form"><input name="email" type="email" placeholder="Email address" required><select name="roleCode">${roles.map(r=>`<option value="${r}">${r}</option>`).join('')}</select><button class="wb-primary">SEND INVITATION</button><span id="peopleInviteFeedback"></span></form><h3 style="margin-top:20px">Current people</h3><div class="ctx-list">${(d.people||[]).map(p=>`<article class="ctx-list-item"><strong>${esc(p.displayName||p.email||p.identityId)}</strong><small>${esc(p.email||'')} · ${(p.roles||[]).map(r=>esc(r.label)).join(', ')||'No role'} · ${p.active?'ACTIVE':'INACTIVE'}</small><div><select data-person-role="${p.identityId}">${roles.map(r=>`<option value="${r}" ${(p.roles||[]).some(x=>x.code===r)?'selected':''}>${r}</option>`).join('')}</select><button type="button" data-person-status="${p.identityId}" data-active="${p.active?'false':'true'}">${p.active?'DEACTIVATE':'ACTIVATE'}</button></div></article>`).join('')||'<div class="empty">No organization people yet.</div>'}</div><h3 style="margin-top:20px">Pending invitations</h3><div class="ctx-list">${(d.invitations||[]).filter(x=>x.status==='invited').map(i=>`<article class="ctx-list-item"><strong>${esc(i.email)}</strong><small>${esc(i.role_code)} · expires ${esc(i.expires_at)}</small><button type="button" data-invite-revoke="${escAttr(i.invitation_id)}">REVOKE</button></article>`).join('')||'<div class="empty">No pending invitations.</div>'}</div></section><aside class="ctx-detail"><h3>Capability eligibility</h3><div class="ctx-list">${(d.capabilities?.items||[]).map(c=>`<article class="ctx-list-item"><strong>${esc(c.label)}</strong><small>${esc(c.domainCode)} · ${c.eligible?'ELIGIBLE':'RESTRICTED'}</small><small>${esc(c.stage)}</small></article>`).join('')}</div><p class="section-subtitle">Entitlement and enablement are intentionally not duplicated here; subscription authority will complete that path in 10.38.13.</p></aside></div></section>`;$('#peopleAccessClose').onclick=()=>host.classList.add('hidden');$('#peopleInviteForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,v=Object.fromEntries(new FormData(f));try{const r=await api('/api/organization/invitations',jsonOptions('POST',v));$('#peopleInviteFeedback').textContent=`Invitation ${r.invitation.delivery}.`;f.reset();await loadPeopleAccessWorkspace();}catch(x){$('#peopleInviteFeedback').textContent=x.message||'Invitation failed.';}};host.querySelectorAll('[data-person-role]').forEach(sel=>sel.onchange=async()=>{try{await api(`/api/organization/people/${sel.dataset.personRole}/role`,jsonOptions('PATCH',{roleCode:sel.value}));await loadPeopleAccessWorkspace();}catch(x){alert(x.message||'Role update failed.');}});host.querySelectorAll('[data-person-status]').forEach(b=>b.onclick=async()=>{try{await api(`/api/organization/people/${b.dataset.personStatus}/status`,jsonOptions('PATCH',{active:b.dataset.active==='true'}));await loadPeopleAccessWorkspace();}catch(x){alert(x.message||'Status update failed.');}});host.querySelectorAll('[data-invite-revoke]').forEach(b=>b.onclick=async()=>{try{await api(`/api/organization/invitations/${encodeURIComponent(b.dataset.inviteRevoke)}/revoke`,jsonOptions('POST',{}));await loadPeopleAccessWorkspace();}catch(x){alert(x.message||'Could not revoke invitation.');}});}catch(e){host.innerHTML=`<div class="ctx-workspace"><div class="empty">${esc(e.message||'Access workspace unavailable')}</div></div>`;}}
  function renderPeopleWorkspace(allPeople, selected, visible){const host=$("#peopleBody");if(!host)return;const first=visible[0]||null;host.innerHTML=`<section class="ctx-workspace">${contextWorkspaceHeader("PEOPLE WORKSPACE",labelForPeople(selected),"People contains only the executors who operate your missions.","")}<div class="context-bar" id="peopleContextTabs"></div><div class="ctx-split"><aside class="ctx-list">${visible.slice(0,120).map(x=>{const k=kind(x),id=idOf({...x,kind:k});return `<button type="button" class="ctx-list-item ${first&&idOf({...first,kind:kind(first)})===id?'active':''}" data-person-key="${escAttr(key({...x,kind:k}))}"><span>${esc(k||'person')}</span><strong>${esc(ref(x))}</strong><small>${esc(x.status||x.city||x.email||'Operational relationship')}</small></button>`}).join('')||'<div class="empty">No people in this context.</div>'}</aside><section class="ctx-detail" id="peopleWorkspaceDetail">${personDetail(first)}</section></div></section>`;renderContextTabs("people",allPeople.filter(x=>kind(x)==="driver"||kind(x)==="executor"));$$('[data-person-key]',host).forEach(b=>b.onclick=()=>{const x=visible.find(v=>key(v)===b.dataset.personKey);if(x){$$('[data-person-key]',host).forEach(q=>q.classList.toggle('active',q===b));personWorkspaceOpen(x);}});}
  function labelForPeople(id){return ({all:'Executors',drivers:'Executors'}[id]||'Executors');}
  function personDetail(x){if(!x)return '<div class="ctx-empty-state"><strong>Select a person</strong><span>Choose a record to open its complete workspace.</span></div>';const k=kind(x),id=idOf({...x,kind:k}),actions=workspaceActions(x);return `<div class="ctx-detail-card"><div class="ctx-detail-kicker">${esc(k.toUpperCase())}</div><h3>${esc(ref(x))}</h3><p>${esc(x.city||x.address||x.email||x.username||"Operational relationship")}</p><div class="ctx-facts">${fact("Status",x.status||((k==="driver"||k==="executor")&&num(x.active)!==0?"Active":"Current"))}${fact("ID",id)}${fact("Contact",x.email||x.username||x.contact_name||"—")}</div><div class="ctx-action-row"><button type="button" class="wb-primary" data-person-manage>MANAGE</button><button type="button" data-person-message>MESSAGE</button></div></div>`;}
  function personWorkspaceOpen(x){const host=$("#peopleWorkspaceDetail");if(!host)return;host.innerHTML=personDetail(x);host.querySelector('[data-person-manage]')?.addEventListener('click',()=>{navigate("work");requestAnimationFrame(()=>openWork(x));});host.querySelector('[data-person-message]')?.addEventListener('click',()=>openCommunicationWorkspace(x));}
  function renderRequestsWorkspace(rows, selected){const host=$("#requestsBody");if(!host)return;const visible=filteredDomainRows("requests",rows),first=visible[0]||null;host.innerHTML=`<section class="ctx-workspace">${contextWorkspaceHeader("REQUEST WORKSPACE",labelForRequests(selected),"Every request has one place to inspect, decide and follow through.",`<button type="button" data-exp-area="network">NETWORK</button>`)}<div class="context-bar" id="requestContextTabs"></div><div class="ctx-split"><aside class="ctx-list">${visible.slice(0,120).map(x=>{const id=idOf(x);return `<button type="button" class="ctx-list-item ${first&&idOf(first)===id?'active':''}" data-request-key="request:${id}"><span>${esc(x.request_type||x.kind||'request')}</span><strong>${esc(ref(x))}</strong><small>${esc(x.status||'Pending')} · ${esc(x.requester_company_name||x.requester_name||'Network participant')}</small></button>`}).join('')||'<div class="empty">No requests in this context.</div>'}</aside><section class="ctx-detail" id="requestWorkspaceDetail">${requestDetail(first)}</section></div></section>`;renderContextTabs("requests",rows);$$('[data-request-key]',host).forEach(b=>b.onclick=()=>{const id=num(String(b.dataset.requestKey).split(':')[1]);const x=rows.find(v=>idOf(v)===id);if(x){$$('[data-request-key]',host).forEach(q=>q.classList.toggle('active',q===b));requestWorkspaceOpen(x);}});}
  function labelForRequests(id){return ({all:'Requests',sharing:'Sharing mission',foryou:'ForYou',shared:'Currently shared',pending:'Pending',completed:'Completed',declined:'Declined'}[id]||'Requests');}
  function requestDetail(x){if(!x)return '<div class="ctx-empty-state"><strong>No request selected</strong><span>Select a request to inspect it.</span></div>';const mid=num(x.mission_id||x.missionId);return `<div class="ctx-detail-card"><div class="ctx-detail-kicker">REQUEST</div><h3>${esc(ref(x))}</h3><p>${esc(x.requester_company_name||x.requester_name||x.owner_company_name||'Network participant')}</p><div class="ctx-facts">${fact('Status',x.status||'Pending')}${fact('Mission',x.mission_reference||mid||'—')}${fact('Type',x.request_type||x.kind||'Execution request')}</div><div class="ctx-action-row"><button type="button" class="wb-primary" data-request-open>OPEN MISSION WORKSPACE</button></div></div>`;}
  function requestWorkspaceOpen(x){const host=$("#requestWorkspaceDetail");if(!host)return;host.innerHTML=requestDetail(x);host.querySelector('[data-request-open]')?.addEventListener('click',()=>{navigate('work');openWork({...x,kind:'mission',_actionCenterCode:low(x.request_type||x.kind).includes('network')?'accept_network':'approve_foryou_request'});});}
  async function loadPeople(){
    const d=await api("/api/drivers").catch(()=>({drivers:[]}));
    const allPeople=(d?.drivers||[]).map(x=>({...x,kind:"driver"}));
    state.peopleRows=allPeople;
    const selected=state.contexts.people||"all", visible=filteredDomainRows("people",allPeople);
    renderPeopleWorkspace(allPeople, selected, visible);renderContextQueue();
  }
  async function loadRequests(){
    const [r,coord]=await Promise.all([api("/api/public/requests").catch(()=>({requests:[]})),api("/api/operations/multi-mission?limit=100").catch(()=>({coordination:null}))]);
    const rows=r?.requests||[], selected=state.contexts.requests||"all", visible=filteredDomainRows("requests",rows);state.requestRows=rows;
    renderRequestsWorkspace(rows, selected);renderContextQueue();
  }
  async function loadReports(){const to=new Date().toLocaleDateString("en-CA"),d=new Date();d.setDate(d.getDate()-29);const from=d.toLocaleDateString("en-CA");const r=await api(`/api/reports/missions?from=${from}&to=${to}&type=company`).catch(()=>({report:null}));const x=r?.report||{};$("#reportsBody").hidden=false;$("#reportsBody").innerHTML=`<div class="wb-card"><h3>Company report</h3><div class="insight-grid">${fact("Missions",x.summary?.total)}${fact("Completed",x.summary?.completed)}${fact("Active",x.summary?.active)}${fact("Overdue",x.summary?.overdue)}</div><p>Reports are read-only. Use Work for current operational action.</p></div>`;}
  async function loadInsights(){const to=new Date().toLocaleDateString("en-CA"),start=new Date(`${to}T12:00:00`);start.setDate(1);const a=await api(`/api/analytics/overview?from=${start.toLocaleDateString("en-CA")}&to=${to}`).catch(()=>({analytics:{}}));const m=a?.analytics?.metrics||{};$("#insightsBody").innerHTML=`<section class="ctx-workspace">${contextWorkspaceHeader("INSIGHTS WORKSPACE","Operational intelligence","A dedicated read-only workspace for performance, trends and signals.",`<button type="button" data-exp-area="work">OPEN WORK</button>`)}<div class="insight-grid">${fact("Completion",m.completionRate?.value!=null?`${Math.round(m.completionRate.value)}%`:"—")}${fact("Overdue",m.overdueRate?.value!=null?`${Math.round(m.overdueRate.value)}%`:"—")}${fact("Average mission",m.averageMissionDurationMinutes?.value!=null?`${Math.round(m.averageMissionDurationMinutes.value)} min`:"—")}${fact("Exceptions",m.exceptionRate?.value!=null?`${Math.round(m.exceptionRate.value)}%`:"—")}</div><div class="ctx-insight-columns"><article class="ctx-detail-card"><span class="ctx-detail-kicker">PERFORMANCE</span><h3>Operational performance</h3><p>Review the current reporting signals here without turning analytics into a competing action surface.</p></article><article class="ctx-detail-card"><span class="ctx-detail-kicker">ACTION</span><h3>Move from insight to action</h3><p>When an insight requires intervention, open Work to reach the canonical operational context and next valid action.</p><button type="button" class="wb-primary" data-exp-area="work">GO TO WORK</button></article></div></section>`;}
  function focusFind(){const input=$("#globalFindInput");input?.focus();renderFind();}
  async function renderFind(){
    const host=$("#findResults");
    if(!host)return;
    const q=low($("#globalFindInput")?.value);
    const rows=state.workRows.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));
    host.innerHTML=`<section class="ctx-workspace ctx-find-workspace">${contextWorkspaceHeader("FIND WORKSPACE","Search the operation","Search across operational objects and open their complete workspace.") }<div class="ctx-search-results">${rows.slice(0,100).map(x=>`<button type="button" class="ctx-search-item" data-find-key="${escAttr(key(x))}"><span>${esc(kind(x))}</span><strong>${esc(ref(x))}</strong><small>${esc(txt(x.status||x.reason||x.city||x.nextAction||"Current operational context"))}</small><b>OPEN</b></button>`).join("")||'<div class="ctx-empty-state"><strong>No matching work</strong><span>Try a mission reference, request, person or partner name.</span></div>'}</div></section>`;
    $$('[data-find-key]',host).forEach(b=>b.onclick=()=>{const x=state.workRows.find(v=>key(v)===b.dataset.findKey);if(x){navigate('work');openWork(x);}});
  }

  async function createDriver(){openPersonCreateWorkspace("driver");}
  async function createCustomer(){openPersonCreateWorkspace("customer");}
  function openPersonCreateWorkspace(type){const driver=type==="driver";$("#workbench").innerHTML=`<div class="wb-card"><h3>Add ${driver?"executor":"customer"}</h3><form id="personCreateForm" class="wb-form">${driver?'<input name="name" placeholder="Executor name" required><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required>':'<input name="companyName" placeholder="Customer company" required><input name="contactName" placeholder="Contact name"><input name="email" type="email" placeholder="Email"><input name="phone" placeholder="Phone"><input name="address" placeholder="Address">'}<button class="wb-primary">CREATE</button><button type="button" id="personCreateBack">BACK</button><span id="wbFeedback"></span></form></div>`;$("#personCreateBack").onclick=()=>navigate("people");$("#personCreateForm").onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));try{await api(driver?"/api/drivers":"/api/network/customers",jsonOptions("POST",v));await loadPeople();navigate("people");}catch(err){$("#wbFeedback").textContent=err.message;}};}
  async function applyProductContext(){try{const d=await api('/api/product/context',{cache:'no-store'});const c=d?.context||{},labels=c.rendering?.labels||{},show=c.rendering?.show||{};const labelMap={work:'[data-exp-area="work"] .nav-label',network:'[data-exp-area="network"] .nav-label',people:'[data-exp-area="people"] .nav-label',objects:'[data-exp-area="objects"] .nav-label',insights:'[data-exp-area="insights"] .nav-label'};for(const [k,sel] of Object.entries(labelMap)){document.querySelectorAll(sel).forEach(el=>{if(labels[k])el.textContent=labels[k];});}for(const [k,v] of Object.entries(show)){document.querySelectorAll(`[data-exp-panel="${k}"]`).forEach(el=>el.hidden=v===false);document.querySelectorAll(`[data-exp-area="${k}"]`).forEach(el=>{if(v===false)el.hidden=true;});}const guidance=c.guidance?.organization?.steps||[];const host=document.querySelector('#homeSituationMeta');if(host&&guidance.length)host.textContent=guidance[0];}catch{}}
  function boot(){const root=shell();if(!root)return;if(root.dataset.onmissionRuntimeBound===RELEASE_VERSION)return;root.dataset.onmissionRuntimeBound=RELEASE_VERSION;renderContextQueue();
    root.addEventListener("click",async e=>{
      interaction();
      const wbBack=e.target.closest("[data-wb-back]"); if(wbBack&&state.objectMode){const origin=state.objectOrigin||"work";state.objectMode=false;state.workSelected=null;state.contextQueueQuery="";navigate(origin);return;}
      const cm=e.target.closest("[data-create-mission]");if(cm){navigate("work");createMission();return;} const cd=e.target.closest("[data-create-driver]");if(cd){createDriver();return;} const pa=e.target.closest("[data-open-access-workspace]");if(pa){loadPeopleAccessWorkspace();return;} const cc=e.target.closest("[data-create-customer]");if(cc){createCustomer();return;}
      const nav=e.target.closest("[data-exp-area]");if(nav){navigate(nav.dataset.expArea);return;}
      const intent=e.target.closest("[data-exp-intent]");if(intent){navigate(intent.dataset.expIntent);return;}
      const ac=e.target.closest("[data-action-center-mission]");if(ac){const missionId=num(ac.dataset.actionCenterMission),code=txt(ac.dataset.actionCenterCode);const x=state.workRows.find(v=>kind(v)==="mission"&&idOf(v)===missionId);if(x){navigate("work");state.workSelected={...x,_actionCenterCode:code};await openWork(state.workSelected);}return;}
      const hm=e.target.closest("[data-home-mission]");if(hm){navigate("work");const missionId=num(hm.dataset.homeMission);await loadWork();const x=state.workRows.find(v=>kind(v)==="mission"&&idOf(v)===missionId);if(x)await openWork(x);return;}
      const more=e.target.closest("[data-context-queue-more]"); if(more){e.preventDefault();e.stopPropagation();loadMoreContextQueue();return;} const cq=e.target.closest("[data-context-object-key]");if(cq){const x=contextQueueRows().find(v=>key(v)===cq.dataset.contextObjectKey);if(x)queueObjectClick(x);return;} const wi=e.target.closest("[data-work-key]");if(wi){const x=state.workRows.find(v=>key(v)===wi.dataset.workKey);if(x)openWork(x);return;}
      const qa=e.target.closest("[data-queue-action]");if(qa){const x=contextQueueRows().find(v=>key(v)===qa.dataset.queueKey);if(x){qa.disabled=true;try{const code=canonicalActionId(qa.dataset.queueAction),action=workspaceActions(x).find(a=>a.code===code);if(code){if(action?.requiresWorkspace||action?.danger)openActionWorkspace({code,label:action.label,confirmation:action.danger?"strong":""},x);else{await executeCanonicalObjectAction(code,workspaceActionContext(x,{code}));if(kind(x)==="mission")await loadWork();else if(["driver","executor","customer"].includes(kind(x)))await loadPeople();else await loadNetwork();}}}catch(err){qa.disabled=false;qa.textContent=err?.message||"FAILED";}}return;}
      const na=e.target.closest("[data-network-action]");if(na){const rows=networkItems(state.networkView),x=rows.find(v=>key({...v,kind:na.dataset.networkKind})===na.dataset.networkKey);if(x){na.disabled=true;try{const code=canonicalActionId(na.dataset.networkAction),action=workspaceActions({...x,kind:na.dataset.networkKind}).find(a=>a.code===code);if(action?.danger)openActionWorkspace({code,label:action.label,confirmation:"strong"},{...x,kind:na.dataset.networkKind});else{await executeCanonicalObjectAction(code,workspaceActionContext({...x,kind:na.dataset.networkKind},{code}));await loadNetwork();}}catch(err){na.disabled=false;na.textContent=err?.message||"FAILED";}}return;}
      const nk=e.target.closest("[data-network-key]");if(nk){const [k,id]=String(nk.dataset.networkKey||"").split(":");const rows=networkItems(state.networkView);const x=rows.find(v=>idOf({...v,kind:k})===num(id));if(x){navigate("work");if(k==="trust")openWork({...x,kind:"partner",partnerId:num(x.partner_company_id||x.partnerCompanyId||x.partner_id),trustId:num(x.id)});else openWork({...x,kind:k,missionId:x.missionId||x.mission_id,id:x.id});}return;}
      const ni=e.target.closest("[data-network-open]");if(ni){const type=ni.dataset.networkType||"mission";const rows=networkItems(state.networkView);const x=rows[num(ni.dataset.networkIndex)];if(x){const k=type==="partner"?"partner":type==="customer"?"customer":type==="request"?"request":type==="trust"?"partner":"mission";const target={...x,kind:k,partnerId:type==="trust"?num(x.partner_company_id||x.partnerCompanyId||x.partner_id):undefined,trustId:type==="trust"?num(x.id):undefined,missionId:x.missionId||x.mission_id,id:x.id};navigate("work");requestAnimationFrame(()=>openWork(target));}return;}
      const pi=e.target.closest("[data-people-kind]");if(pi){const type=pi.dataset.peopleKind,id=num(pi.dataset.peopleId);const x=state.workRows.find(v=>kind(v)===type&&idOf(v)===id);if(x)navigate("work"),openWork(x);else if(type==="partner"){const x=(state.network?.partners||[]).find(v=>num(v.recipientId||v.id)===id);if(x)navigate("work"),openWork({...x,kind:"partner",partnerId:id});}return;}
      const ri=e.target.closest("[data-request-open]");if(ri){const x=state.workRows.find(v=>kind(v)==="request"&&idOf(v)===num(ri.dataset.requestOpen));if(x)navigate("work"),openWork(x);return;}
      const cpa=e.target.closest("[data-ctx16-person-action]");
      if(cpa){
        const type=low(cpa.dataset.ctx16Kind), id=num(cpa.dataset.ctx16Id);
        const x=state.workRows.find(v=>kind(v)===type&&idOf(v)===id);
        if(x){navigate("work");openWork(x);}
        else if(type==="partner"){navigate("work");openWork({kind:"partner",partnerId:id,id});}
        return;
      }
      const cro=e.target.closest("[data-ctx16-request-open]");
      if(cro){
        const id=num(cro.dataset.ctx16RequestOpen);
        const x=state.workRows.find(v=>kind(v)==="request"&&idOf(v)===id);
        if(x){navigate("work");openWork(x);}
        return;
      }
      const cra=e.target.closest("[data-ctx16-request-action]");
      if(cra){
        const id=num(cra.dataset.ctx16RequestId), op=low(cra.dataset.ctx16RequestAction);
        const x=state.workRows.find(v=>kind(v)==="request"&&idOf(v)===id);
        if(x){navigate("work");openWork(x); return;}
        return;
      }
      const fi=e.target.closest("[data-find-key]");if(fi){const x=state.workRows.find(v=>key(v)===fi.dataset.findKey);if(x)navigate("work"),openWork(x);return;}
      const ct=e.target.closest("[data-connect-tenant]");if(ct){const id=num(ct.dataset.connectTenant);if(id){ct.disabled=true;try{await executeCanonicalObjectAction("request_trust",{partnerId:id});ct.textContent="REQUESTED";}catch(e){ct.disabled=false;ct.textContent=e.message||"FAILED";}}return;}
      const rm=e.target.closest("[data-network-request-mission]");if(rm){const id=num(rm.dataset.networkRequestMission);if(id){const x=networkItems("marketplace").find(v=>num(v.id||v.mission_id)===id);if(x){navigate("work");openWork({...x,kind:"mission",missionId:id,id});}else{rm.textContent="Opportunity no longer available";}}return;}
      const tv=e.target.closest("[data-open-global-tv]");if(tv){window.dispatchEvent(new CustomEvent("onmission:focus-request"));return;}
    });
    root.addEventListener("change",()=>{});
    document.querySelector("[data-exp-global-find]")?.addEventListener("click",()=>{navigate("find");requestAnimationFrame(()=>focusFind());});$("#globalFindInput")?.addEventListener("input",()=>{renderFind();if(state.area==="find")renderContextQueue();});
    $("#workSearchInput")?.addEventListener("input",e=>{state.workQuery=e.target.value;const r=$("#railWorkSearchInput");if(r)r.value=e.target.value;renderWorkQueue()});
    $("#railContextSearchInput")?.addEventListener("input",filterContextQueue);
    $("#workQueueSearch")?.addEventListener("input",filterContextQueue);
    $("#workQueueRefresh")?.addEventListener("click",loadWork);
    $("#railWorkRefresh")?.addEventListener("click",()=>{if(state.area==="work")loadWork();else if(state.area==="network")loadNetwork();else if(state.area==="people")loadPeople();else if(state.area==="objects")window.dispatchEvent(new Event("onmission:universalization-objects"));else if(state.area==="requests")loadRequests();else if(state.area==="home")loadHome();else renderContextQueue();});
    $$("[data-network-view]").forEach(b=>b.addEventListener("click",()=>{state.networkView=b.dataset.networkView;$$("[data-network-view]").forEach(x=>x.classList.toggle("active",x===b));renderNetwork();renderContextQueue()}));
    $$("[data-work-view]").forEach(b=>b.addEventListener("click",()=>{state.workView=b.dataset.workView||"all";state.contextQueuePage=1;$$(`[data-work-view]`).forEach(x=>{x.classList.toggle("active",x===b);x.setAttribute("aria-selected",x===b?"true":"false")});renderContextQueue();}));
    const openUniversalCreate=()=>{navigate("work");$("#workbench").innerHTML='<div class="wb-card universal-create"><span class="exp-kicker">CREATE</span><h3>What do you want to add?</h3><p>Create the next operational object in the context that owns it.</p><div class="quick-create"><button data-create-mission data-access-capability="createMissions">MISSION</button><button data-create-driver data-access-capability="createDrivers">EXECUTOR</button><button data-create-customer>CUSTOMER</button></div></div>';};
    $("#networkAdd")?.addEventListener("click",async()=>{navigate("network");$("#networkBody").innerHTML='<div class="wb-card"><h3>Connect a partner</h3><input id="networkPartnerSearch" class="exp-search" placeholder="Search companies"><div id="networkPartnerResults" class="find-results"></div></div>';const input=$("#networkPartnerSearch"),host=$("#networkPartnerResults");const search=async()=>{const q=txt(input.value);if(!q){host.innerHTML='<div class="empty">Search for a company to connect.</div>';return}const d=await api(`/api/network/tenants?q=${encodeURIComponent(q)}`).catch(()=>({tenants:[]}));host.innerHTML=(d?.tenants||[]).slice(0,20).map(v=>`<div class="find-item"><strong>${esc(v.name||v.company_name||v.tenant_name||"Company")}</strong><button data-connect-tenant="${num(v.id||v.tenantId)}">REQUEST TRUST</button></div>`).join("")||'<div class="empty">No matching companies.</div>';};input.addEventListener("input",search);});
    $("#homeResolveMain")?.addEventListener("click",()=>navigate("work"));$("#workRefresh")?.addEventListener("click",loadWork);$("#homeResolve")?.addEventListener("click",()=>navigate("work"));
    $("#openCoordination")?.addEventListener("click",()=>navigate("work"));$("#loadReports")?.addEventListener("click",loadReports);
    $("#createMission")?.addEventListener("click",openUniversalCreate);
    const bootLoads=async()=>{
      loadHome().catch(e=>console.error("ON Mission home load failed",e));
      try{await loadWork();openHashMission();}catch(e){showWorkbenchError(e?.message||"Unable to load current work.");}
    };
    async function openHashMission(){
      const raw=String(location.hash||"");if(!raw.startsWith("#operations?"))return;
      const q=new URLSearchParams(raw.slice("#operations?".length));const missionId=num(q.get("mission"));
      if(!missionId){setArea(String(q.get("section")||"home"),{route:false});return;}
      const row=state.workRows.find(v=>kind(v)==="mission"&&idOf(v)===missionId);if(!row)return;
      setArea("work",{route:false});
      await openWork({...row,_actionCenterCode:normalizeActionId(q.get("action")||"")});
    }
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bootLoads,{once:true});else bootLoads();
    window.addEventListener("popstate",()=>{openHashMission().catch(e=>showWorkbenchError(e?.message||"Unable to restore the requested workspace."));});
    window.addEventListener("onmission:live-notifications",()=>{if(isNetworkOffline())return;loadHome();if(state.area==="work")loadWork();if(state.area==="network")loadNetwork()});
    window.addEventListener("onmission:network-state",e=>{const d=e.detail||{};if(d.type==="network_reconnected"){loadHome();if(state.area==="work")loadWork();if(state.area==="network")loadNetwork();if(state.area==="people")loadPeople();if(state.area==="objects")window.dispatchEvent(new Event("onmission:universalization-objects"));if(state.area==="requests")loadRequests();}else if(!d.online){renderNetworkContinuityState();}});
    window.addEventListener("onmission:network-deferred",renderNetworkContinuityState);
    function renderNetworkContinuityState(){const root=$("#workbench");if(!root)return;if(!isNetworkOffline())return;if(state.workSelected||state.workRows.length){const note=root.querySelector(".network-continuity-note");if(note)return;const el=document.createElement("div");el.className="network-continuity-note";el.setAttribute("role","status");el.innerHTML="<strong>Connection unavailable.</strong><span>This screen is preserved, but it is not being presented as current.</span>";root.prepend(el);}else root.innerHTML=`<div class="wb-empty network-unavailable"><strong>Waiting for connection.</strong><span>No operational state is being presented until it can be read from the service.</span></div>`;}
  }
  async function createMission(){
    const productContext=await api("/api/product/context",{cache:"no-store"}).catch(()=>({context:null}));
    const product=productContext?.context||{};
    const enabledCapabilities=Array.isArray(product?.capabilities?.enabled)?product.capabilities.enabled:[];
    const defaultCapability=product?.missionRules?.intake?.defaultCapability||enabledCapabilities[0]||"mission";
    const now=new Date();
    const date=now.toISOString().slice(0,10);
    const time=now.toTimeString().slice(0,5);
    const delivery=new Date(now.getTime()+3600000).toTimeString().slice(0,5);
    const deadline=new Date(now.getTime()+7200000).toISOString().slice(0,16);
    $("#workbench").innerHTML=`<div class="wb-card create-mission-workspace"><header class="wb-context-head"><div><span>MISSION INTAKE</span><h2>Create mission</h2><p>Start with the universal mission context. Capability-specific details appear only when the configured capability requires them.</p></div><button type="button" data-create-back>BACK</button></header>
      <form id="createMissionForm" class="wb-form">
        <h3>Mission definition</h3><div class="wb-grid"><label>CAPABILITY<select name="capabilityCode">${enabledCapabilities.map(c=>`<option value="${esc(c)}" ${c===defaultCapability?"selected":""}>${esc(c)}</option>`).join("")}</select></label><label>RESPONSIBILITY<select name="responsibilityMode"><option value="assigned">Assigned responsibility</option><option value="self">Self responsibility</option><option value="network">Network responsibility</option></select></label><label class="wide">OBJECTIVE<input name="objective" maxlength="1000" placeholder="What outcome must this mission reach?" required></label></div>
        <h3>Capability context</h3><div class="wb-grid">
          <label>PICKUP COMPANY<input name="pickupCompany" required></label><label>PICKUP STREET + NUMBER<input name="pickupStreet" required></label><label>PICKUP ZIP CODE<input name="pickupZipCode" inputmode="numeric" maxlength="5" required></label><label>PICKUP CITY<input name="pickupCity" required></label>
          <label>DELIVERY COMPANY<input name="deliveryCompany" required></label><label>DELIVERY STREET + NUMBER<input name="deliveryStreet" required></label><label>DELIVERY ZIP CODE<input name="deliveryZipCode" inputmode="numeric" maxlength="5" required></label><label>DELIVERY CITY<input name="deliveryCity" required></label>
          <label>MISSION DATE<input name="missionDate" type="date" value="${date}" required></label><label>PICKUP TIME<input name="pickupTime" type="time" value="${time}" required></label><label>DELIVERY TIME<input name="deliveryTime" type="time" value="${delivery}" required></label><label>DEADLINE<input name="deadlineAt" type="datetime-local" value="${deadline}" required></label>
        </div>
        <h3>Object & execution requirements</h3><div class="wb-grid">
          <label>OBJECT TYPE<input name="objectType" placeholder="Pallets, parcel, machine…"></label><label>WEIGHT (KG)<input name="weightKg" type="number" min="0" step="0.1"></label><label>VOLUME (M³)<input name="volumeM3" type="number" min="0" step="0.01"></label><label>PALLETS / UNITS<input name="palletCount" type="number" min="0" step="1"></label>
          <label>VEHICLE REQUIREMENT<input name="vehicleRequirement" placeholder="Van, truck, liftgate…"></label><label>LOADING<input name="loadingType" placeholder="Loading type / equipment"></label><label>UNLOADING<input name="unloadingType" placeholder="Unloading type / equipment"></label>
        </div>
        <div class="wb-grid"><label class="wide">OBJECT / HANDLING DETAILS<textarea name="objectDescription" rows="3" maxlength="1000"></textarea></label><label class="wide">MATCHING NOTES<textarea name="matchingNotes" rows="3" maxlength="1000"></textarea></label><label class="wide">MESSAGE<textarea name="adminMessage" rows="3" maxlength="2000"></textarea></label></div>
        <div class="wb-actions"><button class="wb-primary" type="submit">CREATE MISSION</button><button type="button" data-create-back>BACK</button><span id="wbFeedback" aria-live="polite"></span></div>
      </form></div>`;
    $$('[data-create-back]').forEach(b=>b.onclick=()=>{state.workSelected=null;renderWorkQueue();});
    $("#createMissionForm").onsubmit=async e=>{
      e.preventDefault();
      const form=e.currentTarget,v=Object.fromEntries(new FormData(form));const feedback=$("#wbFeedback");
      const required=["pickupCompany","pickupStreet","pickupZipCode","pickupCity","deliveryCompany","deliveryStreet","deliveryZipCode","deliveryCity","missionDate","pickupTime","deliveryTime","deadlineAt"];
      if(required.some(k=>!txt(v[k]))){feedback.textContent="Complete all required route and schedule fields.";return;}
      const button=form.querySelector('button[type="submit"]');button.disabled=true;feedback.textContent="Creating…";
      const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
      const localUtc=value=>new Date(value).toISOString();
      const pickupAddress=`${v.pickupStreet}, ${v.pickupZipCode} ${v.pickupCity}`;
      const deliveryAddress=`${v.deliveryStreet}, ${v.deliveryZipCode} ${v.deliveryCity}`;
      try{
        const result=await api("/api/missions",jsonOptions("POST",{missionType:"private",capabilityCode:v.capabilityCode||defaultCapability,objective:v.objective||"",responsibilityMode:v.responsibilityMode||"assigned",pickupCompany:v.pickupCompany,pickupAddress,pickupStreet:v.pickupStreet,pickupZipCode:v.pickupZipCode,pickupCity:v.pickupCity,deliveryCompany:v.deliveryCompany,deliveryAddress,deliveryStreet:v.deliveryStreet,deliveryZipCode:v.deliveryZipCode,deliveryCity:v.deliveryCity,objectType:v.objectType||"",objectDescription:v.objectDescription||"",weightKg:v.weightKg||"",volumeM3:v.volumeM3||"",palletCount:v.palletCount||"",vehicleRequirement:v.vehicleRequirement||"",loadingType:v.loadingType||"",unloadingType:v.unloadingType||"",matchingNotes:v.matchingNotes||"",missionDate:v.missionDate,pickupTime:v.pickupTime,deliveryTime:v.deliveryTime,deadlineAt:v.deadlineAt,pickupAtUtc:localUtc(`${v.missionDate}T${v.pickupTime}`),deliveryAtUtc:localUtc(`${v.missionDate}T${v.deliveryTime}`),deadlineAtUtc:localUtc(v.deadlineAt),scheduleTimezone:tz,missionEndTime:v.deadlineAt.slice(11),adminMessage:v.adminMessage||""}));
        feedback.textContent=`Mission ${result?.mission?.reference||result?.missionId||""} created.`;await loadWork();const row=state.workRows.find(x=>kind(x)==="mission"&&idOf(x)===num(result?.missionId));if(row)await openWork(row);
      }catch(err){feedback.textContent=err?.message||"Mission creation failed.";button.disabled=false;}
    };
  }
  boot();
})();
