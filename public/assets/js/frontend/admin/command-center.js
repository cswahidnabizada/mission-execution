/* ON Mission 10.79.0 — unified operational Command Center */
import {workspaceFor} from './workspace-registry.js?v=16.10.12';
import {statusTone,displayValue,escapeHtml} from './ui-system.js?v=16.10.12';
import {ADMIN_WORKSPACE_GROUPS} from './workspace-registry.js?v=16.10.12';
import {openAdminDrawer} from './detail-drawer.js?v=16.10.12';
import {governanceReadiness,renderGovernanceReadiness} from './governance-readiness.js?v=16.10.12';

export async function renderCommandCenter({$,state,esc,loadCommandCenter,api,navigate}){
 const box=$('#view-overview');
 if(!box)return;
 if(typeof navigate!=='function')throw new TypeError('Canonical admin navigation is unavailable');
 box.innerHTML='<div class="cc-loading"><div class="eyebrow">SUPER ADMIN · CONTROL CENTER</div><h1 class="title">Composing platform situation…</h1><p class="sub">Reading canonical platform authorities. No default state is substituted.</p></div>';
 const fmt=v=>displayValue(v,{unknown:'UNAVAILABLE'});
 const tone=s=>statusTone(s);
 const openWorkItem=async(item)=>{const key=item?.action||'overview';if(key==='product-publisher'&&item?.resourceId){state.publisher={...(state.publisher||{}),launchId:Number(item.resourceId)||null,countryCode:item.countryCode||state.publisher?.countryCode||''};}if(key==='product-verification'&&item?.resourceId){state.productVerificationRunId=Number(item.resourceId)||null;}await navigate(key)};
 const action=(key,label='OPEN')=>`<button class="btn ${key===state.view?'primary':'muted'}" data-command-action="${escapeHtml(key)}">${escapeHtml(label)}</button>`;
 const metric=(label,value,meta,key,t='')=>`<button class="control-metric" data-command-action="${escapeHtml(key||'overview')}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(fmt(value))}</strong><small>${escapeHtml(meta||'Open workspace')}</small>${t?`<em class="pill ${tone(t)}">${escapeHtml(t)}</em>`:''}</button>`;
 try{
  const cc=await loadCommandCenter(state.commandScope||{}); const osResponse=typeof api==='function'?await api('/api/platform/admin/operating-system'):null; const os=osResponse?.operatingSystem||{}; const s=cc.surface||{};const p=s.preview||{};const queue=s.queue||[];const lifecycle=s.lifecycle||[];const workspaceStates=Object.fromEntries((s.workspaceStates||[]).map(x=>[x.key,x]));const unavailable=cc.unavailableAuthorities||[];
  const governance=governanceReadiness(state.data||{});
  const categories=ADMIN_WORKSPACE_GROUPS.map(group=>({...group,workspaces:group.items.map(([label,key,description,authority,access,journey])=>({label,key,description,authority,access,journey,...(workspaceStates[key]||{})}))}));
  const stats=Object.fromEntries((s.stats||[]).map(x=>[x.key,x]));
  const attention=queue.slice(0,1);
  const working=cc.next||cc.now||{};
  const primaryAttention=attention.find(q=>q&&q.action)||null;
  const situationActionKey=primaryAttention?.action||working.actionKey||'product-health';
  const situationActionLabel=primaryAttention?.label==='Continue build'?'CONTINUE PRODUCT BUILD':(primaryAttention?.label?String(primaryAttention.label).toUpperCase():(working.actionLabel||'CONTINUE'));
  const platformHealth=s.status||'UNKNOWN';
  const securityStatus=unavailable.length||governance.overall==='UNAVAILABLE'?'CHECK':governance.overall==='ATTENTION'?'REVIEW':'PROTECTED';
  const workingTitle=working.title||p.productStatus||'Platform';
  const workingReason=working.reason||cc.now?.reason||'Continue the next governed platform step.';
  const readiness=p.readinessPercent==null?null:Number(p.readinessPercent);
  const categoryCards=categories.map(cat=>{
    const items=(cat.workspaces||[]).map(w=>({...(workspaceFor(w.action)||{}),...w}));
    return `<section class="control-area" id="command-category-${escapeHtml(cat.key)}"><header class="control-area-head"><div><span class="eyebrow">${escapeHtml(cat.label)}</span><h2>${escapeHtml(cat.label)}</h2><p class="sub">${escapeHtml(cat.description||'')}</p></div><button class="text-action" data-open-group="${escapeHtml(cat.key)}">VIEW ALL</button></header><div class="workspace-index-grid">${items.map(w=>`<article class="workspace-index-card"><div class="workspace-index-top"><span class="workspace-icon">${escapeHtml((w.label||'W').slice(0,1))}</span><div><h3>${escapeHtml(w.label||'Workspace')}</h3><span class="pill ${tone(w.status)}">${escapeHtml(w.status||'AVAILABLE')}</span></div></div><p>${escapeHtml(w.description||'')}</p><div class="workspace-governance-meta"><span>${escapeHtml(w.authority||'Canonical authority')}</span><span>${escapeHtml(w.access||'READ')} · ${escapeHtml(w.journey||'OPERATE')}</span></div><div class="workspace-index-foot"><span>${w.count==null?'No aggregate':escapeHtml(String(w.count))+' records'}</span><button class="btn muted" data-command-action="${escapeHtml(w.action||w.key||'overview')}">OPEN</button></div></article>`).join('')}</div></section>`;
  }).join('');
  box.innerHTML=`<div class="control-center">
    <header class="control-hero">
      <div><span class="eyebrow">ON MISSION · PLATFORM CONTROL</span><h1 class="title">Control Center</h1><p class="sub">One operational surface for situation, work, system health and governed platform navigation.</p></div>
      <div class="control-hero-actions"><span class="pill ${tone(platformHealth)}">${escapeHtml(platformHealth)}</span><span class="mini">v${escapeHtml(s.version||'—')}</span>${action('overview','REFRESH')}</div>
    </header>

    <section class="os-command-strip">
      <article class="os-command-health"><span class="eyebrow">PLATFORM POSTURE</span><strong>${escapeHtml(os.health||platformHealth)}</strong><small>${escapeHtml(os.unavailableAuthorities?.length?`${os.unavailableAuthorities.length} canonical authorities unavailable`:'Canonical platform reads available')}</small></article>
      <article><span class="eyebrow">ORGANIZATIONS</span><b>${fmt(os.platform?.organizations)}</b><small>Governed organizations</small></article>
      <article><span class="eyebrow">LIVE PRODUCTS</span><b>${fmt(os.platform?.liveProducts)}</b><small>Active country launches</small></article>
      <article><span class="eyebrow">MISSIONS</span><b>${fmt(os.platform?.activeMissions)}</b><small>Non-terminal missions</small></article>
      <article><span class="eyebrow">OPERATIONS</span><b>${fmt(os.platform?.operationsInFlight)}</b><small>Administrative operations in flight</small></article>
      <article><span class="eyebrow">SAFE MODE</span><button class="btn ${state.safeMode?'primary':'muted'}" id="toggleSafeMode">${state.safeMode?'READ-ONLY':'NORMAL'}</button><small>UI mutation guard</small></article>
    </section>

    <section class="situation-card card">
      <div class="situation-main"><span class="eyebrow">CURRENT SITUATION</span><h2>${escapeHtml(p.productStatus||'PLATFORM STATUS')}</h2><p class="situation-message">${escapeHtml(cc.now?.reason||'Platform state is being evaluated.')}</p><div class="situation-actions">${action(situationActionKey,attention.length?situationActionLabel:(working.actionLabel||'CONTINUE'))}</div></div>
      <div class="situation-state"><span class="state-dot ${tone(platformHealth)}"></span><b>${escapeHtml(platformHealth)}</b><small>${unavailable.length?`${unavailable.length} authority${unavailable.length===1?'':'ies'} unavailable`: 'Canonical platform reads available'}</small></div>
    </section>

    <section class="control-metrics">
      <div class="metric-group"><span class="eyebrow">PRODUCTS</span>${metric('Live products',stats['active-products']?.value,'Active country products','product-health',Number(stats['active-products']?.value||0)>0?'LIVE':'ATTENTION')}${metric('Readiness',readiness==null?null:`${readiness}%`,'Governed launch readiness','product-publisher',readiness===100?'READY':'ATTENTION')}</div>
      <div class="metric-group"><span class="eyebrow">OPERATIONS</span>${metric('Open work',stats['open-work']?.value,'Actionable or diagnostic work',working.actionKey||'overview',Number(stats['open-work']?.value||0)>0?'ATTENTION':'HEALTHY')}${metric('In flight',stats['in-flight']?.value,'Administrative operations','system-health',Number(stats['in-flight']?.value||0)>0?'IN PROGRESS':'HEALTHY')}</div>
      <div class="metric-group"><span class="eyebrow">SECURITY</span>${metric('Security posture',securityStatus,unavailable.length?'Review authority availability':'Protection boundaries operational','security',securityStatus)}${metric('Organizations',stats.organizations?.value,'Governed organizations','companies')}</div>
    </section>

    ${renderGovernanceReadiness(governance,{navigate})}

    <section class="control-work-grid">
      <section class="card section working-card"><header class="section-head"><div><span class="eyebrow">WORKING ON</span><h2>${escapeHtml(workingTitle)}</h2><p class="sub">${escapeHtml(workingReason)}</p></div><span class="pill ${tone(readiness===100?'READY':'IN PROGRESS')}">${readiness==null?'—':`${readiness}%`}</span></header><div class="working-progress"><div class="working-progress-bar"><span style="width:${Math.max(0,Math.min(100,readiness??0))}%"></span></div><div class="working-progress-meta"><span>Product preparation / platform readiness</span><b>${readiness==null?'UNAVAILABLE':`${readiness}%`}</b></div></div><div class="actions">${action(working.actionKey||'product-publisher',working.actionLabel||'CONTINUE')}</div></section>
      <section class="card section attention-card"><header class="section-head"><div><span class="eyebrow">CURRENT ACTION</span><h2>${attention.length?'One governed action':'Nothing requires action'}</h2><p class="sub">Only the highest-priority current action is presented. Other work remains discoverable through the workspace launcher.</p></div></header><div class="attention-list">${attention.map((q,i)=>`<article class="attention-row"><span class="attention-index">${i+1}</span><div><b>${escapeHtml(q.title||'Platform item')}</b><span>${escapeHtml(q.type||'work')} · ${escapeHtml(q.status||'')}</span></div><span class="pill ${tone(q.status)}">${escapeHtml(q.label||q.status||'OPEN')}</span><div class="attention-actions"><button class="btn muted" data-attention-detail="${i}">DETAILS</button><button class="btn primary" data-command-action="${escapeHtml(q.action||'overview')}">OPEN</button></div></article>`).join('')||'<div class="empty">No actionable work is currently projected.</div>'}</div></section>
    </section>

    <section class="card section release-card"><header class="section-head"><div><span class="eyebrow">RELEASE JOURNEY</span><h2>Product lifecycle</h2><p class="sub">The Control Center shows where governed product versions are in the release chain.</p></div><div class="actions">${action('product-publisher','OPEN MARKET FACTORY')}${action('product-verification','OPEN TEST LAB')}</div></header><div class="journey-track">${lifecycle.map((x,i)=>`<button class="journey-step ${x.count?'reached':''}" data-command-action="product-publisher"><span>${i+1}</span><b>${escapeHtml(x.label)}</b><strong>${escapeHtml(fmt(x.count))}</strong></button>`).join('')}</div></section>

    <section class="card section platform-context"><header class="section-head"><div><span class="eyebrow">PLATFORM CONTEXT</span><h2>Inspect a governed scope</h2><p class="sub">Context changes projections only. It never mutates a country, product, tenant or policy.</p></div><span class="pill ok">READ ONLY</span></header><div class="context-grid"><label class="field">Country<input id="commandCountry" class="input" maxlength="2" value="${escapeHtml(cc.productLens?.countryCode||'')}" placeholder="DE" autocomplete="off"></label><label class="field">Sector<input id="commandSector" class="input" maxlength="80" value="${escapeHtml(cc.productLens?.sectorCode||'')}" placeholder="logistics" autocomplete="off"></label><div class="context-result"><span>Selected scope</span><b>${escapeHtml(cc.productLens?.productState||'PLATFORM')}</b><small>${escapeHtml(cc.productLens?.result||'Select a country and sector.')}</small></div><div class="actions"><button class="btn primary" id="commandApplyScope">APPLY CONTEXT</button><button class="btn muted" id="commandClearScope">CLEAR</button></div></div></section>

    <section class="control-explorer"><header class="control-area-head"><div><span class="eyebrow">EXPLORE PLATFORM</span><h2>Workspaces</h2><p class="sub">One registry, one route per capability. Use the launcher for fast access.</p></div><button class="btn primary" data-open-command-palette>OPEN WORKSPACE LAUNCHER</button></header><div class="explorer-tabs">${categories.map((cat,i)=>`<button class="explorer-tab ${i===0?'active':''}" data-explorer-tab="${escapeHtml(cat.key)}">${escapeHtml(cat.label)}</button>`).join('')}</div><div class="explorer-panels">${categoryCards}</div></section>

    <section class="card section activity-card"><header class="section-head"><div><span class="eyebrow">RECENT ACTIVITY</span><h2>Administrative operations</h2><p class="sub">Evidence is shown here; canonical operation services own state transitions.</p></div><button class="btn muted" data-command-action="system-health">OPEN OPERATIONS</button><button class="btn muted" id="openCertification">OPEN CERTIFICATION</button></header><div class="activity-list">${(cc.recentOperations||[]).slice(0,8).map(o=>`<article class="activity-row"><div><b>${escapeHtml(o.action_code||'Administrative operation')}</b><span>${escapeHtml(o.resource_type||'resource')} ${o.resource_id?`#${escapeHtml(o.resource_id)}`:''}</span></div><span class="pill ${tone(o.status)}">${escapeHtml(o.status||'UNKNOWN')}</span><time>${escapeHtml(o.started_at||'—')}</time></article>`).join('')||'<div class="empty">No administrative operations recorded.</div>'}</div></section>

    ${unavailable.length?`<section class="card section authority-card"><header class="section-head"><div><span class="eyebrow">AUTHORITY AVAILABILITY</span><h2>Some canonical reads are unavailable</h2><div class="mini">AUTHORITY UNAVAILABLE is a distinct platform state; no certification or product result is inferred.</div><p class="sub">No empty values were substituted. Resolve the owning authority before treating the platform as healthy.</p></div><span class="pill bad">${unavailable.length} UNAVAILABLE</span></header><div class="authority-list">${unavailable.map(a=>`<div><b>${escapeHtml(a.authority)}</b><span>${escapeHtml(a.code||'AUTHORITY_UNAVAILABLE')}</span></div>`).join('')}</div></section>`:''}
  </div>`;

  const apply=()=>{state.commandScope={countryCode:$('#commandCountry')?.value.trim().toUpperCase()||'',sectorCode:$('#commandSector')?.value.trim().toLowerCase()||''};navigate('overview')};
  $('#toggleSafeMode')?.addEventListener('click',()=>{state.safeMode=!Boolean(state.safeMode);localStorage.setItem('onmission_super_admin_safe_mode',state.safeMode?'1':'0');navigate('overview')});
  $('#commandApplyScope')?.addEventListener('click',apply);
  $('#commandClearScope')?.addEventListener('click',()=>{state.commandScope={};navigate('overview')});
  box.querySelectorAll('[data-command-action]').forEach(b=>b.addEventListener('click',()=>openWorkItem({action:b.dataset.commandAction})));
  box.querySelectorAll('[data-governance-open]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.governanceOpen)));
  box.querySelectorAll('[data-attention-detail]').forEach(b=>b.addEventListener('click',()=>{const q=attention[Number(b.dataset.attentionDetail)];if(!q)return;const ws=workspaceStates[q.action]||{};openAdminDrawer({title:q.title||'Platform item',eyebrow:q.type?String(q.type).toUpperCase():'PLATFORM DETAIL',summary:q.reason||'Read-only operational detail. State transitions remain owned by the canonical authority.',facts:[{label:'Status',value:q.status||'UNKNOWN'},{label:'Next step',value:q.label||'OPEN'},{label:'Authority',value:ws.authority||'Canonical authority'},{label:'Resource',value:q.resourceId?`#${q.resourceId}`:'Platform scope'}],actionLabel:'OPEN WORKSPACE',onAction:()=>openWorkItem(q)})}));
  box.querySelector('#openCertification')?.addEventListener('click',()=>navigate('certification'));
  box.querySelectorAll('[data-explorer-tab]').forEach(tab=>tab.addEventListener('click',()=>{box.querySelectorAll('[data-explorer-tab]').forEach(x=>x.classList.toggle('active',x===tab));box.querySelectorAll('.control-area').forEach(x=>x.classList.toggle('explorer-hidden',x.id!==`command-category-${tab.dataset.explorerTab}`));box.querySelector(`#command-category-${tab.dataset.explorerTab}`)?.scrollIntoView({behavior:'smooth',block:'start'})}));
  const first=box.querySelector('.control-area');box.querySelectorAll('.control-area').forEach(x=>x.classList.toggle('explorer-hidden',x!==first));
 }catch(e){
  box.innerHTML=`<section class="card section error-state"><div class="eyebrow">CONTROL CENTER ERROR</div><h2>The platform situation could not be composed.</h2><p class="sub">No platform state was changed. The error is surfaced instead of replacing canonical data with defaults.</p><div class="notice">${escapeHtml(e.message||'Control Center unavailable')}</div><div class="actions"><button class="btn primary" id="retryCommandCenter">RETRY</button><button class="btn muted" id="openSystemHealth">OPEN SYSTEM HEALTH</button></div></section>`;
  box.querySelector('#retryCommandCenter')?.addEventListener('click',()=>navigate('overview'));box.querySelector('#openSystemHealth')?.addEventListener('click',()=>openWorkItem({action:'system-health'}));
 }
}
