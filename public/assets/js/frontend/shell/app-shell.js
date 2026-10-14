import {api,esc} from '../core/api.js';
import {loadSituation,getSituation,clearSituation} from '../situation/store.js';
import {visibleNav,canonicalizeAppHash} from '../navigation/registry.js';
import {resolveTrustedNavigation} from '../product-experience.js';
import {readExperienceContext,writeExperienceContext,contextLabel} from '../core/experience-context.js';

export async function mountShell({root,admin=false,world='app',render}){
  try{
    await loadSituation();
    const s=getSituation();
    if(!s.session)return location.replace('/login.html');
    if(admin&&s.session.role!=='platform_admin')return location.replace('/app/');
    renderShell(root,s,{admin,world});
    await render({root,s,go:navigate});
    const onHash=()=>{writeExperienceContext({workspace:location.hash.replace('#','').split('?')[0]||'home',countryCode:s.session?.countryCode||s.situation?.countryCode||''},admin?'admin':'app');const c=document.querySelector('#experienceContext');if(c)c.textContent=contextLabel(readExperienceContext(admin?'admin':'app'));render({root,s,go:navigate})};
    window.addEventListener('hashchange',onHash);
    return s;
  }catch(e){
    if(Number(e?.status)===401)return location.replace('/login.html');
    renderAccessFailure(root,e);
  }
}
function renderAccessFailure(root,e){
  root.innerHTML=`<main class="onm-access-recovery"><section class="onm-surface onm-card onm-access-card"><div class="onm-eyebrow">ON MISSION · ACCESS</div><h1>Workspace temporarily unavailable.</h1><p class="onm-muted">${esc(e.message||'The session could not be verified.')}</p><div class="onm-state-actions"><button class="onm-btn onm-btn-primary" id="retryWorkspace">RETRY</button><button class="onm-btn" id="logoutWorkspace">SIGN OUT</button><a class="onm-btn" href="/">HOME</a></div><div id="workspaceRecoveryMsg" class="onm-muted"></div></section></main>`;
  root.querySelector('#retryWorkspace')?.addEventListener('click',()=>location.reload());
  root.querySelector('#logoutWorkspace')?.addEventListener('click',async()=>{
    const msg=root.querySelector('#workspaceRecoveryMsg');
    try{await api('/api/auth/logout',{method:'POST'});clearSituation();msg.textContent='Signed out. Returning to Mission Execution…';setTimeout(()=>location.href='/',250);}
    catch(error){msg.textContent=error.message||'Sign out could not be completed. Retry.';}
  });
}
function renderShell(root,s,{admin,world}){
  if(!admin){const canonical=canonicalizeAppHash(location.hash);if(canonical!==location.hash)history.replaceState({onMission:true,canonical},'',canonical);}
  const base=visibleNav(s.situation);
  const dynamic=resolveTrustedNavigation(s.product,s.situation);
  const labels=new Map(dynamic.map(x=>[x.key,x.label]));
  const allowed=new Set(dynamic.map(x=>x.key));
  const nav=base.map(x=>[x.key,labels.get(x.key)||x.label,x.intent,x.description]);
  const surfaceContext=readExperienceContext(admin?'admin':'app');
  writeExperienceContext({countryCode:s.session?.countryCode||s.situation?.countryCode||surfaceContext.countryCode||'',workspace:location.hash.replace('#','').split('?')[0]||surfaceContext.workspace||'home'},admin?'admin':'app');
  const initial=readExperienceContext(admin?'admin':'app');
  const delegated=s.session?.actingAs||null;
  root.innerHTML=`<div class="app-shell ${admin?'admin-shell':''}">
    ${delegated?`<div class="delegated-context-banner ${delegated.demoSession?'demo-session-banner':''}" role="status"><div><b>${delegated.demoSession?'DEMO SESSION · ':''}SUPER ADMIN ${String(delegated.mode||'view').toUpperCase()} AS USER</b><span>${esc(delegated.demoSession?`${delegated.demoSession.scenarioCode||'demo'} · ${delegated.demoSession.persona||'user'}`:(delegated.reason||'Governed user context'))} · expires ${delegated.expiresAt?new Date(Number(delegated.expiresAt)).toLocaleTimeString():'soon'}</span></div><button id="exitDelegatedContext" class="onm-btn">EXIT ${delegated.demoSession?'DEMO & ':''}USER CONTEXT</button></div>`:''}
    <header class="app-top ${admin?'admin-top':''}">
      <a class="brand" href="#home"><span class="brand-mark">OM</span><span><b>ON MISSION</b><small>${admin?'PLATFORM CONTROL':'MISSION EXECUTION'}</small></span></a>
      <div class="top-right"><span class="org-label">${esc(s.situation?.organization?.name||s.session?.organizationName||'Personal workspace')}</span><span class="experience-context" id="experienceContext">${esc(contextLabel(initial))}</span><div class="user-menu"><span class="avatar">${esc(String(s.session?.name||s.session?.email||'U').trim().charAt(0).toUpperCase())}</span><button id="signout" class="onm-btn">SIGN OUT</button></div></div>
    </header>
    <div class="app-body">
      <aside class="side-nav ${admin?'admin-nav':''}"><div class="side-label">WORKSPACE</div><nav aria-label="Primary workspace">${nav.map(([k,l,intent,description])=>`<a class="nav-link" data-nav="${esc(k)}" data-nav-intent="${esc(intent||'workspace')}" href="#${esc(k)}" title="${esc(description||l)}"><span class="nav-link-mark" aria-hidden="true">${esc(String(l||'').slice(0,1))}</span><span class="nav-link-copy"><b>${esc(l)}</b><small>${esc(description||'Workspace')}</small></span></a>`).join('')}</nav><div class="nav-boundary"><b>CANONICAL BOUNDARY</b><span>One truth. One action path.</span></div></aside>
      <main class="app-main ${admin?'admin-main':''}" id="surface"></main>
    </div>
  </div>`;
  root.querySelector('#exitDelegatedContext')?.addEventListener('click',async()=>{const b=root.querySelector('#exitDelegatedContext');b.disabled=true;b.textContent='EXITING…';try{await api('/api/platform/admin/user-experience/context/end',{method:'POST',body:{}});location.href='/platform/access/admin/';}catch(error){b.disabled=false;b.textContent='EXIT USER CONTEXT';alert(error.message||'User context could not be ended.');}});
  root.querySelector('#signout').onclick=async()=>{
    const b=root.querySelector('#signout');b.disabled=true;b.textContent='SIGNING OUT…';
    try{await api('/api/auth/logout',{method:'POST'});clearSituation();location.href='/';}
    catch(error){b.disabled=false;b.textContent='SIGN OUT';alert(error.message||'Sign out could not be completed.');}
  };
  syncNav();
}
export function syncNav(){const k=canonicalizeAppHash(location.hash).replace('#','').split('?')[0]||'home';document.querySelectorAll('[data-nav]').forEach(x=>{const active=x.dataset.nav===k;x.classList.toggle('active',active);x.setAttribute('aria-current',active?'page':'false');});}
export function navigate(k){const canonical=canonicalizeAppHash(`#${k}`);location.hash=canonical.replace(/^#/,'');syncNav();}
