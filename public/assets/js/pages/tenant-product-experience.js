import {api} from "../core/api.js";

const $=s=>document.querySelector(s);
const state={situation:null,overview:null,notifications:null,loading:true,error:null};
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function mount(){
  const home=$('[data-exp-panel="home"]');
  if(!home)return;
  if(!$('#tenantProductHome')){
    const block=document.createElement('section');
    block.id='tenantProductHome';
    block.className='tenant-product-home';
    block.innerHTML=`<div class="tph-head"><div><span class="exp-kicker">PRODUCT READINESS</span><h2>Your workspace</h2><p id="tphSummary">Reading your current situation…</p></div><button type="button" id="tphRefresh">↻ REFRESH</button></div><div id="tphState" class="tph-state loading">Loading your workspace…</div><div id="tphReadiness" class="tph-grid"></div><div id="tphJourney" class="tph-journey"></div><div class="tph-columns"><section class="tph-card"><div class="tph-card-head"><div><span class="exp-kicker">COMMUNICATION</span><h3>One communication stream</h3></div><button type="button" id="tphNotifications">OPEN ALL</button></div><div id="tphComms" class="tph-list"></div></section><section class="tph-card"><div class="tph-card-head"><div><span class="exp-kicker">CAPABILITIES</span><h3>Available in your organization</h3></div></div><div id="tphCapabilities" class="tph-list"></div></section></div><section class="tph-card"><div class="tph-card-head"><div><span class="exp-kicker">NEXT VALID STEP</span><h3 id="tphNextTitle">Reading…</h3><p id="tphNextText">The platform is determining the next valid product step from canonical situation and policy.</p></div><button type="button" id="tphNextAction" class="tph-primary">OPEN</button></div></section></section>`;
    home.appendChild(block);
    $('#tphRefresh').onclick=load;
    $('#tphNotifications').onclick=()=>window.dispatchEvent(new CustomEvent('onmission:tenant-module',{detail:{name:'notifications'}}));
  }
}
function setState(kind,message){const el=$('#tphState');if(!el)return;el.className=`tph-state ${kind}`;el.textContent=message;}
function readinessCards(s){
  const checks=[
    ['ORGANIZATION',Boolean(s?.membership?.companyId||s?.account?.companyId||s?.actor),'Organization context'],
    ['VERIFICATION',s?.verification?.required!==true||s?.verification?.verified===true,'Verification & Trust'],
    ['SUBSCRIPTION',s?.subscriptionRequired!==true||['active','grace'].includes(String(s?.accessState||'')),'Commercial access'],
    ['CAPABILITY',Object.values(s?.capabilities||{}).some(Boolean),'Capability access']
  ];
  return checks.map(([label,ok,detail])=>`<article class="tph-readiness ${ok?'ready':'blocked'}"><span>${ok?'✓':'!'}</span><div><b>${label}</b><small>${detail}</small></div><strong>${ok?'READY':'ACTION NEEDED'}</strong></article>`).join('');
}
function capabilityCards(s){
  const caps=s?.capabilities||{};
  const labels={createMissions:'Mission execution',createDrivers:'People & executors',shareForYou:'Private mission sharing',requestForYou:'Mission requests',shareNetwork:'Network collaboration',acceptNetwork:'Shared mission acceptance'};
  const entries=Object.entries(labels).map(([k,label])=>({k,label,ok:caps[k]===true}));
  return entries.map(x=>`<article class="tph-row"><div><b>${esc(x.label)}</b><small>Canonical capability state</small></div><span class="tph-badge ${x.ok?'ready':'blocked'}">${x.ok?'AVAILABLE':'RESTRICTED'}</span></article>`).join('')||'<div class="tph-empty">No capability state is currently available.</div>';
}
function comms(d){
  const items=Array.isArray(d?.notifications)?d.notifications:(Array.isArray(d?.items)?d.items:[]);
  return items.slice(0,6).map(n=>`<article class="tph-row"><div><b>${esc(n.title||n.type||'Mission communication')}</b><small>${esc(n.body||n.message||'')}${n.created_at?' · '+esc(n.created_at):''}</small></div><span class="tph-badge ${n.read_at?'':'unread'}">${n.read_at?'READ':'NEW'}</span></article>`).join('')||'<div class="tph-empty">No new communication. Mission messages and system notifications remain in their canonical context.</div>';
}
function journey(s,o){
  const missions=Number(o?.summary?.totalMissions??o?.missionCount??o?.metrics?.totalMissions??0);
  const hasPeople=Boolean(o?.peopleCount||o?.summary?.people||s?.people?.count);
  const verified=s?.verification?.required!==true||s?.verification?.verified===true;
  const commercial=s?.subscriptionRequired!==true||['active','grace'].includes(String(s?.accessState||''));
  const capability=Object.values(s?.capabilities||{}).some(Boolean);
  return [
    ['ACTIVATE','Organization',Boolean(s?.membership?.companyId||s?.account?.companyId||s?.actor),'Your organization context'],
    ['TRUST','Verification',verified,'Verification & Trust'],
    ['ACCESS','Capability',commercial&&capability,'Commercial and capability access'],
    ['PEOPLE','People',hasPeople,'Add the people who execute work'],
    ['MISSION','First mission',missions>0,'Create the first operational mission'],
    ['EXECUTE','Execution',missions>0&&s?.readyToGo===true,'Assign responsibility and execute'],
  ];
}
function renderJourney(s,o){
  const steps=journey(s,o);
  const current=steps.find(x=>!x[2])||steps[steps.length-1];
  const host=$('#tphJourney'); if(!host)return;
  host.innerHTML=`<div class="tph-journey-head"><div><span class="exp-kicker">PRODUCT JOURNEY</span><h3>${esc(current[0]==='EXECUTE'?'Your operation is ready':'Next: '+current[1])}</h3><p>Move from readiness to the first successful operational outcome without leaving the canonical workspace.</p></div></div><div class="journey-rail">${steps.map((x,i)=>`<article class="journey-step" data-state="${x[2]?'ready':i===steps.findIndex(y=>!y[2])?'current':'blocked'}"><small>0${i+1} · ${esc(x[0])}</small><b>${esc(x[1])}</b><em>${esc(x[3])}</em></article>`).join('')}</div><div class="tph-first-outcome"><div><b>${current[2]?'Continue execution':'Complete '+current[1]}</b><p>${current[2]?'Your first-outcome path is complete. Open Work to continue the current operation.':'The platform has identified the next product milestone from canonical situation and operational state.'}</p></div><button id="tphJourneyAction">${current[2]?'OPEN WORK':'OPEN NEXT STEP'}</button></div>`;
  $('#tphJourneyAction').onclick=()=>{if(current[0]==='TRUST')location.href='/app#account?activation=1';else if(current[0]==='ACCESS')location.href='/app#account?activation=1';else document.querySelector('[data-exp-area=work]')?.click();};
}
function nextStep(s){
  if(s?.verification?.required&&!s?.verification?.verified)return {title:'Complete verification & Trust',text:'Your organization needs verification before the operational workspace is fully ready.',href:'/app#account?activation=1'};
  if(s?.subscriptionRequired&&s?.subscriptionClass==='eligible'&&!['active','grace'].includes(String(s?.accessState||'')))return {title:'Resolve subscription readiness',text:'Commercial access is currently restricted. Review the canonical subscription state.',href:'/app#account?activation=1'};
  const denied=Object.values(s?.capabilities||{}).every(v=>v!==true);
  if(denied)return {title:'Review available capabilities',text:'No operational capability is currently enabled for this organization.',href:'/app#account?activation=1'};
  const active=s?.readyToGo===true;
  if(active)return {title:'Continue current work',text:'Your workspace is ready. Mission Workspace remains the canonical execution surface.',area:'work'};
  return {title:'Open Mission Workspace',text:'Review current work and the next valid mission action.',area:'work'};
}
async function load(){
  mount();setState('loading','Loading canonical product context…');
  try{
    const [s,o,n]=await Promise.all([api('/api/user/situation',{cache:'no-store'}),api('/api/tenant/overview',{cache:'no-store'}),api('/api/notifications',{cache:'no-store'})]);
    state.situation=s?.situation||{};state.overview=o||{};state.notifications=n||{};state.error=null;
    $('#tphSummary').textContent=`${state.situation.companyName||state.situation.account?.companyName||'Your organization'} · ${state.situation.readyToGo?'ready for execution':'readiness requires attention'}`;
    setState('ready',state.situation.readyToGo?'Your product workspace is operational.':'The platform has identified the next readiness step.');
    $('#tphReadiness').innerHTML=readinessCards(state.situation);
    $('#tphCapabilities').innerHTML=capabilityCards(state.situation);
    renderJourney(state.situation,state.overview);
    $('#tphComms').innerHTML=comms(state.notifications);
    const next=nextStep(state.situation);$('#tphNextTitle').textContent=next.title;$('#tphNextText').textContent=next.text;const b=$('#tphNextAction');b.textContent=next.area?'OPEN WORK':'OPEN';b.onclick=()=>next.area?document.querySelector('[data-exp-area="work"]')?.click():(location.href=next.href);
    document.querySelectorAll('[data-access-capability]').forEach(el=>{const key=el.dataset.accessCapability;const allowed=state.situation.capabilities?.[key]===true;el.classList.toggle('tph-capability-hidden',!allowed);el.setAttribute('aria-disabled',String(!allowed));if(!allowed&&el.tagName==='BUTTON')el.disabled=true;});
    window.dispatchEvent(new CustomEvent('onmission:product-context',{detail:{situation:state.situation,overview:state.overview}}));
  }catch(e){state.error=e;setState('error',e.message||'Workspace context is temporarily unavailable.');const b=$('#tphNextAction');if(b){b.textContent='RETRY';b.onclick=load;}}
}
window.addEventListener('onmission:activation-refresh',load);
window.addEventListener('canonical-access-refresh',load);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
