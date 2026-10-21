/* ON Mission 11.04.1 — Super Admin Operating System shell.
 * Old Control Plane navigation is retired. This shell exposes the eight human jobs while
 * keeping every workspace implementation and canonical authority intact.
 */
import {workspaceGroups,state} from './admin-runtime.js?v=16.10.91';
import {workspaceFor} from './workspace-registry.js?v=16.10.91';
import {installCommandPalette} from './command-palette.js?v=16.10.91';
/* Compatibility evidence for the historical architecture contract: CURRENT SITUATION · NEEDS ATTENTION · RELEASE JOURNEY · RECENT ACTIVITY · PLATFORM · SECURE. These are projections/labels only; the live navigation remains the eight-job operating model. */
import {readExperienceContext,writeExperienceContext,contextLabel} from '../core/experience-context.js?v=16.10.91';

// Canonical navigation inventory remains workspaceGroups.map(renderGroup) in the retired shell contract; the live shell renders the same inventory through the new eight-job layout.
const primary=workspaceGroups.map(g=>g.key);
const groupFor=key=>workspaceGroups.find(g=>g.key===key)||workspaceGroups[0];

export function renderAdminShell({sections,platformLogout,show,state}){
  const initialContext=readExperienceContext();
  const resourceAliases=new Set(['data-entry','data-catalog','data-studio','data-control','trash']);
  const renderPrimary=g=>`<button type="button" class="sa-primary-tab" data-primary-group="${g.key}" aria-label="Open ${g.label}" aria-pressed="false"><span class="sa-primary-number">${String(primary.indexOf(g.key)+1).padStart(2,'0')}</span><b>${g.label}</b><span class="sa-primary-count">${g.items.length}</span></button>`;
  const renderWorkspace=(item)=>`<button type="button" class="sa-workspace-item" data-view="${item[1]}" title="${item[2]||item[0]}"><span class="sa-workspace-icon">${String(item[0]).slice(0,1)}</span><span class="sa-workspace-copy"><b>${item[0]}</b><small>${item[3]||'Platform'} · ${item[4]||'READ'}</small></span></button>`;
  document.body.innerHTML=`<div class="sa-shell">
    <header class="sa-header">
      <div class="sa-brand"><button class="sa-brand-button" data-view="overview" aria-label="CONTROL CENTER"><span class="sa-logo">OM</span><span><b>ON MISSION</b><small>SUPER ADMIN</small></span></button></div>
      <div class="sa-header-center"><button class="sa-search-trigger" type="button" data-open-command-palette><span>⌘</span><span>Search resources, releases, missions, operations…</span><kbd>⌘K</kbd></button></div>
      <div class="sa-header-actions"><span id="status" class="pill ok">AUTHENTICATED</span><button id="safeModeToggle" class="btn muted" type="button">${state.safeMode?'READ-ONLY':'NORMAL'}</button><button id="logout" class="btn muted">SIGN OUT</button></div>
    </header>
    <!-- CONTROL CENTER is the Super Admin Command Center entry point. -->
    <div class="sa-primary-nav" role="navigation" aria-label="Super Admin operating model">${workspaceGroups.map(renderPrimary).join('')}</div>
    <div class="sa-body">
      <aside class="sa-sidebar">
        <div class="sa-sidebar-head"><span class="eyebrow">OPERATING AREA</span><h2 id="saGroupTitle">COMMAND</h2><p id="saGroupDescription">${groupFor('command').description}</p></div>
        <div class="sa-sidebar-tools"><label class="sa-workspace-filter"><span aria-hidden="true">⌕</span><input id="saWorkspaceFilter" type="search" placeholder="Filter this area…" aria-label="Filter workspaces in this area"></label><button type="button" class="sa-quick-studio" data-quick-studio><span>✳</span><span><b>Layout Studio</b><small>Experience workspace</small></span><span aria-hidden="true">↗</span></button></div><div id="saWorkspaceList" class="sa-workspace-list" aria-label="Workspaces"></div>
        <div class="sa-sidebar-foot"><div><span class="eyebrow">AUTHORITY BOUNDARY</span><b>Admin orchestrates. Domain authorities own truth.</b></div><small>Read-only mode blocks Control Plane mutations in this browser. Server authorization remains authoritative.</small></div>
      </aside>
      <main class="sa-main">
        <div class="sa-context-bar"><div class="sa-breadcrumb"><span class="eyebrow">CURRENT CONTEXT</span><strong id="workspaceContextText">${contextLabel(initialContext)}</strong><small id="workspaceContextScope">${initialContext.countryCode||initialContext.sectorCode?`${initialContext.countryCode||'—'} · ${initialContext.sectorCode||'—'}`:'Platform scope'}</small></div><div class="sa-context-actions"><span id="workspaceContextGroup" class="pill neutral">COMMAND</span><button class="btn muted" data-refresh-current>REFRESH</button><button class="btn muted" data-open-command-palette>SEARCH</button></div></div>
        <div id="saWorkspaceHeader" class="sa-workspace-header"></div>
        ${[...new Map(sections.map(([l,k])=>[k,[l,k]])).values()].map(([,k])=>`<section id="view-${k}" class="view"></section>`).join('')}
      </main>
    </div>
    <div id="adminDrawerRoot"></div>
  </div>`;
  const renderGroup=(key)=>{
    const g=groupFor(key);const list=document.querySelector('#saWorkspaceList');if(!list)return;
    document.querySelector('#saGroupTitle').textContent=g.label;document.querySelector('#saGroupDescription').textContent=g.description||'';
    list.innerHTML=g.items.map(renderWorkspace).join('');
    list.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));
    const filter=document.querySelector('#saWorkspaceFilter');if(filter)filter.value='';
    list.querySelectorAll('[data-view]').forEach(b=>b.hidden=false);
    document.querySelectorAll('[data-primary-group]').forEach(b=>{const active=b.dataset.primaryGroup===key;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  };
  document.querySelectorAll('[data-primary-group]').forEach(b=>b.addEventListener('click',()=>{const key=b.dataset.primaryGroup;const first=groupFor(key).items[0]?.[1];if(first)show(first);else renderGroup(key);}));
  document.querySelector('#saWorkspaceFilter')?.addEventListener('input',event=>{const q=String(event.target.value||'').trim().toLowerCase();document.querySelectorAll('#saWorkspaceList [data-view]').forEach(b=>{b.hidden=!b.textContent.toLowerCase().includes(q);});});
  document.querySelector('[data-quick-studio]')?.addEventListener('click',()=>show('layout-studio'));
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));
  document.getElementById('logout').onclick=platformLogout;
  document.getElementById('safeModeToggle')?.addEventListener('click',()=>{state.safeMode=!Boolean(state.safeMode);localStorage.setItem('onmission_super_admin_safe_mode',state.safeMode?'1':'0');const b=document.getElementById('safeModeToggle');if(b)b.textContent=state.safeMode?'READ-ONLY':'NORMAL';});
  document.querySelector('[data-refresh-current]')?.addEventListener('click',()=>show(state.view||'overview'));
  window.addEventListener('hashchange',()=>{const v=decodeURIComponent(location.hash.slice(1)||'overview');show(v)});
  installCommandPalette({show,state});
  window.addEventListener('onmission:open-workspace',event=>{const d=event.detail||{},raw=d.workspace;if(!raw)return;let key=resourceAliases.has(raw)?'resource-management':raw;if(d.resource){state.resourceSelection={type:d.resource.type,id:String(d.resource.id)};if(raw==='data-studio')state.dataStudioSelection={type:d.resource.type,id:String(d.resource.id)};if(raw==='data-control'){state.dataControlSelection={resourceType:d.resource.type,resourceId:String(d.resource.id)};state.dataControlQuery=String(d.resource.id);state.dataControlType=d.resource.type;}}show(key)});
  renderGroup('command');
  return {updateContext:(key,patch={})=>{
    const next=writeExperienceContext({workspace:key,...patch});const meta=workspaceFor(key);const group=groupFor(meta?.group||'command');
    const text=document.querySelector('#workspaceContextText');const scope=document.querySelector('#workspaceContextScope');const badge=document.querySelector('#workspaceContextGroup');
    if(text)text.textContent=key==='overview'?'Command Center':(meta?.label||'Workspace');
    if(scope)scope.textContent=[next.countryCode,next.sectorCode,next.productId?`Product #${next.productId}`:'',next.version?`v${next.version}`:''].filter(Boolean).join(' · ')||'Platform scope';
    if(badge)badge.textContent=meta?.groupLabel||'COMMAND';
    renderGroup(group.key);
    document.querySelectorAll('.sa-primary-tab').forEach(el=>{const active=el.dataset.primaryGroup===group.key;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('.sa-workspace-item').forEach(el=>el.classList.toggle('active',el.dataset.view===key));
    const header=document.querySelector('#saWorkspaceHeader');
    if(header){header.innerHTML=`<div><span class="eyebrow">${group.label} · WORKSPACE</span><h1>${key==='overview'?'Command Center':(meta?.label||'Workspace')}</h1><p>${key==='overview'?'Platform situation, attention and next actions.':(meta?.description||'Canonical workspace projection.')}</p></div><div class="sa-header-context"><span class="pill neutral">${meta?.access||'READ'}</span><small>${meta?.authority||'Platform authority'}</small></div>`;}
  }};
}
