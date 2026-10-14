import {api} from './api.js';
import {clearSession,saveAccessSession} from './session.js';

const ROLE_LABEL={admin:'Tenant',driver:'Executor',executor:'Independent Executor'};
let sessionCache=null;

function dashboardFor(session){
  const role=session?.role;
  if(role==='admin')return ['owner','admin'].includes(session?.organizationRole||'admin')?'/app':'/app#work';
  if(role==='driver'||role==='executor')return '/app#work';
  return '/';
}
async function sessionState(){
  if(sessionCache!==null)return sessionCache;
  try{const d=await api('/api/auth/session?optional=1',{cache:'no-store'});sessionCache=d?.authenticated&&d.session?d.session:null;if(sessionCache)saveAccessSession(sessionCache);return sessionCache;}catch{sessionCache=null;return null;}
}
function enhanceExisting(){
  const brand=document.querySelector('.exp-brand,.experience-logo,.cockpit-logo,.role-rail-brand');
  if(brand&&!brand.dataset.rootNavigation){brand.dataset.rootNavigation='1';brand.style.cursor='pointer';brand.setAttribute('role','link');brand.setAttribute('tabindex','0');const go=async()=>{const s=await sessionState();location.href=dashboardFor(s)};brand.addEventListener('click',go);brand.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});}
}
function mountNav(){
  enhanceExisting();
  if(document.querySelector('.global-site-nav')||document.body.dataset.globalNav==='skip'||document.querySelector('.dashboard-experience,.cockpit-shell'))return;
  const nav=document.createElement('header');nav.className='global-site-nav';nav.innerHTML=`<a class="global-brand" href="/" data-global-logo aria-label="ON Mission home"><span class="global-mark">ON</span><span class="global-wordmark">ON MISSION</span></a><nav class="global-links" aria-label="Site navigation"><a class="global-link" href="/">Home</a><a class="global-link" href="/register.html">Get started</a><a class="global-link global-primary" href="/foryou/">Private mission access</a><span class="global-status" id="globalStatus">Offline-ready</span><button class="global-account" id="globalAccount" type="button" aria-expanded="false" aria-controls="globalAccountDrawer"><span aria-hidden="true">◉</span><span>Account</span></button></nav>`;
  document.body.prepend(nav);
  const drawer=document.createElement('aside');drawer.id='globalAccountDrawer';drawer.className='global-account-drawer';drawer.hidden=true;drawer.innerHTML='<h3>Account</h3><p>Secure access, verification and your current ON Mission workspace.</p><div class="global-account-actions" id="globalAccountActions"></div>';document.body.append(drawer);
  const account=nav.querySelector('#globalAccount');account.addEventListener('click',async()=>{const open=!drawer.hidden;drawer.hidden=open;account.setAttribute('aria-expanded',String(!open));if(!open)renderAccount(await sessionState());});
  document.addEventListener('click',e=>{if(!drawer.hidden&&!drawer.contains(e.target)&&!account.contains(e.target)){drawer.hidden=true;account.setAttribute('aria-expanded','false');}}, {passive:true});
  nav.querySelector('[data-global-logo]').addEventListener('click',async e=>{e.preventDefault();const s=await sessionState();if(s)location.href=dashboardFor(s);else location.href='/';});
  refreshNavState(nav);
}
async function refreshNavState(nav){const s=await sessionState();const status=nav.querySelector('#globalStatus');if(s){status.textContent=ROLE_LABEL[s.role]||'Signed in';status.dataset.online='true';nav.querySelector('.global-primary')?.setAttribute('href',dashboardFor(s));}else{status.textContent='Public';status.dataset.online='false';}}
function renderAccount(s){const host=document.querySelector('#globalAccountActions');if(!host)return;if(!s){host.innerHTML='<a href="/login.html">Sign in <span>→</span></a><a href="/register.html">Create a company account <span>→</span></a><a href="/driver">Create an independent executor account <span>→</span></a>';return;}const dash=dashboardFor(s);host.innerHTML=`<a href="${dash}">Open workspace <span>→</span></a><a href="/app#account?activation=1">Verification & Trust <span>→</span></a>${s.role==='admin'?'<a href="/app#account?activation=1">Billing & plans <span>→</span></a>':''}<button type="button" id="globalLogout">Sign out <span>↪</span></button>`;host.querySelector('#globalLogout')?.addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST'});}catch{}clearSession();sessionCache=null;location.href='/';});}
mountNav();
